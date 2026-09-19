import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from '../src/server.ts';
import { ReportService } from '../src/services/reportService.ts';
import { composeRecipients, type EmailSender } from '../src/services/emailService.ts';

class RecordingEmailService implements EmailSender {
  calls: { subject: string; html: string; to?: string[] }[] = [];

  async sendReportEmail(subject: string, html: string, to?: string[]): Promise<unknown> {
    this.calls.push({ subject, html, to });
    return null;
  }
}

function buildApp() {
  const reportService = new ReportService();
  const emailService = new RecordingEmailService();
  const report = reportService.save('sessao-1', 'meeting', { resumo: 'Tudo certo' });
  const app = createServer({ reportService, emailService });

  return { app, emailService, reportId: report.id };
}

describe('composeRecipients', () => {
  it('acrescenta a cópia fixa aos destinatários informados', () => {
    const recipients = composeRecipients(['ana@empresa.com'], 'arquivo@empresa.com');

    assert.deepEqual(recipients, ['ana@empresa.com', 'arquivo@empresa.com']);
  });

  it('não duplica quando o usuário digita o próprio destinatário fixo', () => {
    const recipients = composeRecipients(['Arquivo@Empresa.com'], 'arquivo@empresa.com');

    assert.deepEqual(recipients, ['Arquivo@Empresa.com']);
  });

  it('ignora entradas vazias e funciona sem destinatário fixo configurado', () => {
    assert.deepEqual(composeRecipients(['  ana@empresa.com  ', ''], ''), ['ana@empresa.com']);
    assert.deepEqual(composeRecipients(undefined, 'arquivo@empresa.com'), ['arquivo@empresa.com']);
    assert.deepEqual(composeRecipients([], ''), []);
  });
});

describe('POST /reports/:id/email', () => {
  it('repassa os destinatários informados para o serviço de email', async () => {
    const { app, emailService, reportId } = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/reports/${reportId}/email`,
      payload: { to: ['ana@empresa.com', 'bruno@empresa.com'] },
    });

    assert.equal(response.statusCode, 200);
    assert.equal(emailService.calls.length, 1);
    assert.deepEqual(emailService.calls[0].to, ['ana@empresa.com', 'bruno@empresa.com']);
    await app.close();
  });

  it('aceita a chamada sem destinatários, deixando o padrão para o serviço', async () => {
    const { app, emailService, reportId } = buildApp();

    const response = await app.inject({ method: 'POST', url: `/reports/${reportId}/email` });

    assert.equal(response.statusCode, 200);
    assert.deepEqual(emailService.calls[0].to, undefined);
    await app.close();
  });

  it('rejeita endereço inválido sem chamar o serviço de email', async () => {
    const { app, emailService, reportId } = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/reports/${reportId}/email`,
      payload: { to: ['ana@empresa.com', 'nao-e-email'] },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(emailService.calls.length, 0);
    await app.close();
  });

  it('rejeita lista vazia — enviar sem destinatário é erro do cliente, não silêncio', async () => {
    const { app, emailService, reportId } = buildApp();

    const response = await app.inject({
      method: 'POST',
      url: `/reports/${reportId}/email`,
      payload: { to: [] },
    });

    assert.equal(response.statusCode, 400);
    assert.equal(emailService.calls.length, 0);
    await app.close();
  });
});
