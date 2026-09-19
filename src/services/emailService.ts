import { Resend } from 'resend';
import { emailConfig } from '../config.ts';

export interface EmailSender {
  sendReportEmail(subject: string, html: string, to?: string[]): Promise<unknown>;
}

/** Monta a lista final de destinatários: o que o usuário pediu mais a cópia fixa
 *  configurada no ambiente, que serve de arquivo central e por isso vai sempre junto.
 *  A comparação é case-insensitive porque digitar o mesmo endereço com outra caixa não
 *  deve render duas cópias do mesmo relatório. */
export function composeRecipients(requested: readonly string[] | undefined, defaultRecipient: string): string[] {
  const seen = new Set<string>();
  const recipients: string[] = [];

  for (const candidate of [...(requested ?? []), defaultRecipient]) {
    const email = candidate.trim();
    if (!email) continue;

    const key = email.toLowerCase();
    if (seen.has(key)) continue;

    seen.add(key);
    recipients.push(email);
  }

  return recipients;
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

  async sendReportEmail(subject: string, html: string, to?: string[]) {
    const recipients = composeRecipients(to, this.defaultRecipient);

    if (recipients.length === 0) {
      throw new Error('Nenhum destinatário para o relatório');
    }

    const { data, error } = await this.client.emails.send({
      from: this.from,
      to: recipients,
      subject,
      html,
    });

    if (error) {
      throw new Error(`Falha ao enviar email do relatório: ${error.message}`);
    }

    return data;
  }
}

/** Stub sem provider real — usado em testes/desenvolvimento sem chamar a API do Resend. */
export class StubEmailService implements EmailSender {
  async sendReportEmail(_subject: string, _html: string, _to?: string[]): Promise<unknown> {
    return null;
  }
}
