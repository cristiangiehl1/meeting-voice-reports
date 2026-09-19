import { useState } from 'react';
import { isRecheckable, micIssueTitle, type MicStatus } from '../lib/micSupport.ts';

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
    <div className="notice" role="alert">
      <p className="notice__title">{micIssueTitle(status.issue)}</p>
      <p className="notice__message">{status.message}</p>

      {status.issue === 'ios-standalone-pwa' ? (
        // Quem já instalou na tela de início fica sem saída: o reconhecimento nunca vai
        // funcionar ali. Em modo standalone o iOS abre links target="_blank" no Safari,
        // então este é o caminho de volta em um toque.
        <a className="notice__action" href={window.location.href} target="_blank" rel="noopener noreferrer">
          Abrir no Safari
        </a>
      ) : null}

      {isRecheckable(status.issue) ? (
        <button type="button" className="secondary" onClick={() => void handleRecheck()} disabled={rechecking}>
          {rechecking ? 'Verificando...' : 'Verificar de novo'}
        </button>
      ) : null}
    </div>
  );
}
