/**
 * Stage 2 of PH2-E4-04: the Postgres side of the hosted money path, under 0008's
 * `eg_scheduler` grants (plus 0016's `shortfall_stroops`).
 *
 * - **Enqueue.** One autopilot job per due (user, contract) per window, and never a second one
 *   while an earlier job for the same pair is still `queued` or `pulled`. The window is
 *   `floor(observed ledger / 180)`, 180 ledgers being one 15-minute tick (design §7).
 * - **Resume.** Open jobs are read back oldest first, so a job interrupted at any step continues
 *   from what was persisted, never from the start.
 * - **Save.** The job's new state and its ledger rows go to the database **in one transaction**
 *   (`HostedJobPorts.save`), so a crash cannot leave a `pulled` job without its `pull` row or a
 *   half-written settle.
 * - **Submitted hashes** (0006). The chain port records a transaction's hash and expiry before it
 *   sends, so a resumed step asks the chain about that hash instead of sending a second one.
 *
 * Nothing here logs a payer, user or contract.
 */
import type {
  HostedJobSnapshot,
  LedgerWrite,
  PreflightRecord,
} from '@evergreen/engine/dist/money-path.js';

export interface Statement {
  readonly text: string;
  readonly params: readonly unknown[];
}
export type Query = (
  text: string,
  params: readonly unknown[],
) => Promise<readonly Record<string, unknown>[]>;
/** Runs every statement in one transaction, or none of them. */
export type Transaction = (statements: readonly Statement[]) => Promise<void>;

/** Ledgers per 15-minute tick at ~5 s per ledger (design §7). */
export const AUTOPILOT_WINDOW_LEDGERS = 180;

export function autopilotWindow(observedLedger: number): bigint {
  if (!Number.isSafeInteger(observedLedger) || observedLedger < 0)
    throw new RangeError('invalid observed ledger');
  return BigInt(Math.floor(observedLedger / AUTOPILOT_WINDOW_LEDGERS));
}

export interface EnqueueItem {
  readonly userId: string;
  readonly contractId: string;
  readonly payerAccount: string;
}

/**
 * At most one job per (user, contract, window) through `jobs_autopilot_uq` (0012), and none while
 * the pair already has an open job from an earlier window.
 */
export const ENQUEUE_SQL = `INSERT INTO jobs (user_id, network, contract_id, kind, payer_account, autopilot_window)
SELECT $1::uuid, 'testnet', $2::text, 'autopilot', $3::text, $4::bigint
WHERE NOT EXISTS (
  SELECT 1 FROM jobs
  WHERE user_id = $1::uuid AND network = 'testnet' AND contract_id = $2::text
    AND status IN ('queued', 'pulled')
)
ON CONFLICT (user_id, network, contract_id, autopilot_window) WHERE kind = 'autopilot' DO NOTHING
RETURNING id`;

export async function enqueueAutopilotJobs(
  query: Query,
  items: readonly EnqueueItem[],
  window: bigint,
): Promise<number> {
  let created = 0;
  for (const item of items) {
    const rows = await query(ENQUEUE_SQL, [
      item.userId,
      item.contractId,
      item.payerAccount,
      window.toString(),
    ]);
    created += rows.length;
  }
  return created;
}

const JOB_COLUMNS = `id, user_id, network, contract_id, kind, payer_account, status,
  pull_tx_hash, pull_amount, extend_tx_hash, extend_rent_charged, refund_tx_hash, shortfall_stroops`;

export const OPEN_JOBS_SQL = `SELECT ${JOB_COLUMNS} FROM jobs
WHERE network = 'testnet' AND kind = 'autopilot' AND status IN ('queued', 'pulled')
ORDER BY created_at, id
LIMIT $1`;

export const LOAD_JOB_SQL = `SELECT ${JOB_COLUMNS} FROM jobs WHERE id = $1::uuid`;

const text = (v: unknown): string => {
  if (typeof v !== 'string') throw new Error('JOB_ROW_SHAPE');
  return v;
};
const textOrNull = (v: unknown): string | null => (v === null ? null : text(v));
const stroopsOrNull = (v: unknown): bigint | null => {
  if (v === null) return null;
  if (typeof v === 'number' && Number.isSafeInteger(v)) return BigInt(v);
  if (typeof v === 'string' && /^\d+$/.test(v)) return BigInt(v);
  throw new Error('JOB_ROW_SHAPE');
};
const STATUSES = new Set([
  'queued',
  'preflight-failed',
  'pulled',
  'extended',
  'refunded',
  'failed',
]);

export function rowToSnapshot(row: Readonly<Record<string, unknown>>): HostedJobSnapshot {
  const status = text(row['status']);
  const kind = text(row['kind']);
  if (!STATUSES.has(status) || (kind !== 'autopilot' && kind !== 'extend-now'))
    throw new Error('JOB_ROW_SHAPE');
  return {
    id: text(row['id']),
    userId: text(row['user_id']),
    network: text(row['network']),
    contractId: text(row['contract_id']),
    kind,
    payerAccount: text(row['payer_account']),
    status: status as HostedJobSnapshot['status'],
    pullTxHash: textOrNull(row['pull_tx_hash']),
    pullAmountStroops: stroopsOrNull(row['pull_amount']),
    extendTxHash: textOrNull(row['extend_tx_hash']),
    extendRentChargedStroops: stroopsOrNull(row['extend_rent_charged']),
    refundTxHash: textOrNull(row['refund_tx_hash']),
    shortfallStroops: stroopsOrNull(row['shortfall_stroops']),
  };
}

