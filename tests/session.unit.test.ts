import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { SessionService } from '../src/services/sessionService.ts';

describe('SessionService', () => {
  it('acumula transcript na ordem em que chega e monta o texto completo', () => {
    const service = new SessionService();
    const session = service.create('meeting');

    service.appendTranscript(session.id, { text: 'Bom dia pessoal', speaker: 'Ana', startMs: 0, endMs: 1000 });
    service.appendTranscript(session.id, { text: 'Vamos começar', speaker: 'Ana', startMs: 1000, endMs: 2000 });

    const transcript = service.getFullTranscript(session.id);

    assert.equal(transcript, 'Ana: Bom dia pessoal\nAna: Vamos começar');
  });

  it('lança erro ao referenciar uma sessão inexistente', () => {
    const service = new SessionService();

    assert.throws(() => service.getFullTranscript('nao-existe'));
  });
});
