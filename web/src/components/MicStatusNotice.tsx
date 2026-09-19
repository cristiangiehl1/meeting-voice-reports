import { useState } from 'react';
import type { MicStatus } from '../lib/micSupport.ts';

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
      <p className="notice__title">Microfone indisponível</p>
      <p className="notice__message">{status.message}</p>
      <button type="button" className="secondary" onClick={() => void handleRecheck()} disabled={rechecking}>
        {rechecking ? 'Verificando...' : 'Verificar de novo'}
      </button>
    </div>
  );
}
