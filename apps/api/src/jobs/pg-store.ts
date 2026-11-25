/**
 * Postgres `JobsStore` over apps/api/db/schema.sql (`jobs`, `fee_ledger`),
 * through the same `SqlClient` the auth store uses, so tests swap in a fake
 * or PGlite with no network.
 *
 * Every statement filters on `jobs.user_id = $1`: a user cannot read another
 * user's job or ledger row, whatever the caller passes. Read-only: `eg_api`
 * has SELECT on `jobs` (0008) and on `fee_ledger` (0017), nothing more here.
 *
 * Times leave Postgres as whole microseconds (`int8` text) so the cursor is
 * exact; stroops leave as `numeric` text, never a JS number.
 */
import type { SqlClient, SqlRow } from '../auth/pg-store.js';
import type {
  ExtendNowRequest,
  ExtendNowResult,
  Job,
  JobQuery,
  JobStatus,
  JobSteps,
  JobsStore,
  LedgerKind,
  LedgerQuery,
  LedgerRow,
  Page,
  PageKey,
} from './store.js';

const US = (col: string): string => `(extract(epoch from ${col}) * 1000000)::int8`;

const SELECT_JOBS = `SELECT j.id::text AS id, j.network::text AS network,
  j.contract_id::text AS contract_id, j.kind, j.payer_account::text AS payer_account,
  j.status::text AS status, ${US('j.created_at')}::text AS created_us,
  ${US('j.updated_at')}::text AS updated_us, j.preflight,
  j.pull_tx_hash, ${US('j.pulled_at')}::text AS pulled_us, j.pull_amount::text AS pull_amount,
  j.extend_tx_hash, j.extend_rent_charged::text AS extend_rent_charged, j.extend_records,
  j.reconcile, j.refund_tx_hash, j.refund_amount::text AS refund_amount,
  (SELECT ${US('f.recorded_at')}::text FROM fee_ledger f
    WHERE f.job_id = j.id AND f.kind = 'refund') AS refund_us
FROM jobs j
WHERE j.user_id = $1::uuid`;

/** `$2` contract or null, `$3`/`$4` the page key or nulls, `$5` the row limit. */
export const LIST_JOBS_SQL = `${SELECT_JOBS}
  AND ($2::text IS NULL OR j.contract_id = $2::text)
  AND ($3::int8 IS NULL OR (${US('j.created_at')}, j.id) < ($3::int8, $4::uuid))
ORDER BY j.created_at DESC, j.id DESC
LIMIT $5::int4`;

export const GET_JOB_SQL = `${SELECT_JOBS} AND j.id = $2::uuid`;

/**
 * Ownership is the job's user, not the wallet's current owner (store.ts).
 * `$2` wallet, `$3` contract, `$4` job, `$5`/`$6` page key, `$7` limit; nulls mean "any".
 */
export const LIST_LEDGER_SQL = `SELECT f.id::text AS id, f.job_id::text AS job_id,
  f.network::text AS network, f.wallet::text AS wallet, f.contract_id::text AS contract_id,
  f.kind::text AS kind, f.amount::text AS amount, f.tx_hash, f.ledger::text AS ledger,
  ${US('f.recorded_at')}::text AS recorded_us
FROM fee_ledger f
JOIN jobs j ON j.id = f.job_id
WHERE j.user_id = $1::uuid
  AND ($2::text IS NULL OR f.wallet = $2::text)
  AND ($3::text IS NULL OR f.contract_id = $3::text)
  AND ($4::uuid IS NULL OR f.job_id = $4::uuid)
  AND ($5::int8 IS NULL OR (${US('f.recorded_at')}, f.id) < ($5::int8, $6::int8))
ORDER BY f.recorded_at DESC, f.id DESC
LIMIT $7::int4`;

/** The job a key already made for this user, with its body hash. `$1` user, `$2` key. */
export const JOB_BY_KEY_SQL = `${SELECT_JOBS.replace(
  'SELECT j.id::text AS id,',
  "SELECT encode(j.request_hash, 'hex') AS request_hash, j.id::text AS id,",
)} AND j.idempotency_key = $2::uuid`;

/** The live item and its payer. `$1` user, `$2` contract. */
export const EXTEND_NOW_ITEM_SQL = `SELECT w.autopilot_enabled, w.payer_account::text AS payer_account
FROM watch_items w
WHERE w.user_id = $1::uuid AND w.network = 'testnet' AND w.contract_id = $2::text
  AND w.removed_at IS NULL`;

/**
 * The uses that count against the limit (store.ts). `$1` user, `$2` contract,
 * `$3` now (unix seconds).
 */
const COUNTED = `FROM jobs c
  WHERE c.user_id = $1::uuid AND c.network = 'testnet' AND c.contract_id = $2::text
    AND c.kind = 'extend-now' AND c.status NOT IN ('preflight-failed', 'cancelled')
    AND coalesce(c.pulled_at, c.created_at) > to_timestamp($3::float8) - interval '24 hours'`;

