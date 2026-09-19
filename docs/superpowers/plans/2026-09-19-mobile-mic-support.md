# Suporte a Mobile e Validação de Microfone — Plano de Implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer a transcrição por voz funcionar em navegador mobile (hoje a aba congela e nada é capturado) e bloquear a gravação com mensagem acionável quando o dispositivo não tem microfone utilizável.

**Architecture:** A causa raiz é contenção de microfone — o `MediaStream` que alimenta o medidor de nível fica aberto e impede o `SpeechRecognition` de capturar áudio no mobile, e o handler de `onend` reinicia o reconhecimento em laço síncrono infinito, congelando a aba. A correção libera as tracks do microfone antes de iniciar o reconhecimento em dispositivos móveis (o medidor passa a ser exclusivo de desktop), substitui o restart direto por um agendador com backoff exponencial e teto de tentativas, e acrescenta um módulo de detecção de capacidade do dispositivo consumido pela UI.

**Tech Stack:** React 19, TypeScript, Vite 8, Web Speech API, Web Audio API, Screen Wake Lock API, oxlint.

**Spec:** `docs/superpowers/specs/2026-09-19-mobile-mic-support-design.md`

## Global Constraints

- Todo o trabalho acontece em `web/`. O backend não muda — o CORS já é `origin: true` em `src/server.ts:24`.
- **Não existe camada de testes no frontend e ela não deve ser reintroduzida.** O `CLAUDE.md` do projeto registra que foi removida deliberadamente. A verificação de cada tarefa é `npm run typecheck` + `npm run lint` dentro de `web/`, mais o roteiro manual da Tarefa 7. Não instale vitest, jest, testing-library nem crie arquivos `*.test.ts(x)`.
- Nenhuma dependência nova de npm.
- `tsconfig.app.json` usa `verbatimModuleSyntax: true` — importações só de tipo precisam de `import type`.
- `tsconfig.app.json` usa `erasableSyntaxOnly: true` — proibido `enum` e propriedades de parâmetro de construtor. Use uniões de string literal.
- `tsconfig.app.json` usa `noUnusedLocals` e `noUnusedParameters` — nada declarado sem uso.
- Importações relativas incluem a extensão `.ts`/`.tsx` (padrão vigente do repositório).
- Todo texto visível ao usuário em português do Brasil.
- Mensagens de commit sem `Co-Authored-By` e sem rodapé de ferramenta (regra global do usuário em `~/.claude/CLAUDE.md`).
- Rode os comandos de verificação a partir de `web/`.

---

### Task 1: Módulo de detecção de microfone

**Files:**
- Create: `web/src/lib/micSupport.ts`

**Interfaces:**
- Consumes: nada (é a base).
- Produces:
  - `type MicIssue = 'insecure-context' | 'no-media-devices' | 'no-speech-recognition' | 'ios-standalone-pwa' | 'no-audio-input' | 'permission-denied' | 'mic-busy' | 'unknown'`
  - `type MicStatus = { kind: 'checking' } | { kind: 'ready' } | { kind: 'blocked'; issue: MicIssue; message: string }`
  - `describeMicIssue(issue: MicIssue): string`
  - `blockedStatus(issue: MicIssue): MicStatus`
  - `isSpeechRecognitionSupported(): boolean`
  - `createSpeechRecognition(): SpeechRecognition | null`
  - `supportsLevelMeter(): boolean`
  - `mapGetUserMediaError(error: unknown): MicIssue`
  - `mapRecognitionError(error: string): MicIssue`
  - `detectMicrophone(): Promise<MicStatus>`

- [ ] **Step 1: Criar `web/src/lib/micSupport.ts`**

