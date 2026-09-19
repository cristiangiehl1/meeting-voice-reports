# Redesign do frontend — "studio console" dark-first

Data: 2026-09-19

## Objetivo

Elevar a camada visual do `web/` de CSS funcional para uma interface sofisticada,
com design system real, componentes acessíveis e animação com física. A lógica de
captura de voz não muda.

## Decisões

- **Stack:** Tailwind CSS v4 (config CSS-first via `@theme`, plugin oficial do Vite),
  Radix (pacote `radix-ui` unificado) para primitivas acessíveis, Motion (`motion/react`)
  para transições e layout animations, `lucide-react` para ícones, `sonner` para toasts,
  `cva` + `clsx` + `tailwind-merge` para variantes de componente.
- **Direção visual:** dark-first "studio console" — fundo grafite profundo com gradiente
  de malha, superfícies em vidro (blur + borda luminosa), acento ciano com apoio violeta,
  tipografia display grande. Tema claro completo permanece via `prefers-color-scheme`.
- **Escopo:** as três telas (tipo de sessão → gravação → relatório) mais o estado de
  loading do `finalize`.

## Fundação

`@theme` do Tailwind não pode ser aninhado em media query, então os tokens semânticos
são variáveis CSS comuns declaradas em `:root` (dark) e sobrescritas em
`@media (prefers-color-scheme: light)`; o `@theme inline` apenas as registra para o
Tailwind gerar as utilitárias. Cores em OKLCH.

Fontes self-hosted via `@fontsource-variable` — o app é PWA com precache e não pode
depender de CDN de fonte em runtime.

## Componentes

`src/components/ui/`: `Button` (variantes primary/secondary/ghost/danger, estado
`loading`), `Card`/`GlassPanel`, `Badge`, e o util `cn()`. Radix cobre RadioGroup e
Tooltip. `sonner` cobre feedback de erro e de email enviado.

`AppShell` monta o fundo animado, o header com pill de status do microfone e o stepper
de três passos, cujo indicador desliza com `layoutId`. A troca de passo usa
`AnimatePresence mode="wait"` com fade + slide + blur.

## Telas

**Tipo de sessão.** Cards selecionáveis sobre Radix RadioGroup, com ícone
(Users / UserSearch / CalendarClock), título e descrição do que aquele relatório extrai.
A seleção é marcada por um realce que desliza entre os cards (`layoutId`).

**Gravação.** Componente novo `AudioVisualizer`: no desktop desenha barras alimentadas
por `audioLevel` suavizado com `useSpring`; no mobile (`!showLevelMeter`, onde não há RMS
disponível) desenha um orbe respirando ligado a `isCapturingSpeech`. A moldura visual é a
mesma nos dois regimes. Acompanham: timer mm:ss (estado local do componente — o hook não
é alterado), pill de qualidade de captação, transcript com entrada animada por chunk,
texto interim em itálico com cursor, auto-scroll, e o mínimo de 30 caracteres exibido
como anel de progresso em vez de frase. O botão de gravar é o elemento primário, com anel
pulsante enquanto grava.

**Relatório.** Cabeçalho com tipo e data, campos agrupados em cards com reveal
escalonado, hierarquia visual real para arrays e objetos aninhados, botão de copiar o
relatório, e "Nova sessão" com toast confirmando o envio do email.

**Finalize.** Overlay com passos rotativos ("Organizando transcrição" → "Extraindo dados"
→ "Montando relatório"), substituindo o texto no botão. Os passos são indicativos, não
progresso real.

## Fora de escopo / invariantes

- `hooks/useSpeechSession.ts`, `lib/micSupport.ts`, `lib/wakeLock.ts` e `api/*` não mudam.
- `MicStatusNotice` é reestilizado mantendo a âncora real com `target="_blank"` (é o que
  permite ao iOS sair do modo standalone) e o botão de recheck condicional a
  `isRecheckable`.
- No manifesto PWA, apenas `theme_color` e `background_color` acompanham a nova paleta.
  `display: 'browser'` com `display_override: ['standalone']` permanece como está.
- `prefers-reduced-motion` desliga as animações contínuas (fundo, pulsos, orbe).
- Alvos de toque de 44px são preservados.
- O frontend continua sem testes automatizados; validação é `npm run typecheck`,
  `npm run lint`, `npm run build` e conferência manual.
