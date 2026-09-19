type WakeLockSentinelLike = {
  readonly released: boolean;
  release: () => Promise<void>;
};

type WakeLockNavigator = Navigator & {
  wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> };
};

/**
 * Mantém a tela acesa durante a gravação. Sem isto o celular bloqueia a tela, o
 * navegador suspende a aba e o reconhecimento de voz para no meio da sessão.
 * A API não existe em todo navegador — toda falha é degradação silenciosa.
 */
export function createScreenWakeLock() {
  let sentinel: WakeLockSentinelLike | null = null;

  async function acquire(): Promise<void> {
    const api = (navigator as WakeLockNavigator).wakeLock;
    if (!api) return;
    if (sentinel && !sentinel.released) return;

    sentinel = null;
    try {
      sentinel = await api.request('screen');
    } catch {
      // Não suportado, negado, ou aba em segundo plano.
      sentinel = null;
    }
  }

  async function release(): Promise<void> {
    const current = sentinel;
    sentinel = null;
    if (!current || current.released) return;

    try {
      await current.release();
    } catch {
      // Já liberado pelo navegador.
    }
  }

  return { acquire, release };
}