```ts
export type MicIssue =
  | 'insecure-context'
  | 'no-media-devices'
  | 'no-speech-recognition'
  | 'ios-standalone-pwa'
  | 'no-audio-input'
  | 'permission-denied'
  | 'mic-busy'
  | 'unknown';

export type MicStatus =
  | { kind: 'checking' }
  | { kind: 'ready' }
  | { kind: 'blocked'; issue: MicIssue; message: string };

const ISSUE_MESSAGES: Record<MicIssue, string> = {
  'insecure-context':
    'O navegador só libera o microfone em conexões seguras. Abra o app por HTTPS (ou em localhost) — endereços http:// na rede local não funcionam.',
  'no-media-devices':
    'Este navegador não expõe acesso ao microfone. Abra o app por HTTPS em um navegador atualizado.',
  'no-speech-recognition':
    'Este navegador não suporta reconhecimento de voz (Web Speech API). Use o Chrome no Android ou o Safari no iPhone.',
  'ios-standalone-pwa':
    'O reconhecimento de voz não funciona no app instalado na tela de início do iPhone. Abra o mesmo endereço pelo Safari.',
  'no-audio-input':
    'Nenhum microfone foi detectado neste dispositivo. Conecte um microfone e toque em "Verificar de novo".',
  'permission-denied':
    'O acesso ao microfone está bloqueado. Libere o microfone para este site nas permissões do navegador e toque em "Verificar de novo".',
  'mic-busy':
    'O microfone está sendo usado por outro app. Encerre chamadas ou gravadores abertos e tente de novo.',
  unknown: 'Não foi possível acessar o microfone.',
};

export function describeMicIssue(issue: MicIssue): string {
  return ISSUE_MESSAGES[issue];
}

export function blockedStatus(issue: MicIssue): MicStatus {
  return { kind: 'blocked', issue, message: describeMicIssue(issue) };
}

function getSpeechRecognitionCtor(): typeof SpeechRecognition | undefined {
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function isSpeechRecognitionSupported(): boolean {
  return getSpeechRecognitionCtor() !== undefined;
}

export function createSpeechRecognition(): SpeechRecognition | null {
  const Ctor = getSpeechRecognitionCtor();
  return Ctor ? new Ctor() : null;
}

function isIos(): boolean {
  const ua = navigator.userAgent;
  // iPadOS 13+ se declara como Macintosh; maxTouchPoints desambigua.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

function isStandaloneDisplay(): boolean {
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iosStandalone || window.matchMedia('(display-mode: standalone)').matches;
}

/**
 * O medidor de nível precisa segurar um MediaStream aberto, e no Android/iOS isso
 * rouba o microfone do SpeechRecognition — que então não captura nada. Só habilitar
 * onde os dois consumidores convivem (desktop).
 */
export function supportsLevelMeter(): boolean {
  return window.matchMedia('(pointer: fine)').matches && navigator.maxTouchPoints === 0;
}

function errorName(error: unknown): string {
  if (typeof error === 'object' && error !== null && 'name' in error) {
    return String((error as { name: unknown }).name);
  }
  return '';
}

export function mapGetUserMediaError(error: unknown): MicIssue {
  switch (errorName(error)) {
    case 'NotAllowedError':
      return 'permission-denied';
    case 'NotFoundError':
    case 'OverconstrainedError':
      return 'no-audio-input';
    case 'NotReadableError':
    case 'AbortError':
      return 'mic-busy';
    case 'SecurityError':
      return 'insecure-context';
    default:
      return 'unknown';
  }
}

export function mapRecognitionError(error: string): MicIssue {
  switch (error) {
    case 'not-allowed':
    case 'service-not-allowed':
      return 'permission-denied';
    case 'audio-capture':
      return 'mic-busy';
    default:
      return 'unknown';
  }
}

/** Checagem de capacidade que NÃO pede permissão — roda na montagem da tela. */
export async function detectMicrophone(): Promise<MicStatus> {
  if (!window.isSecureContext) return blockedStatus('insecure-context');
  if (!navigator.mediaDevices?.getUserMedia) return blockedStatus('no-media-devices');

  if (!isSpeechRecognitionSupported()) {
    return blockedStatus(isIos() && isStandaloneDisplay() ? 'ios-standalone-pwa' : 'no-speech-recognition');
  }

  try {
    const devices = await navigator.mediaDevices.enumerateDevices();
    // Alguns navegadores devolvem lista vazia antes de qualquer permissão — isso
    // não prova ausência de microfone, só a lista populada sem 'audioinput' prova.
    if (devices.length > 0 && !devices.some((device) => device.kind === 'audioinput')) {
      return blockedStatus('no-audio-input');
    }
  } catch {
    // enumerateDevices pode falhar sem permissão; não é conclusivo.
  }

  try {
    const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
    if (permission.state === 'denied') return blockedStatus('permission-denied');
  } catch {
    // Safari lança para o nome 'microphone'; seguir sem essa informação.
  }

  return { kind: 'ready' };
}
```

