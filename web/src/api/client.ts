import { sessionSchema, storedReportSchema, type ReportType, type SessionView, type StoredReportView } from './types.ts';

export class ApiClientError extends Error {
  readonly status: number | null;
  readonly body: unknown;

  constructor(message: string, status: number | null = null, body?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.body = body;
  }
}

export function joinBase(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/+$/, '');
  const suffix = path.startsWith('/') ? path : `/${path}`;
  return `${base}${suffix}`;
}

export async function createSession(baseUrl: string, reportType: ReportType): Promise<SessionView> {
  const response = await fetch(joinBase(baseUrl, '/sessions'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ reportType }),
  });

  const json: unknown = await response.json().catch(() => null);
  if (response.status !== 201) {
    throw new ApiClientError(`Falha ao criar sessão (HTTP ${response.status})`, response.status, json);
  }

  const parsed = sessionSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError('Resposta de sessão inválida', response.status, json);
  }
  return parsed.data;
}

export async function postTranscript(baseUrl: string, sessionId: string, text: string, speaker?: string): Promise<void> {
  const response = await fetch(joinBase(baseUrl, `/sessions/${sessionId}/transcript`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, speaker }),
  });

  if (response.status !== 201) {
    const json: unknown = await response.json().catch(() => null);
    throw new ApiClientError(`Falha ao enviar transcrição (HTTP ${response.status})`, response.status, json);
  }
}

export async function finalizeSession(baseUrl: string, sessionId: string): Promise<StoredReportView> {
  const response = await fetch(joinBase(baseUrl, `/sessions/${sessionId}/finalize`), {
    method: 'POST',
  });

  const json: unknown = await response.json().catch(() => null);
  if (response.status !== 200) {
    const message =
      json && typeof json === 'object' && 'error' in json ? String((json as { error: unknown }).error) : null;
    throw new ApiClientError(message ?? `Falha ao finalizar sessão (HTTP ${response.status})`, response.status, json);
  }

  const parsed = storedReportSchema.safeParse(json);
  if (!parsed.success) {
    throw new ApiClientError('Resposta de relatório inválida', response.status, json);
  }
  return parsed.data;
}

export async function sendReportEmail(baseUrl: string, reportId: string, to: string[]): Promise<void> {
  const response = await fetch(joinBase(baseUrl, `/reports/${reportId}/email`), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ to }),
  });

  if (response.status !== 200) {
    const json: unknown = await response.json().catch(() => null);
    const message =
      json && typeof json === 'object' && 'error' in json ? String((json as { error: unknown }).error) : null;
    throw new ApiClientError(message ?? `Falha ao enviar email (HTTP ${response.status})`, response.status, json);
  }
}
