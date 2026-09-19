const STORAGE_KEY = 'mvr:last-recipients';

// Formato pragmático, igual ao usado na validação do backend: barra o que nunca
// poderia ser entregue sem tentar cobrir a RFC inteira.
const EMAIL_PATTERN = /^[^@\s,]+@[^@\s,.]+(\.[^@\s,.]+)+$/;

export function parseRecipients(raw: string): string[] {
  return raw
    .split(/[,;\s]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export function isValidEmail(email: string): boolean {
  return EMAIL_PATTERN.test(email);
}

export function invalidRecipients(recipients: readonly string[]): string[] {
  return recipients.filter((email) => !isValidEmail(email));
}

/** O último destinatário usado fica no localStorage porque o caso comum é mandar
 *  sempre pro mesmo endereço — redigitar a cada sessão seria atrito puro. */
export function loadLastRecipients(): string {
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? '';
  } catch {
    // Safari em navegação privada lança ao ler o localStorage.
    return '';
  }
}

export function saveLastRecipients(raw: string): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, raw);
  } catch {
    // Não poder lembrar o endereço não é motivo pra quebrar o envio.
  }
}