export const EXTEND_NOW_USED_SQL = `SELECT count(*)::int AS used,
  extract(epoch from min(coalesce(c.pulled_at, c.created_at)))::int8::text AS oldest ${COUNTED}`;

/**
 * One row, only while the limit allows it. The limit is re-checked inside the
 * INSERT, so two different keys sent together cannot both pass a count taken
 * before either was written (one may still race; the engine's pre-flight
 * checks the limit again before any pull). `$4` payer, `$5` key, `$6` hash hex,
 * `$7` limit.
 */
export const INSERT_EXTEND_NOW_SQL = `INSERT INTO jobs
  (user_id, network, contract_id, kind, payer_account, idempotency_key, request_hash)
SELECT $1::uuid, 'testnet', $2::text, 'extend-now', $4::text, $5::uuid, decode($6::text, 'hex')
WHERE (SELECT count(*) ${COUNTED}) < $7::int
ON CONFLICT (user_id, idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
RETURNING id::text AS id`;

const text = (v: unknown): string | undefined =>
  v === null || v === undefined ? undefined : String(v);

/** Whole microseconds (decimal string) to ISO 8601 UTC, millisecond precision. */
export function isoFromMicros(us: string): string {
  return new Date(Number(BigInt(us) / 1000n)).toISOString();
}

/** A timestamp the engine wrote inside jsonb (`now()` there), as ISO 8601 UTC. */
function isoFromJson(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const ms = Date.parse(v);
  return Number.isNaN(ms) ? undefined : new Date(ms).toISOString();
}

/** A stroop amount inside jsonb: a decimal string, or an integer the engine wrote as a number. */
function stroopsFromJson(v: unknown): string | undefined {
  if (typeof v === 'string' && /^-?\d+$/.test(v)) return v;
  if (typeof v === 'number' && Number.isSafeInteger(v)) return String(v);
  return undefined;
}

const asObject = (v: unknown): Record<string, unknown> | undefined => {
  const parsed = typeof v === 'string' ? safeParse(v) : v;
  return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)
    ? (parsed as Record<string, unknown>)
    : undefined;
};

function safeParse(v: string): unknown {
  try {
    return JSON.parse(v);
  } catch {
    return undefined;
  }
}

function preflightStep(v: unknown): JobSteps['preflight'] {
  const o = asObject(v);
  const at = isoFromJson(o?.['at']);
  if (o === undefined || typeof o['ok'] !== 'boolean' || at === undefined) return undefined;
  const reason = typeof o['reason'] === 'string' ? o['reason'] : undefined;
  const rent = stroopsFromJson(o['rentStroops']);
  return {
    at,
    ok: o['ok'],
    ...(reason === undefined ? {} : { reason }),
    ...(rent === undefined ? {} : { rentStroops: rent }),
  };
}

function reconcileStep(v: unknown): JobSteps['reconcile'] {
  const o = asObject(v);
  if (o === undefined) return undefined;
  const at = isoFromJson(o['at']);
  const pulled = stroopsFromJson(o['rentPulledStroops']);
  const charged = stroopsFromJson(o['rentChargedStroops']);
  const difference = stroopsFromJson(o['differenceStroops']);
  // Partial reconcile data is not shown as a reconcile: a missing amount is not zero.
  if (at === undefined || pulled === undefined || charged === undefined) return undefined;
  if (difference === undefined) return undefined;
  return {
    at,
    rentPulledStroops: pulled,
    rentChargedStroops: charged,
    differenceStroops: difference,
  };
}

function extendRecords(v: unknown): readonly unknown[] | undefined {
  const parsed = typeof v === 'string' ? safeParse(v) : v;
  return Array.isArray(parsed) ? parsed : undefined;
}

/** One `jobs` row (as `SELECT_JOBS` names it) to the §7 `Job`. */
export function jobFromRow(r: SqlRow): Job {
  const steps: {
    -readonly [K in keyof JobSteps]: JobSteps[K];
  } = {};
  const preflight = preflightStep(r['preflight']);
  if (preflight !== undefined) steps.preflight = preflight;
  const pullHash = text(r['pull_tx_hash']);
  const pulledUs = text(r['pulled_us']);
  if (pullHash !== undefined && pulledUs !== undefined) {
    const amount = text(r['pull_amount']);
    steps.pull = {
      at: isoFromMicros(pulledUs),
      txHash: pullHash,
      ...(amount === undefined ? {} : { amountStroops: amount }),
    };
  }
  const extend = extendRecords(r['extend_records']);
  if (extend !== undefined) steps.extend = extend;
  const extendHash = text(r['extend_tx_hash']);
  if (extendHash !== undefined) {
    steps.extendTx = {
      txHash: extendHash,
      rentChargedStroops: text(r['extend_rent_charged']) ?? null,
    };
  }
  const reconcile = reconcileStep(r['reconcile']);
  if (reconcile !== undefined) steps.reconcile = reconcile;
  const refundHash = text(r['refund_tx_hash']);
  if (refundHash !== undefined) {
    const refundUs = text(r['refund_us']);
    const amount = text(r['refund_amount']);
    steps.refund = {
      ...(refundUs === undefined ? {} : { at: isoFromMicros(refundUs) }),
      txHash: refundHash,
      ...(amount === undefined ? {} : { amountStroops: amount }),
    };
  }
  return {
    id: String(r['id']),
    network: 'testnet',
    contractId: String(r['contract_id']),
    kind: r['kind'] === 'autopilot' ? 'autopilot' : 'extend-now',
    payerWallet: String(r['payer_account']),
    createdAt: isoFromMicros(String(r['created_us'])),
    updatedAt: isoFromMicros(String(r['updated_us'])),
    status: String(r['status']) as JobStatus,
    steps,
  };
}

