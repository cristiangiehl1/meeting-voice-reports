import type { ReportType } from '../schemas/index.ts';

export type TranscriptChunk = {
  text: string;
  speaker?: string;
  startMs: number;
  endMs: number;
};

export type Session = {
  id: string;
  reportType: ReportType;
  chunks: TranscriptChunk[];
  createdAt: string;
  finalizedAt?: string;
};

const sessions = new Map<string, Session>();

export class SessionService {
  create(reportType: ReportType): Session {
    const session: Session = {
      id: crypto.randomUUID(),
      reportType,
      chunks: [],
      createdAt: new Date().toISOString(),
    };
    sessions.set(session.id, session);
    return session;
  }

  get(sessionId: string): Session | undefined {
    return sessions.get(sessionId);
  }

  appendTranscript(sessionId: string, chunk: TranscriptChunk): Session {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão não encontrada: ${sessionId}`);
    }
    session.chunks.push(chunk);
    return session;
  }

  finalize(sessionId: string): Session {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão não encontrada: ${sessionId}`);
    }
    session.finalizedAt = new Date().toISOString();
    return session;
  }

  getFullTranscript(sessionId: string): string {
    const session = sessions.get(sessionId);
    if (!session) {
      throw new Error(`Sessão não encontrada: ${sessionId}`);
    }
    return session.chunks
      .map((chunk) => (chunk.speaker ? `${chunk.speaker}: ${chunk.text}` : chunk.text))
      .join('\n');
  }
}
