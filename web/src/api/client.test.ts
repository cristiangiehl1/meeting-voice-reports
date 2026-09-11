import { describe, it, expect, vi, afterEach } from 'vitest';
import { ApiClientError, createSession, finalizeSession } from './client.ts';

describe('createSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna a sessão quando a API responde 201 com um corpo válido', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      status: 201,
      json: async () => ({
        id: '1',
        reportType: 'meeting',
        chunks: [],
        createdAt: '2026-01-01T00:00:00.000Z',
      }),
    });
    vi.stubGlobal('fetch', mockFetch);

    const session = await createSession('http://localhost:3000', 'meeting');

    expect(session.id).toBe('1');
    expect(session.reportType).toBe('meeting');
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/sessions',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('lança ApiClientError quando a resposta não é 201', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 400, json: async () => ({ error: 'inválido' }) }),
    );

    await expect(createSession('http://localhost:3000', 'meeting')).rejects.toBeInstanceOf(ApiClientError);
  });
});

describe('finalizeSession', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('retorna o relatório quando a API responde 200', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        status: 200,
        json: async () => ({
          id: '1',
          sessionId: '1',
          reportType: 'meeting',
          data: { titulo: 'Reunião de teste' },
          createdAt: '2026-01-01T00:00:00.000Z',
        }),
      }),
    );

    const report = await finalizeSession('http://localhost:3000', '1');

    expect(report.reportType).toBe('meeting');
    expect(report.data).toEqual({ titulo: 'Reunião de teste' });
  });

  it('propaga a mensagem de erro do backend', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ status: 422, json: async () => ({ error: 'transcript vazio' }) }),
    );

    await expect(finalizeSession('http://localhost:3000', '1')).rejects.toThrow('transcript vazio');
  });
});
