# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Ouve reuniões, entrevistas e agendamentos em tempo real (web/PWA) e gera um relatório
estruturado ao final da sessão. Não há resposta em voz nem turn-taking — o app só
transcreve ao vivo; o LLM entra apenas no fechamento (finalize).

Fluxo: cliente web (PWA) → Web Speech API (STT nativo do navegador, roda 100% no
cliente, grátis) → `POST /sessions/:id/transcript` a cada trecho final reconhecido →
`POST /sessions/:id/finalize` → LangGraph (1 node `generateReport`) roda extração
estruturada via LLM → relatório salvo, devolvido (schema Zod varia por `reportType`) e
enviado por email (Resend) para o destinatário configurado.

Limitação conhecida: Web Speech API não funciona em PWA instalado na tela de início do
iOS (funciona normalmente como aba de navegador em qualquer plataforma).

## Commands

Backend (raiz do repo):
```bash
npm install
cp .env.example .env       # preencher OPENROUTER_API_KEY e RESEND_API_KEY

npm run dev                # localhost:3000, watch mode + inspector
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
npm run dev                # localhost:5173
npm run build               # tsc -b + vite build
npm run typecheck           # tsc -b --pretty false
npm run lint                # oxlint
npm test                    # vitest run
```

Não há linter/formatter configurado no backend (raiz) — só no `web/` (oxlint).

## Architecture

### Backend (`src/`)

- `config.ts` — env vars: `config` (modelo de geração de relatório) e `emailConfig`
  (Resend: `apiKey`, `from`, `reportRecipient`).
- `server.ts` — Fastify app (`createServer`), 3 rotas: `POST /sessions`,
  `POST /sessions/:id/transcript`, `POST /sessions/:id/finalize`. Aceita
  `ServerDeps` (sessionService/reportService/emailService) para injeção em testes.
  No `finalize`, depois de salvar o relatório, tenta enviar por email — falha de
  email é só logada (`request.log.error`), não derruba a resposta.
- `services/emailService.ts` — `EmailService` (Resend real) e `StubEmailService`
  (no-op, usado em testes), ambos implementando a interface `EmailSender`.
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
  sem persistência — reinicia o processo, perde tudo).
- `services/reportService.ts` — relatórios finalizados em memória, mesmo padrão.
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
  navegador (`window.SpeechRecognition ?? window.webkitSpeechRecognition`) mais um
  medidor de nível de áudio via Web Audio API (`AnalyserNode` + RMS). Cada resultado
  final do reconhecimento é enviado (`postTranscript`) imediatamente pro backend;
  resultados interinos só atualizam estado local. `onend` reinicia o reconhecimento
  automaticamente enquanto `listeningRef` estiver true (o navegador encerra sozinho
  periodicamente).
- `components/Recorder.tsx`, `LevelMeter.tsx`, `ReportTypePicker.tsx`, `ReportView.tsx`
  — UI da sessão de gravação, medidor visual de captação e exibição do relatório final.
- `api/client.ts` + `api/types.ts` — client HTTP fino; toda resposta do backend é
  validada com `safeParse` de um schema Zod antes de ser usada (`ApiClientError` se
  a validação ou o HTTP status falhar).
- `lib/audioLevel.ts` — conversão de RMS em nível visual (0–1) e classificação de
  qualidade de captação (`silencio`/etc), puro e testado isoladamente.
- PWA via `vite-plugin-pwa` (`vite.config.ts`), autoUpdate.

### Testes

- Backend: `tests/*.unit.test.ts` (sem rede) e `tests/*.e2e.test.ts` (chamam a API
  real do LLM) rodam com o test runner nativo do Node (`node --test`), não
  Jest/Vitest — sem describe/it de terceiros, usar as APIs de `node:test`.
- Frontend: Vitest + Testing Library + jsdom (`web/src/test-setup.ts`).
