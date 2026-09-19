import { useCallback, useEffect, useRef, useState } from 'react';
import { postTranscript } from '../api/client.ts';
import type { TranscriptChunkView } from '../api/types.ts';
import { rmsFromTimeDomainData, rmsToLevel, classifyLevel, type AudioQuality } from '../lib/audioLevel.ts';
import {
  createSpeechRecognition,
  describeMicIssue,
  detectMicrophone,
  mapGetUserMediaError,
  mapRecognitionError,
  supportsLevelMeter,
  type MicStatus,
} from '../lib/micSupport.ts';
import { createScreenWakeLock } from '../lib/wakeLock.ts';

export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopped';

const LEVEL_UPDATE_INTERVAL_MS = 80;
const SPEECH_RMS_THRESHOLD = 0.01;
const RESTART_BASE_DELAY_MS = 300;
const RESTART_MAX_DELAY_MS = 5000;
const MAX_RESTART_ATTEMPTS = 8;

export function useSpeechSession(baseUrl: string, sessionId: string) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunkView[]>([]);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioQuality, setAudioQuality] = useState<AudioQuality>('silencio');
  const [isCapturingSpeech, setIsCapturingSpeech] = useState(false);
  const [micStatus, setMicStatus] = useState<MicStatus>({ kind: 'checking' });
  const [showLevelMeter] = useState(() => supportsLevelMeter());

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listeningRef = useRef(false);
  const startingRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);
  const restartAttemptsRef = useRef(0);
  const startRecognitionRef = useRef<() => void>(() => {});
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelLoopIdRef = useRef<number | null>(null);
  const wakeLockRef = useRef(createScreenWakeLock());

  // Uma instância de reconhecimento já em execução precisa postar sempre na sessão
  // atual, não na que estava ativa quando ela foi criada.
  const baseUrlRef = useRef(baseUrl);
  const sessionIdRef = useRef(sessionId);

  useEffect(() => {
    baseUrlRef.current = baseUrl;
    sessionIdRef.current = sessionId;
  }, [baseUrl, sessionId]);

  const refreshMicStatus = useCallback(async () => {
    setMicStatus(await detectMicrophone());
  }, []);

  useEffect(() => {
    let active = true;

    const check = () => {
      void detectMicrophone().then((result) => {
        if (active) setMicStatus(result);
      });
    };

    check();

    const devices = navigator.mediaDevices;
    devices?.addEventListener('devicechange', check);

    return () => {
      active = false;
      devices?.removeEventListener('devicechange', check);
    };
  }, []);

  const startLevelMeter = useCallback((stream: MediaStream, audioContext: AudioContext) => {
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 1024;
    source.connect(analyser);
    analyserRef.current = analyser;

    const data = new Float32Array(analyser.fftSize);
    let lastUpdate = 0;

    const loop = (time: number) => {
      levelLoopIdRef.current = requestAnimationFrame(loop);
      if (time - lastUpdate < LEVEL_UPDATE_INTERVAL_MS) return;
      lastUpdate = time;

      analyser.getFloatTimeDomainData(data);
      const rms = rmsFromTimeDomainData(data);
      const level = rmsToLevel(rms);
      setAudioLevel(level);
      setAudioQuality(classifyLevel(level));
      setIsCapturingSpeech(rms >= SPEECH_RMS_THRESHOLD);
    };

    levelLoopIdRef.current = requestAnimationFrame(loop);
  }, []);

  const stopLevelMeter = useCallback(() => {
    if (levelLoopIdRef.current !== null) {
      cancelAnimationFrame(levelLoopIdRef.current);
      levelLoopIdRef.current = null;
    }
    analyserRef.current?.disconnect();
    analyserRef.current = null;
    setAudioLevel(0);
    setAudioQuality('silencio');
  }, []);

  const releaseAudioResources = useCallback(() => {
    stopLevelMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;
  }, [stopLevelMeter]);

  const clearRestartTimer = useCallback(() => {
    if (restartTimeoutRef.current !== null) {
      clearTimeout(restartTimeoutRef.current);
      restartTimeoutRef.current = null;
    }
  }, []);

  const teardown = useCallback(() => {
    listeningRef.current = false;
    startingRef.current = false;
    restartAttemptsRef.current = 0;
    clearRestartTimer();

    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    if (recognition) {
      // Zerar os handlers antes de abortar: o abort dispara onend, que reagendaria
      // um restart se o handler ainda estivesse instalado.
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      recognition.onaudiostart = null;
      recognition.onspeechstart = null;
      recognition.onspeechend = null;
      try {
        recognition.abort();
      } catch {
        // Instância já encerrada.
      }
    }

    releaseAudioResources();
    void wakeLockRef.current.release();
    setInterimText('');
    setIsCapturingSpeech(false);
  }, [clearRestartTimer, releaseAudioResources]);

  const failWith = useCallback(
    (message: string) => {
      teardown();
      setError(message);
      setStatus('stopped');
    },
    [teardown],
  );

  const scheduleRestart = useCallback(() => {
    if (!listeningRef.current) return;

    if (restartAttemptsRef.current >= MAX_RESTART_ATTEMPTS) {
      failWith('Não foi possível manter a captura de áudio. Verifique o microfone e comece a gravar de novo.');
      return;
    }

    const delay = Math.min(RESTART_BASE_DELAY_MS * 2 ** restartAttemptsRef.current, RESTART_MAX_DELAY_MS);
    restartAttemptsRef.current += 1;

    clearRestartTimer();
    restartTimeoutRef.current = window.setTimeout(() => {
      restartTimeoutRef.current = null;
      startRecognitionRef.current();
    }, delay);
  }, [clearRestartTimer, failWith]);

  const startRecognition = useCallback(() => {
    if (!listeningRef.current || startingRef.current) return;

    const recognition = createSpeechRecognition();
    if (!recognition) {
      failWith(describeMicIssue('no-speech-recognition'));
      return;
    }

    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      restartAttemptsRef.current = 0;

      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript.trim();
        if (!text) continue;

        if (result.isFinal) {
          setTranscriptChunks((prev) => [...prev, { text, startMs: 0, endMs: 0 }]);
          void postTranscript(baseUrlRef.current, sessionIdRef.current, text).catch((err) => {
            setError(err instanceof Error ? err.message : 'Falha ao salvar transcrição');
          });
        } else {
          interim += text;
        }
      }

      setInterimText(interim);
    };

    recognition.onaudiostart = () => {
      // A captura de áudio começou de fato: o microfone é nosso e o ciclo está
      // saudável. Zerar o backoff — o encerramento periódico em silêncio é normal
      // e não pode consumir o teto de tentativas.
      startingRef.current = false;
      restartAttemptsRef.current = 0;
    };

    recognition.onspeechstart = () => setIsCapturingSpeech(true);
    recognition.onspeechend = () => setIsCapturingSpeech(false);

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' e 'aborted' fazem parte da operação normal: o navegador encerra
      // sozinho e o onend reinicia.
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      if (event.error === 'network') {
        setError('Conexão instável com o serviço de reconhecimento. Tentando de novo...');
        return;
      }

      const issue = mapRecognitionError(event.error);
      failWith(issue === 'unknown' ? `O reconhecimento de voz falhou (${event.error}).` : describeMicIssue(issue));
    };

    recognition.onend = () => {
      startingRef.current = false;
      setIsCapturingSpeech(false);
      if (!listeningRef.current) return;
      scheduleRestart();
    };

    recognitionRef.current = recognition;
    startingRef.current = true;

    try {
      recognition.start();
    } catch {
      // InvalidStateError: a instância anterior ainda não encerrou de verdade.
      startingRef.current = false;
      scheduleRestart();
    }
  }, [failWith, scheduleRestart]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const start = useCallback(async () => {
    setError(null);

    const detected = await detectMicrophone();
    setMicStatus(detected);
    if (detected.kind === 'blocked') {
      setError(detected.message);
      return;
    }

    setStatus('requesting');

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
    } catch (err) {
      const issue = mapGetUserMediaError(err);
      const message = describeMicIssue(issue);
      setMicStatus({ kind: 'blocked', issue, message });
      setError(message);
      setStatus('idle');
      return;
    }

    if (showLevelMeter) {
      // No desktop o microfone é compartilhado entre o medidor e o reconhecimento.
      streamRef.current = stream;
      const audioContext = new AudioContext();
      audioContextRef.current = audioContext;
      if (audioContext.state === 'suspended') {
        await audioContext.resume().catch(() => undefined);
      }
      startLevelMeter(stream, audioContext);
    } else {
      // Android e iOS dão acesso exclusivo ao microfone: manter este MediaStream
      // aberto faria o SpeechRecognition não capturar absolutamente nada.
      stream.getTracks().forEach((track) => track.stop());
    }

    listeningRef.current = true;
    restartAttemptsRef.current = 0;
    setStatus('recording');
    startRecognition();
    void wakeLockRef.current.acquire();
  }, [showLevelMeter, startLevelMeter, startRecognition]);

  const stop = useCallback(() => {
    teardown();
    setStatus('stopped');
  }, [teardown]);

  /** Limpa a transcrição acumulada localmente — usar ao trocar de sessão ou começar do zero. */
  const reset = useCallback(() => {
    teardown();
    setTranscriptChunks([]);
    setError(null);
    setStatus('idle');
  }, [teardown]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !listeningRef.current) return;

      // O mobile encerra o reconhecimento e solta o wake lock quando a aba vai pro
      // segundo plano. Ao voltar, retomar os dois sem esperar o backoff.
      void wakeLockRef.current.acquire();
      restartAttemptsRef.current = 0;

      if (restartTimeoutRef.current !== null) {
        clearRestartTimer();
        startRecognitionRef.current();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clearRestartTimer]);

  useEffect(() => teardown, [teardown]);

  return {
    status,
    transcriptChunks,
    interimText,
    error,
    audioLevel,
    audioQuality,
    isCapturingSpeech,
    micStatus,
    showLevelMeter,
    start,
    stop,
    reset,
    refreshMicStatus,
  };
}
