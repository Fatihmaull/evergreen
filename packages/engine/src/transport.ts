import type { ExtensionRpc, LedgerEntryReader } from '@evergreen-stellar/core';

export class EngineExecutionError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'EngineExecutionError';
  }
}

function transient(error: unknown): boolean {
  if (error instanceof EngineExecutionError) return error.code === 'RPC_TIMEOUT';
  if (!error || typeof error !== 'object') return false;
  const e = error as {
    status?: unknown;
    response?: { status?: unknown };
    code?: unknown;
    isAxiosError?: unknown;
  };
  const status = e.response?.status ?? e.status;
  return (
    status === 429 ||
    (typeof status === 'number' && status >= 500 && status <= 599) ||
    ['ETIMEDOUT', 'ECONNRESET', 'EAI_AGAIN', 'ECONNREFUSED'].includes(String(e.code)) ||
    (e.isAxiosError === true && status === undefined)
  );
}

/** Bounded reads retry; a send times out as uncertain and is never retried. */
export function executionTransport(
  rpc: ExtensionRpc,
  reader: LedgerEntryReader,
  now: () => Date,
  sleep: (ms: number) => Promise<void>,
  maxRunMs = 240_000,
): { rpc: ExtensionRpc; reader: LedgerEntryReader; checkDeadline: () => void } {
  if (!Number.isSafeInteger(maxRunMs) || maxRunMs <= 0 || maxRunMs > 300_000)
    throw new EngineExecutionError(
      'INVALID_DEADLINE',
      'Run deadline must be between 1 and 300000 milliseconds.',
    );
  const deadline = now().getTime() + maxRunMs;
  const checkDeadline = (): void => {
    if (!Number.isFinite(now().getTime()) || now().getTime() >= deadline)
      throw new EngineExecutionError(
        'RUN_DEADLINE',
        'Engine run deadline reached; no new attempt is permitted.',
      );
  };
  async function bounded<T>(operation: () => Promise<T>): Promise<T> {
    checkDeadline();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const value = await Promise.race([
        operation(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(
            () => reject(new EngineExecutionError('RPC_TIMEOUT', 'RPC request timed out.')),
            Math.min(15_000, deadline - now().getTime()),
          );
        }),
      ]);
      checkDeadline();
      return value;
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
  async function read<T>(operation: () => Promise<T>): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      try {
        return await bounded(operation);
      } catch (error) {
        if (attempt === 2 || !transient(error)) throw error;
        checkDeadline();
        await sleep(1000 * (attempt + 1));
      }
    }
  }
  return {
    checkDeadline,
    reader: { read: (keys) => read(() => reader.read(keys)) },
    rpc: {
      getNetwork: () => read(() => rpc.getNetwork()),
      getAccount: (address) => read(() => rpc.getAccount(address)),
      simulateTransaction: (tx) => read(() => rpc.simulateTransaction(tx)),
      getTransaction: (hash) => read(() => rpc.getTransaction(hash)),
      sendTransaction: (tx) => bounded(() => rpc.sendTransaction(tx)),
    },
  };
}
