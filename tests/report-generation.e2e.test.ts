import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.ts';
import { SessionService } from '../src/services/sessionService.ts';
import { ReportService } from '../src/services/reportService.ts';
import { StubEmailService } from '../src/services/emailService.ts';

describe('Meeting Voice Reports - E2E', async () => {
  const sessionService = new SessionService();
  const app = createServer({
    sessionService,
    reportService: new ReportService(),
    emailService: new StubEmailService(),
  });

  it('gera um relatório de reunião a partir do transcript acumulado', async () => {
    const createResponse = await app.inject({
      method: 'POST',
      url: '/sessions',
      payload: { reportType: 'meeting' },
    });

    assert.equal(createResponse.statusCode, 201);
    const { id } = JSON.parse(createResponse.body);

    sessionService.appendTranscript(id, {
      text: 'Ana: bom dia pessoal, vamos revisar o roadmap do trimestre.',
      startMs: 0,
      endMs: 3000,
    });
    sessionService.appendTranscript(id, {
      text: 'Bruno: eu fico responsável por revisar o contrato até sexta-feira.',
      startMs: 3000,
      endMs: 6000,
    });

    const finalizeResponse = await app.inject({
      method: 'POST',
      url: `/sessions/${id}/finalize`,
    });

    assert.equal(finalizeResponse.statusCode, 200);
    const report = JSON.parse(finalizeResponse.body);

    assert.equal(report.reportType, 'meeting');
    assert.ok(report.data);
  });
});
