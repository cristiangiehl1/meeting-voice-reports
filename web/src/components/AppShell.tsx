import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { AudioLines, Check } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn.ts';

export type Step = 'pick-type' | 'session' | 'report';

const STEPS: { id: Step; label: string; short: string }[] = [
  { id: 'pick-type', label: 'Tipo de sessão', short: 'Tipo' },
  { id: 'session', label: 'Gravação', short: 'Gravação' },
  { id: 'report', label: 'Relatório', short: 'Relatório' },
];

/** Gradiente de malha do fundo. Três manchas de cor sob blur pesado — animadas com
 *  CSS (não com Motion) para não manter o main thread ocupado durante a gravação. */
function MeshBackground() {
  const reduced = useReducedMotion();
  const drift = reduced ? undefined : 'drift var(--d) ease-in-out infinite';

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden grain">
      <div className="absolute inset-0 bg-canvas" />
      <div
        className="absolute -top-[30%] -left-[15%] size-[70vmax] rounded-full blur-[110px]"
        style={{ background: 'radial-gradient(circle, var(--mesh-a), transparent 65%)', animation: drift, ['--d' as string]: '26s' }}
      />
      <div
        className="absolute -right-[20%] top-[5%] size-[60vmax] rounded-full blur-[120px]"
        style={{ background: 'radial-gradient(circle, var(--mesh-b), transparent 65%)', animation: drift, ['--d' as string]: '34s' }}
      />
      <div
        className="absolute -bottom-[30%] left-[10%] size-[65vmax] rounded-full blur-[130px]"
        style={{ background: 'radial-gradient(circle, var(--mesh-c), transparent 70%)', animation: drift, ['--d' as string]: '42s' }}
      />
      <div className="absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-canvas-deep" />
    </div>
  );
}

function Stepper({ current }: { current: Step }) {
  const currentIndex = STEPS.findIndex((step) => step.id === current);

  return (
    <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Progresso da sessão">
      {STEPS.map((step, index) => {
        const done = index < currentIndex;
        const active = index === currentIndex;

        return (
          <li key={step.id} className="flex items-center gap-1.5 sm:gap-2">
            <div
              className={cn(
                'relative flex items-center gap-2 rounded-full px-2.5 py-1.5 text-xs font-medium transition-colors duration-300',
                active ? 'text-ink' : done ? 'text-muted' : 'text-faint',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {active ? (
                <motion.span
                  layoutId="step-pill"
                  className="absolute inset-0 rounded-full bg-accent-soft ring-1 ring-inset ring-[color-mix(in_oklch,var(--accent)_35%,transparent)]"
                  transition={{ type: 'spring', stiffness: 420, damping: 36 }}
                />
              ) : null}
              <span
                className={cn(
                  'relative flex size-4 items-center justify-center rounded-full text-[10px] ring-1 ring-inset',
                  done ? 'bg-accent text-accent-ink ring-transparent' : active ? 'ring-accent text-accent' : 'ring-line',
                )}
              >
                {done ? <Check aria-hidden className="size-2.5" strokeWidth={3} /> : index + 1}
              </span>
              <span className="relative hidden sm:inline">{step.label}</span>
              <span className="relative sm:hidden">{step.short}</span>
            </div>
            {index < STEPS.length - 1 ? (
              <span
                aria-hidden
                className={cn('h-px w-3 sm:w-5 transition-colors duration-300', done ? 'bg-accent/60' : 'bg-line')}
              />
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

type Props = {
  step: Step;
  children: ReactNode;
};

export function AppShell({ step, children }: Props) {
  return (
    <div className="relative min-h-dvh">
      <MeshBackground />

      <div
        className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col px-4 sm:px-6"
        style={{
          paddingTop: 'calc(1.25rem + env(safe-area-inset-top))',
          paddingBottom: 'calc(2.5rem + env(safe-area-inset-bottom))',
        }}
      >
        <header className="flex flex-wrap items-center justify-between gap-3 pb-6">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-accent-soft ring-1 ring-inset ring-[color-mix(in_oklch,var(--accent)_30%,transparent)]">
              <AudioLines aria-hidden className="size-4.5 text-accent" />
            </span>
            <span className="font-display text-sm font-semibold tracking-[0.14em] uppercase text-muted">
              Meeting Voice Reports
            </span>
          </div>
          <Stepper current={step} />
        </header>

        <main className="flex flex-1 flex-col">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={step}
              initial={{ opacity: 0, y: 14, filter: 'blur(6px)' }}
              animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
              exit={{ opacity: 0, y: -10, filter: 'blur(6px)' }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              className="flex flex-1 flex-col gap-4"
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