- [ ] **Step 2: Verificar typecheck e lint**

```bash
cd web && npm run typecheck && npm run lint
```

Esperado: ambos terminam sem saída de erro (exit 0). O módulo ainda não é importado por ninguém — isso é esperado e não gera erro, porque `noUnusedLocals` só reclama de símbolos não usados dentro do arquivo.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/micSupport.ts
git commit -m "Adiciona deteccao de capacidade de microfone no frontend"
```

---

### Task 2: Wrapper de Screen Wake Lock

**Files:**
- Create: `web/src/lib/wakeLock.ts`

**Interfaces:**
- Consumes: nada.
- Produces: `createScreenWakeLock(): { acquire(): Promise<void>; release(): Promise<void> }`

**Por quê:** sem wake lock a tela do celular apaga durante a reunião, o navegador suspende a aba e a captura morre no meio da sessão.

- [ ] **Step 1: Criar `web/src/lib/wakeLock.ts`**

```ts
type WakeLockSentinelLike = {
  readonly released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

/**
 * Mantém a tela acesa durante a gravação. Sem isto o celular bloqueia a tela, o
 * navegador suspende a aba e o reconhecimento de voz para no meio da sessão.
 * A API não existe em todo navegador — toda falha é degradação silenciosa.
 */
export function createScreenWakeLock() {
  let sentinel: WakeLockSentinelLike | null = null;

  async function acquire(): Promise<void> {
    const api = (navigator as WakeLockNavigator).wakeLock;
    if (!api) return;
    if (sentinel && !sentinel.released) return;

    sentinel = null;
    try {
      sentinel = await api.request('screen');
    } catch {
      // Não suportado, negado, ou aba em segundo plano.
      sentinel = null;
    }
  }

  async function release(): Promise<void> {
    const current = sentinel;
    sentinel = null;
    if (!current || current.released) return;

    try {
      await current.release();
    } catch {
      // Já liberado pelo navegador.
    }
  }

  return { acquire, release };
}
```

Nota: o tipo é declarado localmente em vez de depender de `WakeLockSentinel` da lib DOM, para o arquivo compilar independentemente da versão do `lib.dom.d.ts`.

- [ ] **Step 2: Verificar typecheck e lint**

```bash
cd web && npm run typecheck && npm run lint
```

Esperado: exit 0, sem erros.

- [ ] **Step 3: Commit**

```bash
git add web/src/lib/wakeLock.ts
git commit -m "Adiciona wrapper de screen wake lock"
```

---

### Task 3: Reescrever o ciclo de vida do `useSpeechSession`

**Files:**
- Modify: `web/src/hooks/useSpeechSession.ts` (substituição integral do arquivo)

**Interfaces:**
- Consumes: tudo da Tarefa 1 e `createScreenWakeLock` da Tarefa 2. Mantém `postTranscript` de `../api/client.ts`, `TranscriptChunkView` de `../api/types.ts` e os helpers de `../lib/audioLevel.ts`.
- Produces: `useSpeechSession(baseUrl: string, sessionId: string)` retornando o objeto existente (`status`, `transcriptChunks`, `interimText`, `error`, `audioLevel`, `audioQuality`, `isCapturingSpeech`, `start`, `stop`, `reset`) acrescido de:
  - `micStatus: MicStatus`
  - `showLevelMeter: boolean`
  - `refreshMicStatus: () => Promise<void>`
  - `export type RecordingStatus = 'idle' | 'requesting' | 'recording' | 'stopped'` (inalterado)
  - `isSpeechRecognitionSupported` **deixa de ser exportada daqui** — passou para `../lib/micSupport.ts`. Nenhum outro arquivo a importava (só o uso interno na linha 125 do arquivo antigo).

**Mudanças de comportamento que importam:**

1. No mobile (`showLevelMeter === false`) as tracks do `getUserMedia` são paradas **antes** do `SpeechRecognition.start()`. É a correção do bug.
2. `onend` nunca mais chama `start()` direto — passa por `scheduleRestart()` com backoff `min(300 * 2 ** tentativas, 5000)` ms e teto de 8 tentativas consecutivas.
3. `onaudiostart` zera o contador de tentativas: se a captura de áudio realmente começou, o ciclo está saudável. Isso é o que distingue o silêncio normal (o Chrome encerra sozinho o tempo todo e precisa reiniciar para sempre) do bug de contenção (a captura nunca começa).
4. `baseUrl`/`sessionId` passam a ser lidos por ref, para uma instância de reconhecimento já em execução nunca postar em uma sessão antiga.

- [ ] **Step 1: Substituir integralmente `web/src/hooks/useSpeechSession.ts`**

```ts
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
```

- [ ] **Step 2: Verificar typecheck e lint**

```bash
cd web && npm run typecheck && npm run lint
```

Esperado: exit 0. Se `tsc` reclamar de `isSpeechRecognitionSupported` não existir, algum arquivo ainda importa a versão antiga — corrija o import para `../lib/micSupport.ts`.

- [ ] **Step 3: Commit**

```bash
git add web/src/hooks/useSpeechSession.ts
git commit -m "Libera o microfone para o reconhecimento no mobile e agenda restarts com backoff"
```

---

### Task 4: Componentes de aviso e de atividade de fala

**Files:**
- Create: `web/src/components/MicStatusNotice.tsx`
- Create: `web/src/components/SpeechActivityIndicator.tsx`

**Interfaces:**
- Consumes: `MicStatus` de `../lib/micSupport.ts` (Tarefa 1).
- Produces:
  - `MicStatusNotice({ status, onRecheck }: { status: MicStatus; onRecheck: () => Promise<void> })`
  - `SpeechActivityIndicator({ isCapturingSpeech, hasInterimText }: { isCapturingSpeech: boolean; hasInterimText: boolean })`

- [ ] **Step 1: Criar `web/src/components/MicStatusNotice.tsx`**

```tsx
import { useState } from 'react';
import type { MicStatus } from '../lib/micSupport.ts';

type Props = {
  status: MicStatus;
  onRecheck: () => Promise<void>;
};

export function MicStatusNotice({ status, onRecheck }: Props) {
  const [rechecking, setRechecking] = useState(false);

  if (status.kind !== 'blocked') return null;

  async function handleRecheck() {
    setRechecking(true);
    try {
      await onRecheck();
    } finally {
      setRechecking(false);
    }
  }

  return (
    <div className="notice" role="alert">
      <p className="notice__title">Microfone indisponível</p>
      <p className="notice__message">{status.message}</p>
      <button type="button" className="secondary" onClick={() => void handleRecheck()} disabled={rechecking}>
        {rechecking ? 'Verificando...' : 'Verificar de novo'}
      </button>
    </div>
  );
}
```

O `useState` fica **antes** do `return null` — inverter a ordem quebra a regra dos hooks e o oxlint (`react/rules-of-hooks`) falha.

- [ ] **Step 2: Criar `web/src/components/SpeechActivityIndicator.tsx`**

```tsx
type Props = {
  isCapturingSpeech: boolean;
  hasInterimText: boolean;
};

/** Substitui o medidor de nível no mobile, onde segurar o microfone para medir RMS
 *  impediria o reconhecimento de voz de funcionar. */
export function SpeechActivityIndicator({ isCapturingSpeech, hasInterimText }: Props) {
  const active = isCapturingSpeech || hasInterimText;

  return (
    <div className={active ? 'speech-activity speech-activity--active' : 'speech-activity'} role="status">
      <span className="speech-activity__dot" aria-hidden="true" />
      <span>{active ? 'Captando fala' : 'Ouvindo — pode falar'}</span>
    </div>
  );
}
```

- [ ] **Step 3: Verificar typecheck e lint**

```bash
cd web && npm run typecheck && npm run lint
```

Esperado: exit 0.

- [ ] **Step 4: Commit**

```bash
git add web/src/components/MicStatusNotice.tsx web/src/components/SpeechActivityIndicator.tsx
git commit -m "Adiciona aviso de microfone indisponivel e indicador de fala"
```

---

### Task 5: Ligar os componentes ao `Recorder` e ao `App`

**Files:**
- Modify: `web/src/components/Recorder.tsx`
- Modify: `web/src/App.tsx`

**Interfaces:**
- Consumes: `micStatus`, `showLevelMeter` e `refreshMicStatus` do hook (Tarefa 3); os dois componentes da Tarefa 4.
- Produces: `Recorder` passa a receber duas props novas — `micBlocked: boolean` e `showLevelMeter: boolean`.

- [ ] **Step 1: Substituir integralmente `web/src/components/Recorder.tsx`**

```tsx
import type { RecordingStatus } from '../hooks/useSpeechSession.ts';
import type { TranscriptChunkView } from '../api/types.ts';
import type { AudioQuality } from '../lib/audioLevel.ts';
import { LevelMeter } from './LevelMeter.tsx';
import { SpeechActivityIndicator } from './SpeechActivityIndicator.tsx';

const MIN_TRANSCRIPT_CHARS = 30;

type Props = {
  status: RecordingStatus;
  transcriptChunks: TranscriptChunkView[];
  interimText: string;
  error: string | null;
  audioLevel: number;
  audioQuality: AudioQuality;
  isCapturingSpeech: boolean;
  micBlocked: boolean;
  showLevelMeter: boolean;
  onStart: () => void;
  onStop: () => void;
  onReset: () => void;
  onFinalize: () => void;
  finalizing: boolean;
};

export function Recorder({
  status,
  transcriptChunks,
  interimText,
  error,
  audioLevel,
  audioQuality,
  isCapturingSpeech,
  micBlocked,
  showLevelMeter,
  onStart,
  onStop,
  onReset,
  onFinalize,
  finalizing,
}: Props) {
  const transcriptLength = transcriptChunks.reduce((total, chunk) => total + chunk.text.length, 0);
  const hasMinimumContent = transcriptLength >= MIN_TRANSCRIPT_CHARS;
  const hasExistingRecording = status === 'stopped' && transcriptChunks.length > 0;

  return (
    <div className="card">
      <h2>Gravação</h2>

      <div className="recorder-controls">
        {status === 'idle' ? (
          <button type="button" onClick={onStart} disabled={micBlocked}>
            Começar a gravar
          </button>
        ) : null}

        {hasExistingRecording ? (
          <>
            <button type="button" onClick={onStart} disabled={micBlocked}>
              Continuar gravação
            </button>
            <button type="button" className="secondary" onClick={onReset}>
              Resetar e começar do zero
            </button>
          </>
        ) : null}

        {status === 'stopped' && transcriptChunks.length === 0 ? (
          <button type="button" onClick={onStart} disabled={micBlocked}>
            Começar a gravar
          </button>
        ) : null}

        {status === 'recording' ? (
          <button type="button" className="danger" onClick={onStop}>
            Parar gravação
          </button>
        ) : null}
        {status === 'requesting' ? <span>Pedindo acesso ao microfone...</span> : null}
      </div>

      {status === 'recording' ? (
        showLevelMeter ? (
          <LevelMeter level={audioLevel} quality={audioQuality} isCapturingSpeech={isCapturingSpeech} />
        ) : (
          <SpeechActivityIndicator isCapturingSpeech={isCapturingSpeech} hasInterimText={interimText.length > 0} />
        )
      ) : null}

      {error ? <p className="error">{error}</p> : null}

      <div className="transcript">
        {transcriptChunks.length === 0 && !interimText ? (
          <p className="muted">A transcrição aparece aqui conforme você fala.</p>
        ) : (
          <ul>
            {transcriptChunks.map((chunk, index) => (
              <li key={index}>
                {chunk.speaker ? <strong>{chunk.speaker}: </strong> : null}
                {chunk.text}
              </li>
            ))}
            {interimText ? <li className="muted">{interimText}</li> : null}
          </ul>
        )}
      </div>

      <p className="disclaimer">
        {hasMinimumContent
          ? 'Conteúdo suficiente para gerar o relatório.'
          : `É preciso gravar pelo menos ${MIN_TRANSCRIPT_CHARS} caracteres de transcrição antes de gerar o relatório (atual: ${transcriptLength}).`}
      </p>

      <button type="button" onClick={onFinalize} disabled={status === 'recording' || finalizing || !hasMinimumContent}>
        {finalizing ? 'Gerando relatório...' : 'Gerar relatório'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Em `web/src/App.tsx`, adicionar o import do aviso**

Logo depois da linha `import { Recorder } from './components/Recorder.tsx';`, acrescentar:

```tsx
import { MicStatusNotice } from './components/MicStatusNotice.tsx';
```

- [ ] **Step 3: Em `web/src/App.tsx`, renderizar o aviso acima das telas**

Substituir esta linha dentro de `<main className="app__main">`:

```tsx
        {flowError ? <p className="error">{flowError}</p> : null}
```

por:

```tsx
        {flowError ? <p className="error">{flowError}</p> : null}

        <MicStatusNotice status={audio.micStatus} onRecheck={audio.refreshMicStatus} />
```

O aviso fica acima de tudo para aparecer já na escolha do tipo de sessão, evitando que o usuário crie uma sessão que nunca vai conseguir gravar.

- [ ] **Step 4: Em `web/src/App.tsx`, passar as props novas para o `Recorder`**

Dentro do `<Recorder ... />`, logo depois da linha `isCapturingSpeech={audio.isCapturingSpeech}`, acrescentar:

```tsx
            micBlocked={audio.micStatus.kind === 'blocked'}
            showLevelMeter={audio.showLevelMeter}
```

- [ ] **Step 5: Verificar typecheck e lint**

```bash
cd web && npm run typecheck && npm run lint
```

Esperado: exit 0.

- [ ] **Step 6: Commit**

```bash
git add web/src/components/Recorder.tsx web/src/App.tsx
git commit -m "Exibe aviso de microfone bloqueado e alterna medidor por indicador de fala"
```

---

### Task 6: Layout mobile e acesso por HTTPS em desenvolvimento

**Files:**
- Modify: `web/index.html`
- Modify: `web/src/styles/tokens.css`
- Modify: `web/src/app.css`
- Modify: `web/vite.config.ts`

**Interfaces:**
- Consumes: as classes `notice`, `notice__title`, `notice__message` e `speech-activity*` produzidas pelos componentes da Tarefa 4.
- Produces: nada consumido por código.

- [ ] **Step 1: Em `web/index.html`, ajustar o viewport para respeitar o notch**

Substituir:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
```

por:

```html
    <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
```

- [ ] **Step 2: Em `web/src/styles/tokens.css`, ajustar as regras de base para mobile**

Substituir o bloco:

```css
html,
body,
#root {
  min-height: 100%;
}

body {
  margin: 0;
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
}
```

por:

```css
html,
body,
#root {
  min-height: 100%;
}

html {
  /* Impede o Safari no iPhone de inflar a fonte ao girar a tela. */
  -webkit-text-size-adjust: 100%;
}

body {
  margin: 0;
  font-family: var(--font-body);
  background: var(--bg);
  color: var(--text);
  line-height: 1.5;
  -webkit-tap-highlight-color: transparent;
  overscroll-behavior-y: contain;
}
```

- [ ] **Step 3: Em `web/src/app.css`, aplicar safe area no container**

Substituir:

```css
.app {
  max-width: 640px;
  margin: 0 auto;
  padding: var(--space-6) var(--space-4);
}
```

por:

```css
.app {
  max-width: 640px;
  margin: 0 auto;
  padding: calc(var(--space-6) + env(safe-area-inset-top)) calc(var(--space-4) + env(safe-area-inset-right))
    calc(var(--space-6) + env(safe-area-inset-bottom)) calc(var(--space-4) + env(safe-area-inset-left));
}
```

- [ ] **Step 4: Em `web/src/app.css`, dar altura mínima de toque aos botões**

Substituir:

```css
button {
  border: 1px solid var(--focus);
  background: var(--focus);
  color: white;
  border-radius: var(--radius);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  align-self: flex-start;
}
```

por:

```css
button {
  border: 1px solid var(--focus);
  background: var(--focus);
  color: white;
  border-radius: var(--radius);
  padding: var(--space-3) var(--space-4);
  cursor: pointer;
  align-self: flex-start;
  /* Alvo de toque mínimo recomendado em mobile. */
  min-height: 44px;
}
```

- [ ] **Step 5: Em `web/src/app.css`, permitir quebra de linha nos controles**

Substituir:

```css
.recorder-controls {
  display: flex;
  align-items: center;
  gap: var(--space-3);
}
```

por:

```css
.recorder-controls {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-3);
}
```

- [ ] **Step 6: Em `web/src/app.css`, limitar a altura do transcript pela viewport**

Substituir:

```css
.transcript {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-3);
  max-height: 240px;
  overflow-y: auto;
}
```

por:

```css
.transcript {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: var(--space-3);
  max-height: min(240px, 40dvh);
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
```

- [ ] **Step 7: Em `web/src/app.css`, acrescentar os estilos novos ao final do arquivo**

```css
.notice {
  background: var(--surface);
  border: 1px solid var(--danger);
  border-left-width: 4px;
  border-radius: var(--radius);
  padding: var(--space-4);
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--space-2);
  margin-bottom: var(--space-4);
}

