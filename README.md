# Meeting Voice Reports

Ouve reuniões, entrevistas e agendamentos em tempo real (web/PWA) e gera um
relatório estruturado ao final da sessão. Não há resposta em voz nem
turn-taking — o app só transcreve ao vivo; o LLM entra apenas no fechamento.

## Arquitetura

```
cliente web (PWA)
  -> Web Speech API (reconhecimento de voz nativo do navegador, grátis, em tempo real)
  -> POST /sessions/:id/transcript          (cada trecho final reconhecido)
  -> POST /sessions/:id/finalize
  -> LangGraph: 1 node (generateReport) roda a chain de extração estruturada
  -> relatório salvo e devolvido (schema Zod varia por reportType)
```

A transcrição roda 100% no navegador via `SpeechRecognition` (Web Speech API)
— sem custo, em tempo real de verdade. Isso só funciona em navegadores que
suportam a API (Chrome, Safari) **e não em PWA instalado na tela de início do
iOS** (limitação conhecida da Apple — a API existe mas não funciona nesse
modo). Funciona normalmente como aba de navegador em qualquer plataforma.

### Backend — Estrutura

```
src/
  config.ts                     # env vars, modelo de geração do relatório
  index.ts                      # entrypoint
  server.ts                     # Fastify (sessions, transcript, finalize)
  graph/
    graph.ts                    # StateGraph (transcript -> report)
    factory.ts
    nodes/generateReportNode.ts
  services/
    openRouterService.ts        # LLM client (geração do relatório)
    sessionService.ts           # sessões em memória (transcript acumulado)
    reportService.ts            # relatórios em memória
  schemas/                      # Zod: meetingReport / interviewReport / schedulingReport
  prompts/v1/                   # prompts por tipo de relatório (few-shot, anti-alucinação)
tests/
```

### Web — Estrutura

```
web/
  src/
    App.tsx
    hooks/useSpeechSession.ts   # Web Speech API + medidor de nível de áudio
    components/
      Recorder.tsx
      LevelMeter.tsx            # intensidade/qualidade da captação em tempo real
      ReportTypePicker.tsx
      ReportView.tsx
    api/                        # client HTTP (Zod-validado) pro backend
    lib/audioLevel.ts           # RMS -> nível visual + classificação de qualidade
```

## Modelo (OpenRouter)

- **`OPENROUTER_MODEL`** (geração do relatório, texto->texto estruturado):
  default `openai/gpt-5.6-luna`. Alternativas: `openai/gpt-5-nano`,
  `deepseek/deepseek-v4.1-flash`. Free p/ prototipar: `openrouter/free`.

> Atenção com modelos que exigem *strict JSON schema* (ex: roteados via
> Azure) — todo campo em `properties` precisa também estar em `required`.
> Campos opcionais devem ser `z.string().nullable()` (nunca `.optional()`)
> nos schemas em `src/schemas/`.

## Instalação

```bash
# backend
npm install
cp .env.example .env  # preencher OPENROUTER_API_KEY

# web
cd web && npm install
```

## Rodando

```bash
npm run dev          # backend, localhost:3000
cd web && npm run dev # frontend, localhost:5173
```

## Testes

```bash
# backend
npm test          # unit + e2e
npm run test:unit # só unit (sem chamar API)
npm run test:e2e  # só e2e (chama a API real)

# web
cd web && npm test
```
