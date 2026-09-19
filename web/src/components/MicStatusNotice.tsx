import { useState } from 'react';
import { motion } from 'motion/react';
import { ExternalLink, MicOff, RefreshCw } from 'lucide-react';
import { isRecheckable, micIssueTitle, type MicStatus } from '../lib/micSupport.ts';
import { Button } from './ui/Button.tsx';

type Props = {
  status: MicStatus;
  onRecheck: () => Promise<void>;
};

export function MicStatusNotice({ status, onRecheck }: Props) {
  const [rechecking, setRechecking] = useState(false);

  if (status.kind !== 'blocked') return null;

  async function handleRecheck() {
    setRechecking(true);
    try {
      await onRecheck();
    } finally {
      setRechecking(false);
    }
  }

  return (
    <motion.div
      role="alert"
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative flex gap-3.5 overflow-hidden rounded-card p-4 glass ring-1 ring-inset ring-[color-mix(in_oklch,var(--danger)_35%,transparent)]"
    >
      <span
        aria-hidden
        className="absolute inset-y-0 left-0 w-[3px] bg-gradient-to-b from-danger/80 via-danger/40 to-transparent"
      />
      <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-[color-mix(in_oklch,var(--danger)_14%,transparent)] text-danger">
        <MicOff aria-hidden className="size-4.5" />
      </span>

      <div className="flex min-w-0 flex-col items-start gap-2.5">
        <div className="flex flex-col gap-1">
          <p className="font-display font-semibold tracking-tight text-danger">{micIssueTitle(status.issue)}</p>
          <p className="text-sm text-muted text-pretty">{status.message}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {status.issue === 'ios-standalone-pwa' ? (
            // Quem já instalou na tela de início fica sem saída: o reconhecimento nunca vai
            // funcionar ali. Em modo standalone o iOS abre links target="_blank" no Safari,
            // então este é o caminho de volta em um toque. Precisa ser âncora de verdade.
            <a
              href={window.location.href}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-accent px-5 text-[0.95rem] font-medium text-accent-ink no-underline transition-[filter] duration-200 hover:brightness-110"
            >
              <ExternalLink aria-hidden className="size-4" />
              Abrir no Safari
            </a>
          ) : null}

          {isRecheckable(status.issue) ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void handleRecheck()}
              loading={rechecking}
              icon={rechecking ? undefined : <RefreshCw className="size-4" />}
            >
              {rechecking ? 'Verificando' : 'Verificar de novo'}
            </Button>
          ) : null}
        </div>
      </div>
    </motion.div>
  );
}