.notice__title {
  margin: 0;
  font-weight: 600;
  color: var(--danger);
}

.notice__message {
  margin: 0;
}

.speech-activity {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  color: var(--muted);
  font-size: 0.9rem;
}

.speech-activity__dot {
  width: 10px;
  height: 10px;
  border-radius: 999px;
  background: var(--border);
  flex: none;
}

.speech-activity--active {
  color: var(--text);
}

.speech-activity--active .speech-activity__dot {
  background: var(--success);
  animation: speech-pulse 1.2s ease-in-out infinite;
}

@keyframes speech-pulse {
  0%,
  100% {
    opacity: 1;
    transform: scale(1);
  }
  50% {
    opacity: 0.45;
    transform: scale(0.8);
  }
}

@media (max-width: 560px) {
  .card {
    padding: var(--space-4);
  }

  .recorder-controls {
    flex-direction: column;
    align-items: stretch;
  }

  button {
    width: 100%;
    align-self: stretch;
  }
}
```

O bloco `prefers-reduced-motion` já existente em `tokens.css` neutraliza a animação `speech-pulse` para quem pede menos movimento — nada a fazer aqui.

- [ ] **Step 8: Em `web/vite.config.ts`, liberar os hosts de tunnel**

Substituir:

```ts
  server: {
    port: 5183,
  },
