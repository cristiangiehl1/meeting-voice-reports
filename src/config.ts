export type ModelConfig = {
  apiKey: string;
  httpReferer: string;
  xTitle: string;
  model: string;
  temperature: number;
};

console.assert(process.env.OPENROUTER_API_KEY, 'OPENROUTER_API_KEY is not set in environment variables');

export const config: ModelConfig = {
  apiKey: process.env.OPENROUTER_API_KEY!,
  httpReferer: '',
  xTitle: 'Meeting Voice Reports',
  // Geração do relatório (texto -> texto estruturado)
  // Alternativas: 'openai/gpt-5-nano', 'deepseek/deepseek-v4.1-flash'
  // Free p/ prototipar: 'openrouter/free'
  model: process.env.OPENROUTER_MODEL ?? 'openai/gpt-5.6-luna',
  temperature: 0.2,
};

export type EmailConfig = {
  apiKey: string;
  from: string;
  reportRecipient: string;
};

export const emailConfig: EmailConfig = {
  apiKey: process.env.RESEND_API_KEY ?? '',
  // 'onboarding@resend.dev' (sandbox) só entrega pro e-mail dono da conta Resend.
  // Pra mandar pra qualquer destinatário, verifique um domínio próprio.
  from: process.env.EMAIL_FROM ?? 'onboarding@resend.dev',
  reportRecipient: process.env.REPORT_EMAIL_TO ?? 'cristian.giehl@gmail.com',
};
