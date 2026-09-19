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
O email do relatório (Resend) só sai quando o usuário clica em "Nova sessão" na tela do
relatório — não é mais automático no `finalize`.

Limitação conhecida: Web Speech API não funciona em PWA instalado na tela de início do
iOS (funciona normalmente como aba de navegador em qualquer plataforma) — o app detecta
esse caso e orienta a abrir pelo Safari. O microfone também só é liberado em contexto
seguro: `http://` em IP de rede local nunca funciona, e o app avisa em vez de falhar
em silêncio.

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
  chama `/reports/:id/email` explicitamente (botão "Nova sessão"), não no `finalize`.
- `services/emailService.ts` — `EmailService` (Resend real) e `StubEmailService`
  (no-op, usado em testes), ambos implementando a interface `EmailSender`. Sem
  idempotency key — é um envio manual disparado pelo usuário, não uma chamada
  automática que precise de proteção contra retry duplicado.
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
- `services/sessionService.ts` — sessões e transcript acumulado em memória (`Map`,
  sem persistência — reinicia o processo, perde tudo). IDs são `crypto.randomUUID()`
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
  relatório.
- `hooks/useSpeechSession.ts` — todo o STT roda aqui: `SpeechRecognition` nativo do
  navegador (`window.SpeechRecognition ?? window.webkitSpeechRecognition`). Cada
  resultado final é enviado (`postTranscript`) imediatamente pro backend; resultados
  interinos só atualizam estado local. **Android e iOS dão acesso exclusivo ao
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
- `components/Recorder.tsx` — controles de gravação. Quando parado com transcript
  acumulado, mostra "Continuar gravação" (retoma, mantém o que já foi dito) e
  "Resetar e começar do zero" (cria uma sessão nova via `onReset`, descarta tudo).
  "Gerar relatório" só habilita com um mínimo de conteúdo transcrito
  (`MIN_TRANSCRIPT_CHARS`), com disclaimer abaixo do transcript explicando o motivo.
- `LevelMeter.tsx`, `ReportTypePicker.tsx`, `ReportView.tsx` — medidor visual de
  captação e exibição do relatório final (`ReportView` é só display, sem lógica).
- `MicStatusNotice.tsx` — aviso exibido quando `micStatus.kind === 'blocked'`, com a
  mensagem de `micSupport.ts` e o botão "Verificar de novo". `SpeechActivityIndicator.tsx`
  — substitui o `LevelMeter` no mobile (`!showLevelMeter`), já que ali não há RMS pra
  mostrar.
- `api/client.ts` + `api/types.ts` — client HTTP fino; toda resposta do backend é
  validada com `safeParse` de um schema Zod antes de ser usada (`ApiClientError` se
  a validação ou o HTTP status falhar).
- `lib/audioLevel.ts` — conversão de RMS em nível visual (0–1) e classificação de
  qualidade de captação (`silencio`/etc), funções puras.
- PWA via `vite-plugin-pwa` (`vite.config.ts`), autoUpdate.

### Testes

Só o backend tem testes: `tests/*.unit.test.ts` (sem rede) e `tests/*.e2e.test.ts`
(chamam a API real do LLM), com o test runner nativo do Node (`node --test`), não
Jest/Vitest — sem describe/it de terceiros, usar as APIs de `node:test`. O frontend
não tem testes automatizados (removido deliberadamente) — validação é manual.