```

por:

```ts
  server: {
    port: 5183,
    // O microfone só é liberado em contexto seguro, então testar no celular exige
    // HTTPS. O caminho suportado é o port forwarding do VS Code (Dev Tunnels);
    // sem esta lista o Vite rejeita o Host do tunnel.
    allowedHosts: ['.devtunnels.ms', '.ngrok-free.app', '.trycloudflare.com'],
  },
```

- [ ] **Step 9: Verificar typecheck, lint e build**

```bash
cd web && npm run typecheck && npm run lint && npm run build
```

Esperado: exit 0 nos três. O `build` é incluído aqui porque esta tarefa mexe em `index.html` e `vite.config.ts`, que só são exercitados na compilação.

- [ ] **Step 10: Commit**

```bash
git add web/index.html web/src/styles/tokens.css web/src/app.css web/vite.config.ts
git commit -m "Ajusta layout para tela pequena e libera hosts de tunnel no dev server"
```

---

### Task 7: Documentação e verificação manual no celular

**Files:**
- Modify: `CLAUDE.md`

**Interfaces:**
- Consumes: o comportamento final de todas as tarefas anteriores.
- Produces: nada consumido por código.

- [ ] **Step 1: Em `CLAUDE.md`, atualizar o parágrafo da limitação conhecida**

Substituir:

```
Limitação conhecida: Web Speech API não funciona em PWA instalado na tela de início do
iOS (funciona normalmente como aba de navegador em qualquer plataforma).
```

por:

```
Limitação conhecida: Web Speech API não funciona em PWA instalado na tela de início do
iOS (funciona normalmente como aba de navegador em qualquer plataforma) — o app detecta
esse caso e orienta a abrir pelo Safari. O microfone também só é liberado em contexto
seguro: `http://` em IP de rede local nunca funciona, e o app avisa em vez de falhar
em silêncio.
```

- [ ] **Step 2: Em `CLAUDE.md`, substituir o bullet de `useSpeechSession`**

Substituir o bullet inteiro que começa com ``- `hooks/useSpeechSession.ts` — todo o STT roda aqui`` (até o fim do parágrafo, terminando em ``porque o `sessionId` prop mudou.``) por:

```
- `hooks/useSpeechSession.ts` — todo o STT roda aqui: `SpeechRecognition` nativo do
  navegador (`window.SpeechRecognition ?? window.webkitSpeechRecognition`). Cada
  resultado final é enviado (`postTranscript`) imediatamente pro backend; resultados
  interinos só atualizam estado local. **Android e iOS dão acesso exclusivo ao
  microfone:** manter o `MediaStream` do medidor de nível aberto impedia o
  reconhecimento de capturar qualquer coisa, então no mobile as tracks do
  `getUserMedia` são paradas antes do `recognition.start()` e o medidor só existe no
  desktop (`supportsLevelMeter()`). O `onend` reinicia via `scheduleRestart()` com
  backoff exponencial (300ms→5s) e teto de 8 tentativas consecutivas — reiniciar
  direto no handler, como era antes, virava laço infinito e congelava a aba quando o
  microfone estava indisponível. O contador zera em `onaudiostart`, que é o sinal de
  que a captura realmente começou (o encerramento periódico em silêncio é normal e
  não pode consumir o teto). Mantém wake lock de tela enquanto grava e força restart
  ao voltar do segundo plano. Expõe `reset()` pra limpar transcript/status locais —
  precisa ser chamado manualmente ao trocar/descartar sessão, já que o hook não
  reseta sozinho só porque o `sessionId` prop mudou.
