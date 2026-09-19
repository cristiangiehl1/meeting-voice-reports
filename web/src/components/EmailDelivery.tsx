import { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AtSign, Mail, SkipForward, X } from 'lucide-react';
import { cn } from '../lib/cn.ts';
import { invalidRecipients, loadLastRecipients, parseRecipients } from '../lib/recipients.ts';
import { Button } from './ui/Button.tsx';
import { Card, CardBody } from './ui/Card.tsx';

type Props = {
  onSend: (recipients: string[]) => void;
  onSkip: () => void;
  sending: boolean;
};

export function EmailDelivery({ onSend, onSkip, sending }: Props) {
  const [raw, setRaw] = useState(() => loadLastRecipients());
  // Só depois da primeira tentativa de envio: apontar erro enquanto a pessoa ainda
  // está digitando o primeiro endereço é ruído, não ajuda.
  const [submitted, setSubmitted] = useState(false);

  const recipients = parseRecipients(raw);
  const invalid = invalidRecipients(recipients);
  const showErrors = submitted && (recipients.length === 0 || invalid.length > 0);

  function handleSubmit() {
    setSubmitted(true);
    if (recipients.length === 0 || invalid.length > 0) return;
    onSend(recipients);
  }

  function removeRecipient(target: string) {
    setRaw(recipients.filter((email) => email !== target).join(', '));
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium tracking-[0.16em] uppercase text-accent">Último passo</p>
        <h1 className="font-display text-3xl leading-[1.1] font-semibold tracking-tight text-balance sm:text-4xl">
          Para quem <span className="text-gradient">enviamos</span>?
        </h1>
        <p className="max-w-lg text-muted text-pretty">
          Separe vários endereços por vírgula. Lembramos o último destinatário para a próxima sessão.
        </p>
      </div>

      <Card>
        <CardBody>
          <label className="flex flex-col gap-2">
            <span className="text-xs font-medium tracking-[0.14em] uppercase text-faint">Email do destinatário</span>
            <span
              className={cn(
                'flex items-center gap-2.5 rounded-2xl px-4 transition-colors duration-200',
                'bg-canvas-deep/40 ring-1 ring-inset',
                showErrors ? 'ring-[color-mix(in_oklch,var(--danger)_50%,transparent)]' : 'ring-line',
                'focus-within:ring-accent',
              )}
            >
              <AtSign aria-hidden className="size-4 shrink-0 text-faint" />
              <input
                type="email"
                inputMode="email"
                multiple
                autoComplete="email"
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                placeholder="nome@empresa.com.br"
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') handleSubmit();
                }}
                aria-invalid={showErrors}
                className="min-h-12 w-full border-0 bg-transparent py-3 text-[0.95rem] outline-none placeholder:text-faint"
              />
            </span>
          </label>

          <AnimatePresence initial={false}>
            {recipients.length > 0 ? (
              <motion.ul
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                className="flex flex-wrap gap-2 overflow-hidden"
              >
                {recipients.map((email) => {
                  const bad = invalid.includes(email);

                  return (
                    <li key={email}>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1.5 rounded-full py-1 pr-1 pl-3 text-xs ring-1 ring-inset',
                          bad
                            ? 'bg-[color-mix(in_oklch,var(--danger)_12%,transparent)] text-danger ring-[color-mix(in_oklch,var(--danger)_40%,transparent)]'
                            : 'bg-accent-soft text-accent ring-[color-mix(in_oklch,var(--accent)_35%,transparent)]',
                        )}
                      >
                        {email}
                        <button
                          type="button"
                          onClick={() => removeRecipient(email)}
                          aria-label={`Remover ${email}`}
                          className="grid size-5 place-items-center rounded-full transition-colors hover:bg-surface-raised"
                        >
                          <X aria-hidden className="size-3" />
                        </button>
                      </span>
                    </li>
                  );
                })}
              </motion.ul>
            ) : null}
          </AnimatePresence>

          {showErrors ? (
            <p role="alert" className="text-sm text-danger text-pretty">
              {recipients.length === 0
                ? 'Informe ao menos um endereço de email.'
                : `Endereço inválido: ${invalid.join(', ')}`}
            </p>
          ) : null}

          <div className="flex flex-col gap-2 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
            <Button variant="ghost" size="sm" onClick={onSkip} disabled={sending} icon={<SkipForward className="size-4" />}>
              Pular e começar nova sessão
            </Button>
            <Button
              size="lg"
              onClick={handleSubmit}
              loading={sending}
              icon={sending ? undefined : <Mail className="size-4" />}
              className="sm:ml-auto"
            >
              {sending ? 'Enviando' : 'Enviar relatório'}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
