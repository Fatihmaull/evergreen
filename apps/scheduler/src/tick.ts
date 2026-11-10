/**
 * One scheduler tick, Stage 0 of PH2-E4-04 (docs/PH2-E4-04-SCHEDULER-DESIGN.md §3, §4):
 * read the chain's latest ledger and record it. That row is the heartbeat the
 * scheduler gap, DoD-2 and `THRESHOLD_FLOOR_LEDGERS` are measured from.
 *
 * It signs nothing, submits nothing and holds no key.
 *
 * **What counts as a failure, and what does not.** Only the three things that can
 * fail from outside are wrapped: the RPC call, its body, and the database write.
 * Each becomes a `TickError` with a fixed code and **no message text**, because an
 * RPC or database error can carry the endpoint URL and its key. Everything else
 * (our own logic) is deliberately NOT caught, so a `TypeError` or `ReferenceError`
 * of ours surfaces as what it is instead of being reported as "RPC down". That is
 * the defect core's extend path (#311) and the CLI's cost message (#348) both had.
 *
 * The write is a plain INSERT with **no `RETURNING`**. The scheduler's database role
 * gets `INSERT (observed_ledger, rpc_ms, ok)` on `scheduler_ticks` and no `SELECT`
 * (least privilege; the alert on a missing heartbeat must not run on the scheduler),
 * and `RETURNING id` needs `SELECT` on `id`. It has no privilege on `ticked_at` (K1,
 * 0010), so that column always takes the database's clock.
 *
 * **A failed tick writes a row too** (PH2-E4-05 F9, migration 0010): `ok = false`,
 * `observed_ledger` NULL, and `rpc_ms` set only when every RPC call of the tick returned
 * (a call that never returned, because it failed or timed out, leaves it NULL; Fatih,
 * 2026-11-02). A failed row is not a heartbeat: every reader of `scheduler_ticks` that
 * means "the scheduler is alive" or "the ledger the chain was at" reads `WHERE ok`. A
 * failure to write the failed row is not reported as the tick's failure: the tick failed
 * for the RPC's reason, and `TickError.recorded` says whether the row made it.
 */
export type TickErrorCode =
  | 'RPC_UNREACHABLE'
  | 'RPC_BAD_RESPONSE'
  | 'NETWORK_MISMATCH'
  | 'DB_FAILED'
  /** A required setting (the database URL) is not there. */
  | 'NOT_CONFIGURED';

export class TickError extends Error {
  /**
   * `recorded`: a failed-tick row (`ok = false`) was written for this failure. It is false
   * for `DB_FAILED` and `NOT_CONFIGURED` (the database is the thing that is missing) and when
   * the failed-tick write itself failed.
   */
  constructor(
    readonly code: TickErrorCode,
    readonly recorded: boolean = false,
  ) {
    super(code);
    this.name = 'TickError';
  }
}

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

export interface TickDeps {
  readonly rpcUrl: string;
  /** The network this scheduler serves. The RPC must report exactly this. */
  readonly expectedPassphrase: string;
  /**
   * Called as a plain function, never as a method of `deps`: a Workers `fetch`
   * invoked with another object as `this` throws "Illegal invocation" (#439).
   */
  readonly fetch: FetchLike;
  readonly query: (text: string, params: readonly unknown[]) => Promise<unknown>;
  /** Per RPC call. Reads are cancellable (design §5); a hung one must not hold the tick. */
  readonly timeoutMs?: number;
  /** Milliseconds clock for `rpc_ms`; `Date.now` by default. Only differences are used. */
  readonly now?: () => number;
}

export const DEFAULT_RPC_TIMEOUT_MS = 10_000;

/**
 * No `RETURNING`: see the header. `ticked_at` is the database's clock, by default. Parameters:
 * the observed ledger (NULL on a failed tick), `rpc_ms` (NULL when not measured), `ok`.
 */
export const INSERT_TICK_SQL =
  'INSERT INTO scheduler_ticks (observed_ledger, rpc_ms, ok) VALUES ($1, $2, $3)';

/** What the RPC calls of one tick took, and whether every one of them returned. */
interface RpcMeter {
  ms: number;
  /** False once a call fails to return a status and a JSON body (network error, timeout). */
  allReturned: boolean;
}

async function rpc(
  doFetch: FetchLike,
  url: string,
  method: string,
  timeoutMs: number,
  now: () => number,
  meter: RpcMeter,
): Promise<Record<string, unknown>> {
  let status: number;
  let body: unknown;
  const started = now();
  try {
    const response = await doFetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method }),
      signal: AbortSignal.timeout(timeoutMs),
      // Never follow a redirect to a host nobody chose.
      redirect: 'manual',
    });
    status = response.status;
    body = await response.json();
  } catch {
    // A network failure, a timeout, and a body that is not JSON all look alike from
    // here, and none of them is ours to tell apart. None of them "returned".
    meter.allReturned = false;
    throw new TickError('RPC_UNREACHABLE');
  }
  meter.ms += Math.max(0, now() - started);
  if (status < 200 || status >= 300) throw new TickError('RPC_UNREACHABLE');
  if (typeof body !== 'object' || body === null) throw new TickError('RPC_BAD_RESPONSE');
  const envelope = body as Record<string, unknown>;
  if ('error' in envelope) throw new TickError('RPC_BAD_RESPONSE');
  const result = envelope['result'];
  if (typeof result !== 'object' || result === null) throw new TickError('RPC_BAD_RESPONSE');
  return result as Record<string, unknown>;
}

/** A chain ledger number: a positive safe integer. Anything else is not a measurement. */
function asLedger(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value <= 0) {
    throw new TickError('RPC_BAD_RESPONSE');
  }
  return value;
}

export async function runTick(
  deps: TickDeps,
): Promise<{ readonly observedLedger: number; readonly rpcMs: number }> {
  const doFetch = deps.fetch;
  const timeoutMs = deps.timeoutMs ?? DEFAULT_RPC_TIMEOUT_MS;
  const now = deps.now ?? Date.now;
  const meter: RpcMeter = { ms: 0, allReturned: true };

  let observedLedger: number;
  try {
    // The network first: a heartbeat from the wrong chain would be a false measurement,
    // and "a URL says testnet" proves nothing about what it serves.
    const network = await rpc(doFetch, deps.rpcUrl, 'getNetwork', timeoutMs, now, meter);
    if (network['passphrase'] !== deps.expectedPassphrase) throw new TickError('NETWORK_MISMATCH');

    const latest = await rpc(doFetch, deps.rpcUrl, 'getLatestLedger', timeoutMs, now, meter);
    observedLedger = asLedger(latest['sequence']);
  } catch (error) {
    // Only our own TickErrors: a TypeError or ReferenceError of ours is not "the RPC failed".
    if (!(error instanceof TickError)) throw error;
    const rpcMs = meter.allReturned ? Math.round(meter.ms) : null;
    let recorded = true;
    try {
      await deps.query(INSERT_TICK_SQL, [null, rpcMs, false]);
    } catch {
      recorded = false;
    }
    throw new TickError(error.code, recorded);
  }

  const rpcMs = Math.round(meter.ms);
  try {
    await deps.query(INSERT_TICK_SQL, [observedLedger, rpcMs, true]);
  } catch {
    throw new TickError('DB_FAILED');
  }
  return { observedLedger, rpcMs };
}
