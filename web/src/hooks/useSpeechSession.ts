import { useCallback, useRef, useState } from 'react';
import { postTranscript } from '../api/client.ts';
import type { TranscriptChunkView } from '../api/types.ts';
import { rmsFromTimeDomainData, rmsToLevel, classifyLevel, type AudioQuality } from '../lib/audioLevel.ts';

export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopped';

const LEVEL_UPDATE_INTERVAL_MS = 80;
const SPEECH_RMS_THRESHOLD = 0.01;

function getSpeechRecognitionCtor(): typeof SpeechRecognition | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== undefined;
}

// Em mobile (Safari/iOS e Chrome/Android), abrir um getUserMedia próprio pra alimentar o
// medidor de nível ENQUANTO o SpeechRecognition mantém sua própria captura de microfone
// gera dois consumidores de mic simultâneos: no Android a segunda Promise trava para
// sempre sem rejeitar, e no Safari o navegador dispara um segundo prompt de permissão e
// trava esperando por ele. Por isso o medidor visual só roda em desktop.
function isMobileBrowser(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// No Safari/iOS o `continuous: true` não sustenta reconhecimento contínuo de verdade — a
// sessão nativa encerra sozinha após poucos segundos mesmo sem erro. Reiniciar via
// recognition.start() dentro do onend (como fazemos em desktop/Android) não vem de um toque
// novo do usuário, e o Safari empilha um segundo pedido de permissão e trava esperando por
// ele. Por isso no iOS não reiniciamos sozinhos: paramos e deixamos o usuário retomar pelo
// botão "Continuar gravação", que já existe na UI e fornece o gesto síncrono que o Safari exige.
function isIOSBrowser(): boolean {
  return /iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function useSpeechSession(baseUrl: string, sessionId: string) {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const [transcriptChunks, setTranscriptChunks] = useState<TranscriptChunkView[]>([]);
  const [interimText, setInterimText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);
  const [audioQuality, setAudioQuality] = useState<AudioQuality>('silencio');
  const [isCapturingSpeech, setIsCapturingSpeech] = useState(false);

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const listeningRef = useRef(false);
  const streamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const levelLoopIdRef = useRef<number | null>(null);

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
    setIsCapturingSpeech(false);
  }, []);

  const startRecognition = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor();
    if (!Ctor) return;

    const recognition = new Ctor();
    recognition.lang = 'pt-BR';
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onstart = () => {
      setStatus('recording');
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript.trim();
        if (!text) continue;

        if (result.isFinal) {
          setTranscriptChunks((prev) => [...prev, { text, startMs: 0, endMs: 0 }]);
          void postTranscript(baseUrl, sessionId, text).catch((err) => {
            setError(err instanceof Error ? err.message : 'Falha ao salvar transcrição');
          });
        } else {
          interim += text;
        }
      }

      setInterimText(interim);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'not-allowed' || event.error === 'audio-capture' || event.error === 'service-not-allowed') {
        listeningRef.current = false;
        setError('Não foi possível acessar o microfone para reconhecimento de voz.');
        setStatus('stopped');
      }
      // erros como "no-speech"/"network" são tratados pelo restart automático no onend
    };

    recognition.onend = () => {
      if (!listeningRef.current) return;

      if (isIOSBrowser()) {
        listeningRef.current = false;
        recognitionRef.current = null;
        setInterimText('');
        setStatus('stopped');
        return;
      }

      recognition.start();
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [baseUrl, sessionId]);

  const start = useCallback(() => {
    setError(null);

    if (!isSpeechRecognitionSupported()) {
      setError('Este navegador não suporta reconhecimento de voz (Web Speech API).');
      return;
    }

    // recognition.start() precisa rodar de forma síncrona dentro do clique: em
    // Safari/iOS, se só rodar depois de um `await`, o gesto do usuário "expira" e
    // o start() é ignorado sem erro (parece travado).
    listeningRef.current = true;
    setStatus('requesting');
    startRecognition();

    if (isMobileBrowser()) {
      return;
    }

    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        streamRef.current = stream;
        const audioContext = new AudioContext();
        audioContextRef.current = audioContext;
        startLevelMeter(stream, audioContext);
      } catch (err) {
        console.warn('Medidor de nível de áudio indisponível:', err);
      }
    })();
  }, [startLevelMeter, startRecognition]);

  const stop = useCallback(() => {
    listeningRef.current = false;
    recognitionRef.current?.stop();
    recognitionRef.current = null;

    stopLevelMeter();
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    void audioContextRef.current?.close();
    audioContextRef.current = null;

    setInterimText('');
    setStatus('stopped');
  }, [stopLevelMeter]);

  /** Limpa a transcrição acumulada localmente — usar ao trocar de sessão ou começar do zero. */
  const reset = useCallback(() => {
    setTranscriptChunks([]);
    setInterimText('');
    setError(null);
    setStatus('idle');
  }, []);

  return {
    status,
    transcriptChunks,
    interimText,
    error,
    audioLevel,
    audioQuality,
    isCapturingSpeech,
    levelMeterAvailable: !isMobileBrowser(),
    start,
    stop,
    reset,
  };
}
