# Meeting Voice Reports

Transcreve reuniões, entrevistas e agendamentos em tempo real e gera um relatório
estruturado ao final da sessão, enviado por email sob demanda.

## Índice

- [Visão geral](#visão-geral)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Stack técnica](#stack-técnica)
- [Estrutura do projeto](#estrutura-do-projeto)
- [Como rodar localmente](#como-rodar-localmente)
- [Configuração (variáveis de ambiente)](#configuração-variáveis-de-ambiente)
- [Referência da API](#referência-da-api)
- [Deploy](#deploy)
- [Testes](#testes)
- [Limitações conhecidas](#limitações-conhecidas)

## Visão geral

O app não tem resposta em voz nem *turn-taking* — ele só ouve e transcreve ao vivo.
O LLM entra em um único ponto: quando a sessão é finalizada, ele lê a transcrição
acumulada e gera um relatório estruturado (schema varia conforme o tipo de sessão).

Fluxo de ponta a ponta:

1. Usuário escolhe o tipo de sessão (reunião, entrevista ou agendamento) e começa a gravar.
2. O reconhecimento de voz roda **100% no navegador** (Web Speech API) — sem custo, em tempo real.
3. Cada trecho final reconhecido é enviado ao backend e acumulado na sessão.
4. Ao finalizar, o backend roda um grafo LangGraph que extrai o relatório estruturado via LLM.
5. O usuário revisa o relatório e, ao iniciar uma nova sessão, o relatório atual é enviado por email.

## Funcionalidades

- Transcrição em tempo real via Web Speech API nativa do navegador (sem custo de STT).
- Medidor visual de nível/qualidade de captação de áudio durante a gravação.
- Extração estruturada do relatório (Zod) com prompts anti-alucinação por tipo de sessão.
- Retomar gravação de onde parou, ou resetar e começar do zero.
- Gate de conteúdo mínimo antes de habilitar a geração do relatório.
- Envio do relatório por email (Resend) ao encerrar a sessão.
- Instalável como PWA.

## Arquitetura

```
┌─────────────┐   Web Speech API    ┌──────────────────────────┐
│   Cliente   │ ───────────────────▶│  POST /sessions/:id/     │
│  web (PWA)  │   (STT no browser)  │  transcript              │
└─────────────┘                     └────────────┬─────────────┘
                                                  │
                                     POST /sessions/:id/finalize
                                                  ▼
                                     ┌──────────────────────────┐
                                     │  LangGraph                │
                                     │  START → generateReport   │
                                     │  → END                    │
                                     │  (LLM via OpenRouter)      │
                                     └────────────┬─────────────┘
                                                  ▼
                                     relatório estruturado (Zod)
                                                  │
                                   "Nova sessão"  ▼
                                     POST /reports/:id/email
                                                  │
                                                  ▼
                                          Resend → destinatário
```

## Stack técnica

| Camada | Tecnologia |
|---|---|
| Backend | Node.js (TypeScript nativo, sem bundler), Fastify |
| Orquestração LLM | LangChain.js + LangGraph, via OpenRouter |
| Validação/schemas | Zod |
| Email | Resend |
| Frontend | React 19 + Vite, PWA (`vite-plugin-pwa`) |
| STT | Web Speech API (nativa do navegador) |
| Testes | Test runner nativo do Node (`node --test`) — só no backend |

## Estrutura do projeto

```
.
├── src/                          # backend
│   ├── config.ts                 # env vars (modelo LLM, Resend)
│   ├── server.ts                 # Fastify app + rotas
│   ├── graph/                    # StateGraph do LangGraph
│   ├── services/                 # sessão, relatório, LLM, email (em memória)
│   ├── schemas/                  # um schema Zod por tipo de relatório
│   ├── prompts/v1/                # prompts por tipo de relatório
│   └── emails/                   # template HTML do email do relatório
├── tests/                        # unit + e2e (node:test)
├── web/                           # frontend
│   └── src/
│       ├── App.tsx
│       ├── hooks/useSpeechSession.ts
│       ├── components/
│       ├── api/                  # client HTTP validado com Zod
│       └── lib/audioLevel.ts
├── render.yaml                    # blueprint de deploy do backend (Render)
└── web/netlify.toml                # config de deploy do frontend (Netlify)
```

## Como rodar localmente

Pré-requisitos: Node.js 24+, uma API key da [OpenRouter](https://openrouter.ai) e,
opcionalmente, uma API key da [Resend](https://resend.com).

```bash
# backend
npm install
cp .env.example .env   # preencher OPENROUTER_API_KEY (e RESEND_API_KEY se for testar email)
npm run dev             # http://localhost:4310

# frontend (outro terminal)
cd web
npm install
npm run dev             # http://localhost:5183
```

## Configuração (variáveis de ambiente)

### Backend (`.env`, raiz do repo)

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `OPENROUTER_API_KEY` | sim | — | Chave da OpenRouter |
| `OPENROUTER_MODEL` | não | `openai/gpt-5.6-luna` | Modelo usado na geração do relatório |
| `RESEND_API_KEY` | só p/ email | — | Chave da Resend |
| `EMAIL_FROM` | não | `onboarding@resend.dev` | Remetente — sandbox só entrega pro dono da conta Resend |
| `REPORT_EMAIL_TO` | não | `cristian.giehl@gmail.com` | Destinatário do relatório |
| `LANGSMITH_API_KEY` | não | — | Tracing opcional via LangSmith |
| `PORT` | não | `4310` | Porta do servidor (setada automaticamente em produção pelo Render); default fora de 3000/8000 pra evitar colisão com outros projetos rodando localmente |

> Modelos roteados via provedores que exigem *strict JSON schema* (ex: Azure) exigem
> que todo campo opcional nos schemas Zod seja `z.string().nullable()`, nunca
> `.optional()` — ver `src/schemas/`.

### Frontend (`web/`, build-time)

| Variável | Obrigatória | Default | Descrição |
|---|---|---|---|
| `VITE_API_BASE_URL` | em produção | `http://localhost:4310` | URL do backend — embutida no bundle em build time |

## Referência da API

| Método | Rota | Descrição |
|---|---|---|
| `POST` | `/sessions` | Cria uma sessão (`{ reportType }`) |
| `POST` | `/sessions/:id/transcript` | Acrescenta um trecho de transcrição (`{ text, speaker? }`) |
| `POST` | `/sessions/:id/finalize` | Encerra a sessão e gera o relatório estruturado |
| `POST` | `/reports/:id/email` | Envia o relatório já gerado por email |

## Deploy

- **Backend → Render**: usa `render.yaml` (Blueprint). `New → Blueprint`, conecta o
  repo, preenche os secrets (`OPENROUTER_API_KEY`, `RESEND_API_KEY`, `LANGSMITH_API_KEY`).
- **Frontend → Netlify**: base directory `web`, usa `web/netlify.toml` (build/publish
  já configurados). Defina `VITE_API_BASE_URL` com a URL pública do backend no Render.

## Testes

```bash
npm test          # backend: unit + e2e
npm run test:unit # só unit — sem chamar API real
npm run test:e2e  # só e2e — chama o LLM real (precisa de OPENROUTER_API_KEY)
```

O frontend não tem testes automatizados — validação é manual.

## Limitações conhecidas

- Persistência é 100% em memória — reiniciar o backend apaga sessões e relatórios.
- Web Speech API não funciona em PWA **instalado** na tela de início do iOS (funciona
  normalmente como aba de navegador em qualquer plataforma).
- Sandbox `onboarding@resend.dev` só entrega email pro dono da conta Resend — para
  enviar a qualquer destinatário é necessário verificar um domínio próprio.
