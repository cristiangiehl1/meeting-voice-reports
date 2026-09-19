import { useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import type { TranscriptChunkView } from '../api/types.ts';
import { cn } from '../lib/cn.ts';

/** Anel que mostra o quanto falta do mínimo de transcrição exigido pra gerar o
 *  relatório. Substitui a frase com contagem de caracteres. */
function ProgressRing({ value, total }: { value: number; total: number }) {
  const ratio = Math.min(1, value / total);
  const complete = ratio >= 1;
  const radius = 13;
  const circumference = 2 * Math.PI * radius;

  return (
    <span
      className="relative grid size-8 shrink-0 place-items-center"
      role="progressbar"
      aria-valuenow={Math.round(ratio * 100)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label="Progresso até o mínimo de transcrição"
    >
      <svg viewBox="0 0 32 32" className="size-8 -rotate-90">
        <circle cx="16" cy="16" r={radius} fill="none" stroke="var(--line)" strokeWidth="2.5" />
        <circle
          cx="16"
          cy="16"
          r={radius}
          fill="none"
          stroke={complete ? 'var(--success)' : 'var(--accent)'}
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          className="transition-[stroke-dashoffset,stroke] duration-500 ease-out"
        />
      </svg>
    </span>
  );
}

type Props = {
  chunks: TranscriptChunkView[];
  interimText: string;
  charCount: number;
  minChars: number;
};

export function TranscriptPanel({ chunks, interimText, charCount, minChars }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hasContent = chunks.length > 0 || interimText.length > 0;
  const complete = charCount >= minChars;

  useEffect(() => {
    const node = scrollRef.current;
    if (!node) return;
    node.scrollTo({ top: node.scrollHeight, behavior: 'smooth' });
  }, [chunks.length, interimText]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-xs font-medium tracking-[0.14em] uppercase text-faint">Transcrição</h3>
        <div className="flex items-center gap-2">
          <span className={cn('tabular text-xs', complete ? 'text-success' : 'text-muted')}>
            {complete ? 'Pronto para gerar' : `${charCount}/${minChars} caracteres`}
          </span>
          <ProgressRing value={charCount} total={minChars} />
        </div>
      </div>

      <div
        ref={scrollRef}
        className={cn(
          'relative max-h-[min(280px,38dvh)] overflow-y-auto rounded-card px-4 py-3.5',
          'bg-canvas-deep/35 ring-1 ring-inset ring-line',
          '[-webkit-overflow-scrolling:touch]',
        )}
      >
        {!hasContent ? (
          <p className="py-4 text-center text-sm text-faint text-pretty">
            A transcrição aparece aqui conforme você fala.
          </p>
        ) : (
          <ul className="flex flex-col gap-2.5">
            <AnimatePresence initial={false}>
              {chunks.map((chunk, index) => (
                <motion.li
                  key={`${index}-${chunk.startMs}`}
                  initial={{ opacity: 0, y: 8, filter: 'blur(4px)' }}
                  animate={{ opacity: 1, y: 0, filter: 'blur(0px)' }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                  className="flex gap-3 text-[0.94rem] leading-relaxed"
                >
                  <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-accent/50" />
                  <span className="text-pretty">
                    {chunk.speaker ? <strong className="font-semibold text-accent">{chunk.speaker}: </strong> : null}
                    {chunk.text}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>

            {interimText ? (
              <li className="flex gap-3 text-[0.94rem] leading-relaxed text-muted italic">
                <span aria-hidden className="mt-2 size-1.5 shrink-0 rounded-full bg-line-strong" />
                <span className="text-pretty">
                  {interimText}
                  <span aria-hidden className="ml-0.5 inline-block w-px animate-[caret_1s_steps(1)_infinite] align-middle">
                    <span className="inline-block h-[1.1em] w-[2px] translate-y-[0.15em] bg-accent" />
                  </span>
                </span>
              </li>
            ) : null}
          </ul>
        )}
      </div>
    </div>
  );
}
