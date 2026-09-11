import { Resend } from 'resend';
import { emailConfig } from '../config.ts';

export interface EmailSender {
  sendReportEmail(reportId: string, subject: string, html: string, to?: string): Promise<unknown>;
}

export class EmailService implements EmailSender {
  private client: Resend;
  private from: string;
  private defaultRecipient: string;

  constructor(apiKey: string = emailConfig.apiKey, from: string = emailConfig.from, defaultRecipient: string = emailConfig.reportRecipient) {
    this.client = new Resend(apiKey);
    this.from = from;
    this.defaultRecipient = defaultRecipient;
  }

  async sendReportEmail(reportId: string, subject: string, html: string, to: string = this.defaultRecipient) {
    const { data, error } = await this.client.emails.send(
      {
        from: this.from,
        to,
        subject,
        html,
      },
      { idempotencyKey: `meeting-report/${reportId}` },
    );

    if (error) {
      throw new Error(`Falha ao enviar email do relatório: ${error.message}`);
    }

    return data;
  }
}

/** Stub sem provider real — usado em testes/desenvolvimento sem chamar a API do Resend. */
export class StubEmailService implements EmailSender {
  async sendReportEmail(_reportId: string, _subject: string, _html: string, _to?: string): Promise<unknown> {
    return null;
  }
}
