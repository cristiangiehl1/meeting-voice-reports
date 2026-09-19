import { useEffect, useRef, useState } from 'react';
import { Mic } from 'lucide-react';
import type { AudioQuality } from '../lib/audioLevel.ts';
import { cn } from '../lib/cn.ts';
import { formatElapsed } from '../hooks/useElapsedTime.ts';

const QUALITY: Record<AudioQuality, { label: string; className: string; dot: string }> = {
  silencio: { label: 'Sem captação', className: 'text-danger', dot: 'bg-danger' },
  fraco: { label: 'Captando fraco', className: 'text-warning', dot: 'bg-warning' },
  bom: { label: 'Captando bem', className: 'text-success', dot: 'bg-success' },
  alto: { label: 'Captando alto', className: 'text-warning', dot: 'bg-warning' },
};

const BAR_COUNT = 40;

/** Barras alimentadas pelo RMS real. Cada atualização empurra o nível atual no fim de
 *  um histórico deslizante, então as barras andam da direita pra esquerda como uma
 *  forma de onda. Só existe no desktop — no mobile o microfone é exclusivo do
 *  reconhecimento e não há RMS pra ler. */
function Waveform({ level }: { level: number }) {
  const [bars, setBars] = useState<number[]>(() => Array<number>(BAR_COUNT).fill(0));
  const levelRef = useRef(level);

  useEffect(() => {
    levelRef.current = level;
  }, [level]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setBars((previous) => [...previous.slice(1), levelRef.current]);
    }, 70);
    return () => window.clearInterval(interval);
  }, []);

  return (
    <div className="flex h-24 w-full items-center justify-center gap-[3px]" aria-hidden>
      {bars.map((value, index) => {
        // As pontas caem pra dar a sensação de foco no centro.
        const falloff = 0.55 + 0.45 * Math.sin((index / (BAR_COUNT - 1)) * Math.PI);
        const height = Math.max(3, value * falloff * 96);

        return (
          <span
            key={index}
            className="w-[3px] rounded-full bg-gradient-to-t from-accent/40 to-accent transition-[height] duration-100 ease-out sm:w-1"
            style={{ height: `${height}px`, opacity: 0.35 + value * 0.65 }}
          />
        );
      })}
    </div>
  );
}

/** Substitui a forma de onda no mobile: sem RMS, o único sinal disponível é se o
 *  reconhecimento está ouvindo fala agora. */
function BreathingOrb({ active }: { active: boolean }) {
  return (
    <div className="grid h-24 place-items-center" aria-hidden>
      <div className="relative grid size-20 place-items-center">
        <span
          className={cn(
            'absolute inset-0 rounded-full bg-accent/25 blur-md',
            active ? 'animate-[breathe_1.6s_ease-in-out_infinite]' : 'opacity-30',
          )}
        />
        <span
          className={cn(
            'absolute inset-3 rounded-full bg-accent/30',
            active ? 'animate-[breathe_1.6s_ease-in-out_infinite_0.2s]' : 'opacity-40',
          )}
        />
        <span className="relative grid size-11 place-items-center rounded-full bg-accent text-accent-ink">
          <Mic className="size-5" />
        </span>
      </div>
    </div>
  );
}

type Props = {
  showWaveform: boolean;
  level: number;
  quality: AudioQuality;
  isCapturingSpeech: boolean;
  hasInterimText: boolean;
  elapsedMs: number;
};

export function AudioVisualizer({
  showWaveform,
  level,
  quality,
  isCapturingSpeech,
  hasInterimText,
  elapsedMs,
}: Props) {
  const active = isCapturingSpeech || hasInterimText;
  // No mobile não há medição de nível, então a legenda fala de atividade de fala em
  // vez de qualidade de captação — prometer "captando bem" sem medir seria mentira.
  const status = showWaveform
    ? QUALITY[quality]
    : active
      ? { label: 'Captando fala', className: 'text-success', dot: 'bg-success' }
      : { label: 'Ouvindo — pode falar', className: 'text-muted', dot: 'bg-muted' };

  return (
    <div
      className="relative overflow-hidden rounded-card bg-canvas-deep/40 ring-1 ring-inset ring-line"
      role="status"
      aria-live="off"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-accent/40 to-transparent" />

      <div className="flex items-center justify-between px-4 pt-3 text-xs">
        <span className="tabular text-lg font-medium text-ink sm:text-xl">{formatElapsed(elapsedMs)}</span>
        <span className={cn('inline-flex items-center gap-1.5 font-medium', status.className)}>
          <span className={cn('size-1.5 rounded-full', status.dot, active && 'animate-pulse')} />
          {status.label}
        </span>
      </div>

      <div className="px-3 pb-3">
        {showWaveform ? <Waveform level={level} /> : <BreathingOrb active={active} />}
      </div>

      <span className="sr-only">
        Gravando há {formatElapsed(elapsedMs)}. {status.label}.
      </span>
    </div>
  );
}
