import { useEffect, useRef, useState } from 'react';

/** Cronômetro de gravação. Acumula o tempo dos trechos em que `running` esteve ativo,
 *  então pausar e continuar a gravação não zera o relógio. Para zerar, remonte o
 *  componente que usa o hook (o Recorder é montado com `key={session.id}`). */
export function useElapsedTime(running: boolean): number {
  const [elapsedMs, setElapsedMs] = useState(0);
  const accumulatedRef = useRef(0);

  useEffect(() => {
    if (!running) return;

    const startedAt = performance.now();
    const interval = window.setInterval(
      () => setElapsedMs(accumulatedRef.current + (performance.now() - startedAt)),
      250,
    );

    return () => {
      window.clearInterval(interval);
      accumulatedRef.current += performance.now() - startedAt;
    };
  }, [running]);

  return elapsedMs;
}

export function formatElapsed(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}
