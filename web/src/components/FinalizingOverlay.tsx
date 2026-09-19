import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Check, Loader2 } from 'lucide-react';
import { cn } from '../lib/cn.ts';

// Passos indicativos: o backend não reporta progresso, então isto comunica que há
// trabalho acontecendo, não em que etapa ele está de fato.
const STEPS = ['Organizando a transcrição', 'Extraindo os dados estruturados', 'Montando o relatório'];
const STEP_INTERVAL_MS = 2600;

/** O avanço dos passos vive aqui, e não no componente de fora, porque o overlay só
 *  monta enquanto `open` — assim cada finalize recomeça do primeiro passo sem precisar
 *  de um efeito de reset. */
function Steps() {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setIndex((current) => Math.min(current + 1, STEPS.length - 1));
    }, STEP_INTERVAL_MS);

    return () => window.clearInterval(interval);
  }, []);

  return (
    <ul className="flex flex-col gap-2.5">
      {STEPS.map((step, stepIndex) => {
        const done = stepIndex < index;
        const active = stepIndex === index;

        return (
          <li
            key={step}
            className={cn(
              'flex items-center gap-2.5 text-sm transition-colors duration-500',
              active ? 'text-ink' : done ? 'text-muted' : 'text-faint',
            )}
          >
            <span
              className={cn(
                'grid size-4 shrink-0 place-items-center rounded-full ring-1 ring-inset transition-colors duration-500',
                done ? 'bg-accent text-accent-ink ring-transparent' : active ? 'ring-accent' : 'ring-line',
              )}
            >
              {done ? <Check aria-hidden className="size-2.5" strokeWidth={3} /> : null}
              {active ? <span className="size-1.5 rounded-full bg-accent animate-pulse" /> : null}
            </span>
            {step}
          </li>
        );
      })}
    </ul>
  );
}

export function FinalizingOverlay({ open }: { open: boolean }) {
  return (
    <AnimatePresence>
      {open ? (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          className="fixed inset-0 z-50 grid place-items-center bg-canvas-deep/70 px-6 backdrop-blur-md"
          role="status"
          aria-live="polite"
        >
          <motion.div
            initial={{ scale: 0.94, y: 12 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.96, y: 8 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="flex w-full max-w-sm flex-col gap-5 rounded-panel glass-raised p-6"
          >
            <div className="flex items-center gap-3">
              <span className="relative grid size-10 place-items-center">
                <span className="absolute inset-0 rounded-full bg-accent/20 blur-md" />
                <Loader2 aria-hidden className="relative size-6 animate-spin text-accent" />
              </span>
              <div className="flex flex-col">
                <p className="font-display font-semibold tracking-tight">Gerando o relatório</p>
                <p className="text-sm text-muted">Pode levar alguns segundos.</p>
              </div>
            </div>

            <Steps />
          </motion.div>
        </motion.div>
      ) : null}
    </AnimatePresence>
  );
}
