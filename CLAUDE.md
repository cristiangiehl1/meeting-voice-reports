# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ouve reuniões, entrevistas e agendamentos em tempo real (web/PWA) e gera um relatório
estruturado ao final da sessão. Não há resposta em voz nem turn-taking — o app só
transcreve ao vivo; o LLM entra apenas no fechamento (finalize).

Fluxo: cliente web (PWA) → Web Speech API (STT nativo do navegador, roda 100% no
cliente, grátis) → `POST /sessions/:id/transcript` a cada trecho final reconhecido →
`POST /sessions/:id/finalize` → LangGraph (1 node `generateReport`) roda extração
estruturada via LLM → relatório salvo e devolvido (schema Zod varia por `reportType`).
O email do relatório (Resend) sai numa etapa própria depois do relatório, onde o usuário
informa os destinatários — não é automático no `finalize`, e dá pra pular.

Limitação conhecida: Web Speech API não funciona em PWA instalado na tela de início do
iOS (funciona normalmente como aba de navegador em qualquer plataforma). O manifesto é
montado pra evitar esse modo — ver a nota sobre `display`/`display_override` abaixo — e,
pra quem já instalou assim, o app detecta o caso e oferece um link "Abrir no Safari". O
microfone também só é liberado em contexto seguro: `http://` em IP de rede local nunca
funciona, e o app avisa em vez de falhar em silêncio.

## Commands

Backend (raiz do repo):
```bash
npm install
cp .env.example .env       # preencher OPENROUTER_API_KEY e RESEND_API_KEY

npm run dev                # localhost:4310, watch mode + inspector (porta fora de 3000/8000 de propósito, ver PORT no .env.example)
npm start                  # sem watch

npm test                   # unit + e2e
npm run test:unit          # só unit — não chama a API real
npm run test:e2e           # só e2e — chama a API real (precisa de OPENROUTER_API_KEY)
```
Testes usam `node --test` (test runner nativo do Node), não Jest/Vitest. Para rodar um
único arquivo: `node --env-file .env --test tests/session.unit.test.ts`.

Frontend (`web/`):
```bash
cd web && npm install
npm run dev                # localhost:5183
npm run build               # tsc -b + vite build
npm run typecheck           # tsc -b --pretty false
npm run lint                # oxlint

# Testar no celular: o microfone exige HTTPS, então http://<ip-da-lan>:5183 não serve.
# Use o port forwarding do VS Code (Dev Tunnels): encaminhe 5183 e 4310, marque as
# duas como Public (em Private o celular cai no login do GitHub e o fetch falha) e
# aponte VITE_API_BASE_URL para a URL do tunnel da 4310.
```
Sem camada de testes no frontend (removida deliberadamente) — só typecheck + lint.

Não há linter/formatter configurado no backend (raiz) — só no `web/` (oxlint).

## Architecture

### Backend (`src/`)

- `config.ts` — env vars: `config` (modelo de geração de relatório) e `emailConfig`
  (Resend: `apiKey`, `from`, `reportRecipient`).
- `server.ts` — Fastify app (`createServer`), 4 rotas: `POST /sessions`,
  `POST /sessions/:id/transcript`, `POST /sessions/:id/finalize`,
  `POST /reports/:id/email`. Aceita `ServerDeps` (sessionService/reportService/
  emailService) para injeção em testes. O email é disparado só quando o frontend
  chama `/reports/:id/email` explicitamente (etapa de envio), não no `finalize`.
  O `to` do corpo é validado por schema no servidor — vem do cliente e vira chamada ao
  provider. O corpo aceita `null` no tipo porque um POST sem corpo continua válido e
  significa "manda só pro destinatário padrão".
- `services/emailService.ts` — `EmailService` (Resend real) e `StubEmailService`
  (no-op, usado em testes), ambos implementando a interface `EmailSender`. Sem
  idempotency key — é um envio manual disparado pelo usuário, não uma chamada
  automática que precise de proteção contra retry duplicado. `composeRecipients` é
  pura e junta os destinatários pedidos com o `REPORT_EMAIL_TO`, que vai sempre junto
  como cópia de arquivo; a deduplicação é case-insensitive pra digitar o mesmo
  endereço com outra caixa não render duas cópias.
- `emails/reportEmailTemplate.ts` — `buildReportEmailHtml`/`buildReportEmailSubject`,
  funções puras que renderizam o `report.data` (objeto genérico) em uma tabela HTML
  com escape de conteúdo (o texto vem de LLM/transcript, tratado como não-confiável).