- `lib/micSupport.ts` — detecção de capacidade do dispositivo (`detectMicrophone()`,
  rodando na montagem e em `devicechange`) e tradução de erros de `getUserMedia`/
  `SpeechRecognition` em mensagens acionáveis em PT-BR. Cobre contexto inseguro,
  ausência de `mediaDevices`, Web Speech API ausente (com mensagem específica de PWA
  no iOS), nenhum `audioinput` e permissão já negada.
- `lib/wakeLock.ts` — wrapper do Screen Wake Lock; sem ele a tela do celular apaga
  durante a reunião e a captura morre.
```

- [ ] **Step 3: Em `CLAUDE.md`, documentar o teste no celular**

No bloco de comandos do frontend, logo depois da linha `npm run lint                # oxlint`, acrescentar dentro da mesma cerca de código:

```
# Testar no celular: o microfone exige HTTPS, então http://<ip-da-lan>:5183 não serve.
# Use o port forwarding do VS Code (Dev Tunnels): encaminhe 5183 e 4310, marque as
# duas como Public (em Private o celular cai no login do GitHub e o fetch falha) e
# aponte VITE_API_BASE_URL para a URL do tunnel da 4310.
```

- [ ] **Step 4: Verificar que o build ainda passa**

```bash
cd web && npm run typecheck && npm run lint && npm run build
```

