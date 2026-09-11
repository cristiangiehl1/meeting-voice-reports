const MIN_DB = -60;

/** Converte RMS linear (0-1) pra uma escala 0-1 baseada em dB, melhor pra medidor visual. */
export function rmsToLevel(rms: number): number {
  if (rms <= 0) return 0;
  const db = 20 * Math.log10(rms);
  return Math.max(0, Math.min(1, (db - MIN_DB) / -MIN_DB));
}

export function rmsFromTimeDomainData(data: Float32Array): number {
  let sumSquares = 0;
  for (let i = 0; i < data.length; i++) {
    sumSquares += data[i] * data[i];
  }
  return data.length > 0 ? Math.sqrt(sumSquares / data.length) : 0;
}

export type AudioQuality = 'silencio' | 'fraco' | 'bom' | 'alto';

export function classifyLevel(level: number): AudioQuality {
  if (level < 0.15) return 'silencio';
  if (level < 0.4) return 'fraco';
  if (level < 0.75) return 'bom';
  return 'alto';
}
