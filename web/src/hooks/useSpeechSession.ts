import { useCallback, useEffect, useRef, useState } from 'react';
import { postTranscript } from '../api/client.ts';
import type { TranscriptChunkView } from '../api/types.ts';
import { rmsFromTimeDomainData, rmsToLevel, classifyLevel, type AudioQuality } from '../lib/audioLevel.ts';
import {
  blockedStatus,
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
/** Ritmo de fala aproximado em PT-BR, usado só pra estimar quanto durou um trecho. */
const CHARS_PER_SECOND = 14;

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
  const startingSessionRef = useRef(false);
  // stop()/reset() durante os awaits de start(): o start precisa desistir em vez de
  // abrir uma gravação que ninguém mais pediu.
  const abortStartRef = useRef(false);
  const restartTimeoutRef = useRef<number | null>(null);
  const restartAttemptsRef = useRef(0);
  // O ciclo anterior terminou em erro recuperável? Se sim, `onaudiostart` não pode
  // zerar o backoff — senão um erro que ocorre sempre depois do audiostart (rede,
  // tipicamente) faz o teto de tentativas nunca ser alcançado e o restart vira um
  // laço a 300ms.
  const lastCycleErroredRef = useRef(false);
  // Mensagem a usar se as tentativas de restart se esgotarem, quando a causa
  // provável já é conhecida (microfone ocupado) e é mais útil que a genérica.
  const giveUpMessageRef = useRef<string | null>(null);
  // Último aviso posto pela camada de reconhecimento (rede/microfone ocupado).
  // `onaudiostart` só tem direito de limpar este — um "Falha ao salvar transcrição"
  // precisa persistir, porque o relatório é gerado do transcript do backend e uma
  // falha de gravação silenciosa produz relatório truncado.
  const recoverableErrorRef = useRef<string | null>(null);
  const recognitionLiveRef = useRef(false);
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

  // Origem dos tempos da sessão: sobrevive a pausar/continuar, pra que o silêncio
  // entre um trecho e outro seja medido de verdade. Zerado só no reset().
  const sessionOriginRef = useRef<number | null>(null);
  const lastChunkEndRef = useRef(0);

  useEffect(() => {
    baseUrlRef.current = baseUrl;
    sessionIdRef.current = sessionId;
  }, [baseUrl, sessionId]);

  /**
   * A Web Speech API não informa a duração da fala — só entrega o resultado quando
   * a frase termina. O fim é confiável (é agora); o começo é estimado pelo tamanho
   * do texto, o bastante pra distinguir "continuou falando" de "ficou em silêncio",
   * que é o que decide a quebra de parágrafo em `lib/transcriptFlow.ts`.
   */
  const stampChunk = useCallback((text: string) => {
    const now = Date.now();
    if (sessionOriginRef.current === null) sessionOriginRef.current = now;

    const endMs = now - sessionOriginRef.current;
    const spokenMs = Math.round((text.length / CHARS_PER_SECOND) * 1000);
    const startMs = Math.min(endMs, Math.max(lastChunkEndRef.current, endMs - spokenMs));
    lastChunkEndRef.current = endMs;

    return { startMs, endMs };
  }, []);

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

  /** Descarta a instância atual sem encerrar a sessão. Os handlers são anulados antes
   *  do `abort()` porque o abort dispara `onend`, que reagendaria um restart. */
  const discardRecognition = useCallback(() => {
    const recognition = recognitionRef.current;
    recognitionRef.current = null;
    recognitionLiveRef.current = false;
    startingRef.current = false;
    if (!recognition) return;

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
  }, []);

  const teardown = useCallback(() => {
    listeningRef.current = false;
    startingRef.current = false;
    abortStartRef.current = true;
    restartAttemptsRef.current = 0;
    lastCycleErroredRef.current = false;
    giveUpMessageRef.current = null;
    recoverableErrorRef.current = null;
    recognitionLiveRef.current = false;
    clearRestartTimer();

    discardRecognition();

    releaseAudioResources();
    void wakeLockRef.current.release();
    setInterimText('');
    setIsCapturingSpeech(false);
  }, [clearRestartTimer, discardRecognition, releaseAudioResources]);

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

    if (!showLevelMeter && document.visibilityState !== 'visible') {
      // Só o mobile fica impedido de capturar em segundo plano; reiniciar ali só
      // queimaria o orçamento de tentativas. O handler de visibilitychange retoma
      // na volta. No desktop o reconhecimento segue normalmente em aba de fundo.
      clearRestartTimer();
      return;
    }

    if (restartAttemptsRef.current >= MAX_RESTART_ATTEMPTS) {
      failWith(
        giveUpMessageRef.current ??
          'Não foi possível manter a captura de áudio. Verifique o microfone e comece a gravar de novo.',
      );
      return;
    }

    const delay = Math.min(RESTART_BASE_DELAY_MS * 2 ** restartAttemptsRef.current, RESTART_MAX_DELAY_MS);
    restartAttemptsRef.current += 1;

    clearRestartTimer();
    restartTimeoutRef.current = window.setTimeout(() => {
      restartTimeoutRef.current = null;
      startRecognitionRef.current();
    }, delay);
  }, [clearRestartTimer, failWith, showLevelMeter]);

  const setRecoverableError = useCallback((message: string) => {
    recoverableErrorRef.current = message;
    setError(message);
  }, []);

  const startRecognition = useCallback(() => {
    if (!listeningRef.current || startingRef.current || recognitionLiveRef.current) return;

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
      lastCycleErroredRef.current = false;

      let interim = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0]?.transcript.trim();
        if (!text) continue;

        if (result.isFinal) {
          const timing = stampChunk(text);
          setTranscriptChunks((prev) => [...prev, { text, ...timing }]);
          void postTranscript(baseUrlRef.current, sessionIdRef.current, text, undefined, timing).catch((err) => {
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
      if (!lastCycleErroredRef.current) restartAttemptsRef.current = 0;
      lastCycleErroredRef.current = false;
      giveUpMessageRef.current = null;
      // Fotografar o ref antes de anula-lo: o updater do setError pode rodar num
      // render posterior, quando `recoverableErrorRef.current` ja seria null e a
      // comparacao falharia, deixando o aviso na tela depois da recuperacao.
      const recoverable = recoverableErrorRef.current;
      recoverableErrorRef.current = null;
      setError((current) => (current !== null && current === recoverable ? null : current));
    };

    recognition.onspeechstart = () => {
      if (!showLevelMeter) setIsCapturingSpeech(true);
    };
    recognition.onspeechend = () => {
      if (!showLevelMeter) setIsCapturingSpeech(false);
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      // 'no-speech' e 'aborted' fazem parte da operação normal: o navegador encerra
      // sozinho e o onend reinicia.
      if (event.error === 'no-speech' || event.error === 'aborted') return;

      if (event.error === 'network') {
        lastCycleErroredRef.current = true;
        giveUpMessageRef.current =
          'Não foi possível conectar ao serviço de reconhecimento de voz. Verifique sua conexão e comece a gravar de novo.';
        setRecoverableError('Conexão instável com o serviço de reconhecimento. Tentando de novo...');
        return;
      }

      if (event.error === 'audio-capture') {
        // O dispositivo pode só não ter sido liberado ainda (o caminho mobile para
        // as tracks do getUserMedia logo antes de iniciar o reconhecimento). Deixar
        // o backoff tentar de novo; se esgotar, a mensagem abaixo explica melhor
        // que a genérica.
        lastCycleErroredRef.current = true;
        giveUpMessageRef.current = describeMicIssue('mic-busy');
        setRecoverableError('Aguardando o microfone ficar disponível...');
        return;
      }

      const issue = mapRecognitionError(event.error);
      if (issue !== 'unknown') setMicStatus(blockedStatus(issue));
      failWith(issue === 'unknown' ? `O reconhecimento de voz falhou (${event.error}).` : describeMicIssue(issue));
    };

    recognition.onend = () => {
      startingRef.current = false;
      recognitionLiveRef.current = false;
      setIsCapturingSpeech(false);
      if (!listeningRef.current) return;
      scheduleRestart();
    };

    recognitionRef.current = recognition;
    startingRef.current = true;

    try {
      recognition.start();
      recognitionLiveRef.current = true;
    } catch {
      // O navegador pode recusar o start (instância anterior ainda encerrando no
      // motor, permissão em transição): deixar o backoff tentar de novo.
      startingRef.current = false;
      scheduleRestart();
    }
  }, [failWith, scheduleRestart, setRecoverableError, showLevelMeter, stampChunk]);

  useEffect(() => {
    startRecognitionRef.current = startRecognition;
  }, [startRecognition]);

  const start = useCallback(async () => {
    // Um segundo toque durante o await de detectMicrophone()/getUserMedia abriria
    // um segundo MediaStream e um segundo loop de medidor, órfãos e impossíveis de
    // parar. Nessa janela `status` ainda é 'idle' e o botão segue clicável, então a
    // guarda precisa estar aqui.
    if (startingSessionRef.current || listeningRef.current) return;
    startingSessionRef.current = true;
    abortStartRef.current = false;

    try {
      setError(null);

      const detected = await detectMicrophone();
      if (abortStartRef.current) return;
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
        setMicStatus(blockedStatus(issue));
        setError(describeMicIssue(issue));
        setStatus('idle');
        return;
      }

      if (abortStartRef.current) {
        // A sessão foi encerrada enquanto o prompt de permissão estava aberto: soltar
        // o dispositivo em vez de abrir uma gravação que ninguém pediu.
        stream.getTracks().forEach((track) => track.stop());
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
        if (abortStartRef.current) {
          // Quarto ponto de suspensao: um teardown aqui ja soltou os refs, entao a
          // continuacao ligaria o medidor num contexto fechado.
          releaseAudioResources();
          return;
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
    } finally {
      startingSessionRef.current = false;
    }
  }, [releaseAudioResources, showLevelMeter, startLevelMeter, startRecognition]);

  const stop = useCallback(() => {
    teardown();
    setStatus('stopped');
  }, [teardown]);

  /** Limpa a transcrição acumulada localmente — só quem chama decide quando. Parar a
   *  gravação NÃO passa por aqui: `stop()` mantém o transcript pra continuar de onde
   *  parou ou gerar o relatório. Usar ao descartar a gravação ou trocar de sessão. */
  const reset = useCallback(() => {
    teardown();
    setTranscriptChunks([]);
    setError(null);
    setStatus('idle');
    sessionOriginRef.current = null;
    lastChunkEndRef.current = 0;
  }, [teardown]);

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState !== 'visible' || !listeningRef.current) return;

      // O mobile encerra o reconhecimento e solta o wake lock quando a aba vai pro
      // segundo plano. Ao voltar, retomar os dois sem esperar o backoff.
      void wakeLockRef.current.acquire();
      restartAttemptsRef.current = 0;
      lastCycleErroredRef.current = false;

      if (!showLevelMeter) {
        // O mobile pode suspender a aba e matar o reconhecimento sem entregar `end`,
        // deixando `recognitionLiveRef` preso em true — a sessão ficaria "gravando"
        // sem capturar nada, para sempre. Forçar um ciclo limpo custa menos que
        // confiar no ref.
        discardRecognition();
        clearRestartTimer();
        startRecognitionRef.current();
        return;
      }

      if (!recognitionLiveRef.current) {
        clearRestartTimer();
        startRecognitionRef.current();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [clearRestartTimer, discardRecognition, showLevelMeter]);

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