Esperado: exit 0 nos três.

- [ ] **Step 5: Roteiro de verificação manual**

Rode `npm run dev` na raiz (backend) e `cd web && npm run dev`, e confirme cada item:

1. **Desktop, navegador comum:** iniciar sessão, gravar, falar. A barra do medidor de nível reage e a transcrição aparece. Nenhuma regressão.
2. **Mobile via tunnel HTTPS:** iniciar sessão, gravar, falar. A transcrição aparece, a aba **não congela**, e o indicador mostra "Captando fala" enquanto se fala e "Ouvindo — pode falar" no silêncio.
3. **Mobile, silêncio prolongado:** gravar e ficar ~1 minuto sem falar, depois falar. A transcrição do que foi dito depois do silêncio aparece (prova que o restart automático sobreviveu ao ciclo de `no-speech` sem estourar o teto).
4. **Permissão negada:** negar o microfone no prompt do navegador. Aparece o aviso "Microfone indisponível" com a orientação de liberar nas permissões, e os botões de gravar ficam desabilitados. Liberar a permissão e tocar em "Verificar de novo" destrava.
5. **Contexto inseguro:** abrir `http://<ip-da-lan>:5183` no celular. Aparece o aviso sobre HTTPS e o botão de gravar fica desabilitado — sem travamento.
6. **Wake lock:** gravar no celular e deixar a tela ociosa por mais tempo que o timeout de bloqueio do aparelho. A tela permanece acesa e a gravação continua.
7. **Segundo plano:** durante a gravação no celular, trocar de app e voltar. A gravação retoma e novas falas entram na transcrição.

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md
git commit -m "Documenta o comportamento mobile do STT e o teste por tunnel HTTPS"
```
