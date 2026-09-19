# Suporte a mobile e validação de microfone

Data: 2026-09-19
Escopo: `web/` (frontend PWA). Backend não muda.

## Problema

No celular, ao clicar em "Começar a gravar", o app trava no navegador e nada é
transcrito.

### Causa raiz

`useSpeechSession.start()` faz duas coisas em sequência:

1. `getUserMedia({ audio: true })` + `AudioContext`, e mantém o `MediaStream`
   aberto para alimentar o medidor de nível (`useSpeechSession.ts:131-137`).
2. `SpeechRecognition.start()` (`useSpeechSession.ts:141`).

No desktop o Chrome deixa os dois consumidores compartilharem o microfone. No
Android e no iOS não: o `MediaStream` do medidor segura o dispositivo e o
reconhecimento não consegue capturar áudio — ele encerra imediatamente e dispara
`onend`.

O travamento vem do handler de `onend` (`useSpeechSession.ts:113-117`), que
chama `recognition.start()` de forma síncrona, sem guarda, sem atraso e sem teto
de tentativas. Com o microfone ocupado, isso vira um laço infinito
`start → falha → onend → start` na main thread, competindo com o
`requestAnimationFrame` do medidor. Resultado: aba congelada.

## Objetivos

1. Transcrição funcionando em navegador mobile (Android/Chrome e iOS/Safari em aba).
2. Nenhum cenário em que a UI congela — falha sempre vira mensagem legível.
3. Validação explícita de microfone antes de o usuário conseguir gravar.
4. Layout utilizável em tela pequena.

Não-objetivos: fazer o Web Speech API funcionar em PWA instalado no iOS (limitação
da plataforma — apenas detectar e orientar), trocar de engine de STT, mexer no backend.

## Design

### 1. `web/src/lib/micSupport.ts` (novo)