function ledgerFromRow(r: SqlRow): LedgerRow {
  const ledger = text(r['ledger']);
  return {
    id: String(r['id']),
    jobId: String(r['job_id']),
    network: 'testnet',
    wallet: String(r['wallet']),
    contractId: String(r['contract_id']),
    kind: String(r['kind']) as LedgerKind,
    amountStroops: String(r['amount']),
    txHash: text(r['tx_hash']) ?? null,
    ledger: ledger === undefined ? null : Number(ledger),
    recordedAt: isoFromMicros(String(r['recorded_us'])),
  };
}

/** Rows were fetched with `limit + 1`: the extra one only says another page exists. */
function page<T>(
  rows: SqlRow[],
  limit: number,
  map: (r: SqlRow) => T,
  key: (r: SqlRow) => PageKey,
): Page<T> {
  const more = rows.length > limit;
  const kept = more ? rows.slice(0, limit) : rows;
  const last = kept[kept.length - 1];
  return { items: kept.map(map), next: more && last !== undefined ? key(last) : null };
}

export class PgJobsStore implements JobsStore {
  constructor(private readonly sql: SqlClient) {}

  async listJobs(userId: string, q: JobQuery): Promise<Page<Job>> {
    const rows = await this.sql.query(LIST_JOBS_SQL, [
      userId,
      q.contractId ?? null,
      q.after?.t ?? null,
      q.after?.id ?? null,
      q.limit + 1,
    ]);
    return page(rows, q.limit, jobFromRow, (r) => ({
      t: String(r['created_us']),
      id: String(r['id']),
    }));
  }

  async getJob(userId: string, jobId: string): Promise<Job | undefined> {
    const rows = await this.sql.query(GET_JOB_SQL, [userId, jobId]);
    const row = rows[0];
    return row === undefined ? undefined : jobFromRow(row);
  }

  async createExtendNow(userId: string, req: ExtendNowRequest): Promise<ExtendNowResult> {
    const byKey = async (): Promise<ExtendNowResult | undefined> => {
      const row = (await this.sql.query(JOB_BY_KEY_SQL, [userId, req.idempotencyKey]))[0];
      if (row === undefined) return undefined;
      return String(row['request_hash']) === req.requestHash
        ? { kind: 'existing', job: jobFromRow(row) }
        : { kind: 'key-reused' };
    };
    const prior = await byKey();
    if (prior !== undefined) return prior;

    const item = (await this.sql.query(EXTEND_NOW_ITEM_SQL, [userId, req.contractId]))[0];
    if (item === undefined) return { kind: 'not-found' };
    const payer = text(item['payer_account']);
    if (item['autopilot_enabled'] !== true || payer === undefined) return { kind: 'autopilot-off' };

    const inserted = await this.sql.query(INSERT_EXTEND_NOW_SQL, [
      userId,
      req.contractId,
      req.now,
      payer,
      req.idempotencyKey,
      req.requestHash,
      req.limitPerDay,
    ]);
    const id = inserted[0]?.['id'];
    if (typeof id === 'string') {
      const job = await this.getJob(userId, id);
      if (job === undefined) throw new Error('The job vanished after it was written.');
      return { kind: 'created', job };
    }
    // Either the same key landed first (a double click), or the limit held.
    const raced = await byKey();
    if (raced !== undefined) return raced;
    const used = (await this.sql.query(EXTEND_NOW_USED_SQL, [userId, req.contractId, req.now]))[0];
    const oldest = Number(used?.['oldest'] ?? req.now);
    return {
      kind: 'daily-limit',
      used: Number(used?.['used'] ?? req.limitPerDay),
      resetsAt: oldest + 86_400,
    };
  }

  async listLedger(userId: string, q: LedgerQuery): Promise<Page<LedgerRow>> {
    const rows = await this.sql.query(LIST_LEDGER_SQL, [
      userId,
      q.wallet ?? null,
      q.contractId ?? null,
      q.jobId ?? null,
      q.after?.t ?? null,
      q.after?.id ?? null,
      q.limit + 1,
    ]);
    return page(rows, q.limit, ledgerFromRow, (r) => ({
      t: String(r['recorded_us']),
      id: String(r['id']),
    }));
  }
}
