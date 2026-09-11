import { describe, it, expect } from 'vitest';
import { rmsToLevel, rmsFromTimeDomainData, classifyLevel } from './audioLevel.ts';

describe('rmsToLevel', () => {
  it('mapeia silêncio total pra 0', () => {
    expect(rmsToLevel(0)).toBe(0);
  });

  it('mapeia amplitude máxima (rms=1, 0dB) pra 1', () => {
    expect(rmsToLevel(1)).toBeCloseTo(1, 5);
  });

  it('é monotônica crescente com o rms', () => {
    expect(rmsToLevel(0.1)).toBeGreaterThan(rmsToLevel(0.01));
    expect(rmsToLevel(0.5)).toBeGreaterThan(rmsToLevel(0.1));
  });
});

describe('rmsFromTimeDomainData', () => {
  it('retorna 0 para silêncio (todos zeros)', () => {
    expect(rmsFromTimeDomainData(new Float32Array(100))).toBe(0);
  });

  it('retorna a amplitude constante para um sinal constante', () => {
    const data = new Float32Array(10).fill(0.5);
    expect(rmsFromTimeDomainData(data)).toBeCloseTo(0.5, 5);
  });
});

describe('classifyLevel', () => {
  it('classifica os limites esperados', () => {
    expect(classifyLevel(0)).toBe('silencio');
    expect(classifyLevel(0.2)).toBe('fraco');
    expect(classifyLevel(0.5)).toBe('bom');
    expect(classifyLevel(0.9)).toBe('alto');
  });
});