export async function openJobs(query: Query, limit: number): Promise<HostedJobSnapshot[]> {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError('invalid job limit');
  return (await query(OPEN_JOBS_SQL, [limit])).map(rowToSnapshot);
}

export async function loadJob(query: Query, id: string): Promise<HostedJobSnapshot> {
  const rows = await query(LOAD_JOB_SQL, [id]);
  if (rows.length !== 1) throw new Error('JOB_NOT_FOUND');
  return rowToSnapshot(rows[0]!);
}

const dec = (v: bigint | null): string | null => (v === null ? null : v.toString(10));

/**
 * The job's new state. `pulled_at` is set once, with the pull hash (schema CHECK pairs them),
 * and only the columns 0008/0016 grant to `eg_scheduler` are written.
 */
/** `jobs.preflight` as JSON text, or null to keep the stored value. Stroops as decimal strings. */
function preflightJson(record: PreflightRecord | null | undefined): string | null {
  if (record === undefined || record === null) return null;
  return JSON.stringify({
    ok: record.ok,
    ...(record.reason === undefined ? {} : { reason: record.reason }),
    ...(record.rentStroops === undefined ? {} : { rentStroops: record.rentStroops.toString(10) }),
  });
}

export function saveStatements(next: HostedJobSnapshot, rows: readonly LedgerWrite[]): Statement[] {
  const update: Statement = {
    text: `UPDATE jobs SET
  status = $2::job_status,
  updated_at = now(),
  pull_tx_hash = $3,
  pulled_at = CASE WHEN $3::text IS NULL THEN NULL ELSE coalesce(pulled_at, now()) END,
  pull_amount = $4::numeric,
  extend_tx_hash = $5,
  extend_rent_charged = $6::numeric,
  refund_tx_hash = $7,
  shortfall_stroops = $8::numeric,
  preflight = CASE WHEN $9::jsonb IS NULL THEN preflight
                   ELSE $9::jsonb || jsonb_build_object('at', now()) END
WHERE id = $1::uuid`,
    params: [
      next.id,
      next.status,
      next.pullTxHash,
      dec(next.pullAmountStroops),
      next.extendTxHash,
      dec(next.extendRentChargedStroops),
      next.refundTxHash,
      dec(next.shortfallStroops),
      preflightJson(next.preflight),
    ],
  };
  const inserts = rows.map((row): Statement => ({
    text: `INSERT INTO fee_ledger (job_id, network, wallet, contract_id, kind, amount, tx_hash)
VALUES ($1::uuid, $2, $3, $4, $5::ledger_kind, $6::numeric, $7)`,
    params: [
      row.jobId,
      row.network,
      row.wallet,
      row.contractId,
      row.kind,
      row.amountStroops.toString(10),
      row.txHash,
    ],
  }));
  return [update, ...inserts];
}

export type SubmitStep = 'pull' | 'extend' | 'refund';

export interface SubmittedTx {
  readonly hash: string;
  /** Unix seconds: the transaction's `maxTime`. After it the hash can never be included. */
  readonly expiresAt: number;
}

/** Where the chain port keeps a step's submitted hash (0006 columns). */
export interface SubmittedStore {
  read(step: SubmitStep): Promise<SubmittedTx | null>;
  record(step: SubmitStep, tx: SubmittedTx): Promise<void>;
  clear(step: SubmitStep): Promise<void>;
}

const STEP_COLUMNS: Record<SubmitStep, readonly [string, string]> = {
  pull: ['pull_submitted_hash', 'pull_submitted_expires_at'],
  extend: ['extend_submitted_hash', 'extend_submitted_expires_at'],
  refund: ['refund_submitted_hash', 'refund_submitted_expires_at'],
};

export function pgSubmittedStore(query: Query, jobId: string): SubmittedStore {
  return {
    async read(step) {
      const [hash, expires] = STEP_COLUMNS[step];
      const rows = await query(
        `SELECT ${hash} AS hash, extract(epoch FROM ${expires})::bigint AS expires FROM jobs WHERE id = $1::uuid`,
        [jobId],
      );
      const row = rows[0];
      if (row === undefined || row['hash'] === null) return null;
      const expiresAt = Number(row['expires']);
      if (!Number.isSafeInteger(expiresAt)) throw new Error('JOB_ROW_SHAPE');
      return { hash: text(row['hash']), expiresAt };
    },
    async record(step, tx) {
      const [hash, expires] = STEP_COLUMNS[step];
      await query(
        `UPDATE jobs SET ${hash} = $2, ${expires} = to_timestamp($3), updated_at = now() WHERE id = $1::uuid`,
        [jobId, tx.hash, tx.expiresAt],
      );
    },
    async clear(step) {
      const [hash, expires] = STEP_COLUMNS[step];
      await query(
        `UPDATE jobs SET ${hash} = NULL, ${expires} = NULL, updated_at = now() WHERE id = $1::uuid`,
        [jobId],
      );
    },
  };
}