Módulo de capacidade do dispositivo. Funções puras + uma checagem assíncrona.

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
```

- `isSpeechRecognitionSupported()` — movida do hook para cá; o hook reexporta para
  não quebrar importadores.
- `isIosStandalone()` — `navigator.standalone === true` ou
  `matchMedia('(display-mode: standalone)')` combinado com UA de iOS.
- `prefersInlineMeter()` — heurística de desktop
  (`matchMedia('(pointer: fine)')` e ausência de `maxTouchPoints` alto). Decide se o
  medidor de nível pode ser usado.
- `describeMicIssue(issue): string` — pura, mensagens em PT-BR com a ação corretiva.
- `mapGetUserMediaError(error): MicIssue` — pura, mapeia `DOMException.name`
  (`NotAllowedError` → `permission-denied`, `NotFoundError` → `no-audio-input`,
  `NotReadableError`/`AbortError` → `mic-busy`, `SecurityError` → `insecure-context`,
  resto → `unknown`).
- `detectMicrophone(): Promise<MicStatus>` — checa, em ordem e sem pedir permissão:
  1. `window.isSecureContext` falso → `insecure-context`
  2. `navigator.mediaDevices?.getUserMedia` ausente → `no-media-devices`
  3. Web Speech API ausente → `ios-standalone-pwa` se for o caso, senão
     `no-speech-recognition`
  4. `enumerateDevices()` sem nenhum `kind === 'audioinput'` → `no-audio-input`
  5. `navigator.permissions.query({ name: 'microphone' })` dentro de `try/catch`
     (Safari lança) → `state === 'denied'` vira `permission-denied`
  6. caso contrário → `ready`

### 2. `web/src/hooks/useSpeechSession.ts` (reescrita do ciclo de vida)

**Estado novo:** `micStatus: MicStatus`, `showLevelMeter: boolean`, `recheckMic(): void`.

**Na montagem:** roda `detectMicrophone()` e assina
`navigator.mediaDevices.addEventListener('devicechange', …)` para reavaliar quando
um microfone é conectado ou removido.

**`start()`:**

1. Reexecuta `detectMicrophone()`; se `blocked`, seta o erro e aborta sem tocar no
   microfone.
2. `setStatus('requesting')`.
3. `getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } })`
   — dispara o prompt de permissão e confirma que existe um dispositivo real.
4. **Se `showLevelMeter` (desktop):** mantém o stream, cria o `AudioContext`, faz
   `await ctx.resume()` (iOS/Chrome iniciam suspenso) e liga o medidor.
   **Senão (mobile):** `stream.getTracks().forEach(t => t.stop())` **antes** de
   iniciar o reconhecimento. É esta linha que corrige o bug.
5. `startRecognition()`.
6. Adquire o wake lock.

Falha no passo 3 passa por `mapGetUserMediaError` → `describeMicIssue` e volta para
`status: 'idle'`.

**`startRecognition()` endurecido:**

- Refs de controle: `startingRef` (evita dois `start()` em voo),
  `restartTimeoutRef`, `restartAttemptsRef`.
- `onresult`: comportamento atual (chunk final → `postTranscript`; interim → estado
  local) e zera `restartAttemptsRef` — houve saída real, o ciclo está saudável.
- `onaudiostart`/`onspeechstart` → `setIsCapturingSpeech(true)`;
  `onspeechend`/`onaudioend` → `false`. É a fonte do indicador de fala no mobile.
- `onerror` classificado:
  - fatais (`not-allowed`, `service-not-allowed`, `audio-capture`): param tudo,
    mensagem específica via `describeMicIssue`;
  - toleráveis (`no-speech`, `aborted`): ignorados, o restart cuida;
  - `network`: conta para o backoff.
- `onend`: se `listeningRef` for falso, só limpa. Senão chama `scheduleRestart()`.
- `scheduleRestart()`: `setTimeout` com `min(300 * 2 ** attempts, 5000)` ms,
  incrementando `restartAttemptsRef`. Passando de `MAX_RESTART_ATTEMPTS` (8)
  tentativas consecutivas sem nenhum `onresult`, para de vez e reporta
  "não foi possível manter a captura de áudio".
- Toda chamada a `recognition.start()` fica em `try/catch` (`InvalidStateError` é
  esperado quando o navegador ainda não terminou de encerrar a instância anterior).

**Wake lock:** `navigator.wakeLock.request('screen')` ao entrar em `recording`,
liberado no `stop()`. Sem ele a tela do celular apaga e a captura morre no meio da
reunião. Envolto em `try/catch` — não é suportado em todo lugar e a falha é benigna.

**`visibilitychange`:** ao voltar para primeiro plano com `listeningRef` ainda
verdadeiro, zera o backoff, força um restart e readquire o wake lock. O mobile mata
o reconhecimento quando a aba vai para segundo plano.

**Cleanup no unmount:** limpa o timeout de restart, aborta o reconhecimento, para as
tracks, fecha o `AudioContext` e libera o wake lock.

### 3. Componentes

- **`components/MicStatusNotice.tsx` (novo)** — renderiza `MicStatus.blocked` com a
  mensagem e um botão "Verificar de novo" que chama `recheckMic()`. Fica em `App.tsx`
  acima do conteúdo, então já aparece na tela de escolha do tipo de sessão e evita
  criar sessão à toa.
- **`components/SpeechActivityIndicator.tsx` (novo)** — substituto leve do medidor no
  mobile: "Ouvindo…" / "Captando fala", dirigido por `isCapturingSpeech` e pela
  presença de `interimText`.
- **`components/Recorder.tsx`** — recebe `micStatus` e `showLevelMeter`. Desabilita
  "Começar a gravar" quando bloqueado; escolhe `LevelMeter` (desktop) ou
  `SpeechActivityIndicator` (mobile) durante a gravação.
- **`App.tsx`** — repassa `micStatus`/`showLevelMeter`/`recheckMic` e monta o
  `MicStatusNotice`.

### 4. Layout mobile

- `web/index.html`: `viewport` ganha `viewport-fit=cover`.
- `styles/tokens.css`: `-webkit-text-size-adjust: 100%`,
  `-webkit-tap-highlight-color: transparent`, `overscroll-behavior-y: contain`.
- `app.css`:
  - `.app` com padding usando `env(safe-area-inset-*)`;
  - `button { min-height: 44px }` (alvo de toque);
  - `.recorder-controls { flex-wrap: wrap }`;
  - `@media (max-width: 560px)`: botões `width: 100%`, `.recorder-controls` em coluna
    esticada, `.card` com padding menor;
  - `.transcript { max-height: min(240px, 40dvh) }`;
  - estilos de `.notice` / `.speech-activity`.

### 5. Acesso pelo celular em desenvolvimento

O microfone só é liberado em contexto seguro, então abrir `http://<ip-da-lan>:5183`
no celular nunca vai funcionar — e agora o app diz isso em vez de travar.

O caminho suportado é o port forwarding do VS Code (Dev Tunnels), que serve HTTPS:
encaminhar `5183` e `4310`, ambos com visibilidade **Public**, e apontar
`VITE_API_BASE_URL` para a URL do tunnel da `4310`. O CORS do backend já é
`origin: true` (`src/server.ts:24`), então nada muda lá.

Única mudança de código: `vite.config.ts` ganha `server.allowedHosts` cobrindo
`.devtunnels.ms`, porque o Vite rejeita requisições com `Host` desconhecido e a URL
do tunnel cairia em erro. Nenhuma dependência nova.

## Verificação

`npm run typecheck` e `npm run lint` dentro de `web/`. O frontend não tem camada de
testes — foi removida deliberadamente (ver CLAUDE.md) e este trabalho não a
reintroduz. A validação funcional é manual, no celular, via tunnel HTTPS.

Roteiro manual:

1. Desktop: gravar, confirmar que o medidor de nível continua funcionando e a
   transcrição aparece.
2. Mobile (aba do navegador, HTTPS): gravar, confirmar que a transcrição aparece, que
   a UI não trava e que o indicador de fala reage.
3. Mobile com permissão negada: confirmar a mensagem e o botão "Verificar de novo".
4. `http://` puro: confirmar a mensagem de contexto inseguro e o botão de gravar
   desabilitado.
5. Mobile: deixar a tela ociosa durante a gravação e confirmar que ela não apaga.

## Documentação

`CLAUDE.md` descreve o comportamento antigo de `useSpeechSession` (getUserMedia
sempre ativo, restart direto no `onend`). Atualizar essa seção, a limitação conhecida
do iOS e acrescentar o procedimento de teste por tunnel.