- `graph/graph.ts` — define o `StateGraph` do LangGraph (`transcript`, `reportType` →
  `report`/`error`), um único node linear: `START → generateReport → END`.
- `graph/factory.ts` — monta o grafo com uma instância real de `OpenRouterService`
  (ponto de injeção de dependência para trocar o LLM client).
- `graph/nodes/generateReportNode.ts` — busca o schema Zod certo em
  `schemas/reportSchemaFor[reportType]`, monta os prompts via
  `prompts/v1/buildGenerateReportPrompt`, chama `llmClient.generateStructured(...)`.
- `services/openRouterService.ts` — client LLM via `ChatOpenAI` (langchain) apontado
  pra API da OpenRouter (`baseURL` custom). Usa `createAgent` + `providerStrategy(schema)`
  do pacote `langchain` para forçar saída estruturada validada pelo schema Zod.
- `lib/transcriptFlow.ts` — `buildFlowingTranscript`/`groupIntoParagraphs`, puras.
  Cada resultado final da Web Speech API chega picado e sem pontuação ("top", "vai
  gravando"); juntar com `\n` entregava ao LLM uma lista de fragmentos, enquanto os
  few-shot dos prompts usam prosa corrida. Aqui os trechos viram parágrafos: emenda
  com espaço, completa a pontuação que falta e só quebra parágrafo quando houve
  `PARAGRAPH_GAP_MS` (3s) de silêncio ou o falante mudou. Sem marcação de tempo
  (`startMs`/`endMs` zerados) a diferença dá 0 e tudo cai num parágrafo único — o
  pior caso aceitável, nunca a lista de antes. Espelhado em
  `web/src/lib/transcriptFlow.ts`, que agrupa igual pra exibir; mudam juntos.
- `services/sessionService.ts` — sessões e transcript acumulado em memória (`Map`,
  sem persistência — reinicia o processo, perde tudo). `getFullTranscript` devolve o
  texto já agrupado por `lib/transcriptFlow.ts`. IDs são `crypto.randomUUID()`
  (não sequenciais — um contador reiniciando a cada restart do processo já causou
  colisão de idempotency key no Resend quando dois relatórios diferentes pegaram
  o mesmo id "1" em processos diferentes).
- `services/reportService.ts` — relatórios finalizados em memória, mesmo padrão de
  IDs (`crypto.randomUUID()`).
- `schemas/` — um schema Zod por `reportType` (`meeting`/`interview`/`scheduling`),
  reexportados em `schemas/index.ts` junto com `REPORT_TYPES` e `reportSchemaFor`.
  Adicionar um novo tipo de relatório = novo arquivo aqui + entrada em
  `REPORT_TYPES`/`reportSchemaFor` + módulo correspondente em `prompts/v1/`.
- `prompts/v1/` — um módulo por `reportType`, cada um exporta `getSystemPrompt()` e
  `getUserPromptTemplate(transcript)` (com few-shot examples e regras anti-alucinação
  em JSON); `index.ts` faz o dispatch por `reportType`.

**Restrição de schema importante:** alguns modelos roteados via OpenRouter (ex: os que
passam por Azure) exigem *strict JSON schema* — todo campo em `properties` também
precisa estar em `required`. Por isso campos opcionais nos schemas Zod devem ser
`z.string().nullable()`, nunca `.optional()`.

Modelo default: `OPENROUTER_MODEL=openai/gpt-5.6-luna` (texto→texto estruturado).
Alternativas: `openai/gpt-5-nano`, `deepseek/deepseek-v4.1-flash`; free para prototipar:
`openrouter/free`.

### Frontend (`web/`)

- `App.tsx` — tela única, orquestra picker de tipo de relatório → gravação → view do
  relatório. Erros de fluxo viram toast (`sonner`) em vez de texto na página. O
  `Recorder` é montado com `key={session.id}`: remontar por sessão é o que zera o
  cronômetro de gravação junto com o transcript.
- `hooks/useSpeechSession.ts` — todo o STT roda aqui: `SpeechRecognition` nativo do
  navegador (`window.SpeechRecognition ?? window.webkitSpeechRecognition`). Cada
  resultado final é enviado (`postTranscript`) imediatamente pro backend; resultados
  interinos só atualizam estado local. Cada trecho final é carimbado por
  `stampChunk()`: o fim é o instante em que o resultado chegou (confiável), o começo
  é estimado pelo tamanho do texto (`CHARS_PER_SECOND`), já que a Web Speech API não
  informa duração — é essa diferença que vira quebra de parágrafo em
  `lib/transcriptFlow.ts`. A origem dos tempos sobrevive a pausar/continuar e só
  zera no `reset()`. **O hook se limpa sozinho quando o `sessionId` muda**: antes
  isso dependia de todo caminho de saída lembrar de chamar `reset()` na mão, e quem
  esquecesse deixava a fala da sessão anterior na tela sem saída — o botão de
  descartar só aparece com status `'stopped'` e o `reset()` devolve o status pra
  `'idle'`. O `key={session.id}` no `Recorder` **não** zera o transcript (ele mora
  aqui, não no `Recorder`); só zera o cronômetro. **Android e iOS dão acesso exclusivo ao
  microfone:** manter o `MediaStream` do medidor de nível aberto impedia o
  reconhecimento de capturar qualquer coisa, então no mobile as tracks do
  `getUserMedia` são paradas antes do `recognition.start()` e o medidor só existe no
  desktop (`supportsLevelMeter()`). `start()` tem guarda de reentrância
  (`startingSessionRef`): um duplo-toque no botão durante o `await` da detecção
  abriria um segundo `MediaStream` e um segundo loop de medidor, órfãos. O `onend`
  reinicia via `scheduleRestart()` com backoff exponencial (300ms→5s) e teto de 8
  tentativas consecutivas — reiniciar direto no handler, como era antes, virava laço
  infinito e congelava a aba quando o microfone estava indisponível. O contador zera
  em `onaudiostart`, que é o sinal de que a captura realmente começou (o encerramento
  periódico em silêncio é normal e não pode consumir o teto). O erro `audio-capture`
  é tratado como recuperável, não fatal: no Android o dispositivo pode ainda não ter
  sido liberado entre o `stop()` das tracks e o `recognition.start()`, e é essa janela
  que o backoff cobre; se as tentativas se esgotarem, entra a mensagem de "microfone
  ocupado" no lugar da genérica. Restarts em segundo plano são suprimidos só no
  regime mobile (`!showLevelMeter`) — no desktop a aba transcreve normalmente em
  background, então restringir ali abriria um buraco silencioso ao trocar de aba no
  notebook. `recognitionLiveRef` rastreia se existe instância de reconhecimento viva
  e é o que permite ao handler de `visibilitychange` retomar sem criar uma segunda
  instância. Mantém wake lock de tela enquanto grava e força restart ao voltar do
  segundo plano. Expõe `reset()` pra limpar transcript/status locais — precisa ser
  chamado manualmente ao trocar/descartar sessão, já que o hook não reseta sozinho só
  porque o `sessionId` prop mudou.
- `lib/micSupport.ts` — detecção de capacidade do dispositivo (`detectMicrophone()`,
  rodando na montagem e em `devicechange`) e tradução de erros de `getUserMedia`/
  `SpeechRecognition` em mensagens acionáveis em PT-BR. Cobre contexto inseguro,
  ausência de `mediaDevices`, Web Speech API ausente (com mensagem específica de PWA
  no iOS), nenhum `audioinput` e permissão já negada.
- `lib/wakeLock.ts` — wrapper do Screen Wake Lock; sem ele a tela do celular apaga
  durante a reunião e a captura morre.
- `components/Recorder.tsx` — controles de gravação, com um botão único que alterna
  gravar/parar. Quando parado com transcript acumulado, o mesmo botão retoma (mantendo
  o que já foi dito) e "Descartar e recomeçar" cria uma sessão nova via `onReset`.
  "Gerar relatório" só habilita com um mínimo de conteúdo transcrito
  (`MIN_TRANSCRIPT_CHARS`).
- `components/AppShell.tsx` — moldura de todas as telas: fundo de gradiente em malha,
  header e stepper de três passos. A troca de passo usa `AnimatePresence mode="wait"`.
  As manchas do fundo são animadas por CSS, não por Motion, pra não ocupar o main
  thread durante a gravação.
- `components/AudioVisualizer.tsx` — substitui o antigo `LevelMeter`/
  `SpeechActivityIndicator`. No desktop desenha a forma de onda a partir do
  `audioLevel`; no mobile (`!showLevelMeter`, sem RMS disponível) desenha um orbe
  pulsante ligado a `isCapturingSpeech`, e a legenda fala de atividade de fala em vez
  de qualidade de captação — prometer "captando bem" sem medir seria mentira.
- `components/TranscriptPanel.tsx` — transcript em parágrafos (`lib/transcriptFlow.ts`),
  não uma linha por trecho: a fala reconhecida chega em fragmentos de poucas palavras e
  empilhá-los não parece conversa. O interim continua o último parágrafo em itálico, em
  vez de abrir um item novo — é a mesma frase, ainda sendo reconhecida. Auto-scroll, e o
  mínimo de caracteres aparece como anel de progresso.
- `components/EmailDelivery.tsx` — etapa de envio. Campo único aceitando vários
  endereços separados por vírgula, que viram chips removíveis; a validação só aparece
  depois da primeira tentativa de envio, porque apontar erro enquanto a pessoa digita
  o primeiro endereço é ruído.
- `lib/recipients.ts` — parsing/validação dos endereços e persistência do último
  destinatário em localStorage (as leituras e escritas são protegidas: o Safari em
  navegação privada lança ao acessar o localStorage).
- `components/FinalizingOverlay.tsx` — overlay durante o `finalize`. Os passos são
  indicativos: o backend não reporta progresso. O avanço vive num componente interno
  que só monta com o overlay aberto, então cada finalize recomeça do primeiro passo
  sem efeito de reset.
- `hooks/useElapsedTime.ts` — cronômetro de gravação, acumulando os trechos ativos pra
  que pausar e continuar não zere o relógio.
- `ReportTypePicker.tsx` (cards sobre Radix RadioGroup), `ReportView.tsx` (só display,
  sem lógica além de achatar o `data` genérico pra copiar como texto).
- `MicStatusNotice.tsx` — aviso exibido quando `micStatus.kind === 'blocked'`. Título,
  mensagem e ações vêm todos de `micSupport.ts` e variam por `issue`: "Verificar de novo"
  só aparece para bloqueios que podem mudar sem sair da página (`isRecheckable` — um
  botão que nunca pode dar certo é pior que botão nenhum), e o caso de PWA no iOS ganha
  um link "Abrir no Safari", que precisa ser âncora de verdade com `target="_blank"` pro
  iOS escapar do modo standalone.
- `api/client.ts` + `api/types.ts` — client HTTP fino; toda resposta do backend é
  validada com `safeParse` de um schema Zod antes de ser usada (`ApiClientError` se
  a validação ou o HTTP status falhar).
- `lib/audioLevel.ts` — conversão de RMS em nível visual (0–1) e classificação de
  qualidade de captação (`silencio`/etc), funções puras.
- `styles/theme.css` — Tailwind v4 com config CSS-first. O `@theme` não pode ser
  aninhado em media query, então os tokens semânticos são variáveis CSS comuns em
  `:root` (dark, o tema base) sobrescritas em `@media (prefers-color-scheme: light)`,
  e o `@theme inline` só as registra pro Tailwind gerar as utilitárias. Cores em OKLCH.
  As utilitárias próprias (`glass`, `hairline-top`, `text-gradient`, `grain`,
  `tabular`) são declaradas com `@utility`.
- `components/ui/` — `Button` (variantes via `cva`), `Card`, `Badge` e o util `cn()`
  (clsx + tailwind-merge). Primitivas acessíveis vêm do pacote único `radix-ui`.
- Fontes self-hosted via `@fontsource-variable` (Geist no display, Inter no corpo) —
  o app é PWA e não pode depender de CDN de fonte em runtime. Só o subset latin entra
  no precache; ver `workbox.globPatterns` no `vite.config.ts`.
- PWA via `vite-plugin-pwa` (`vite.config.ts`), autoUpdate. O manifesto declara
  `display: 'browser'` com `display_override: ['standalone']`, e a ordem importa: o
  iOS ignora `display_override` e cai no `display`, abrindo o ícone da tela de início
  como aba do Safari — onde o STT funciona — enquanto Chrome e Edge leem o
  `display_override` primeiro, seguem instaláveis e continuam abrindo em janela
  própria. Inverter isso pra `display: 'standalone'` devolve o iOS ao modo em que o
  app não transcreve nada.

### Testes

Só o backend tem testes: `tests/*.unit.test.ts` (sem rede) e `tests/*.e2e.test.ts`
(chamam a API real do LLM), com o test runner nativo do Node (`node --test`), não
Jest/Vitest — sem describe/it de terceiros, usar as APIs de `node:test`. O frontend
não tem testes automatizados (removido deliberadamente) — validação é manual.
