/**
 * One-click "Extend now" (PH2-E3-04). The only request this module makes is
 * `POST /jobs` with `kind: 'extend-now'` (`docs/API.md` §7). It does not sign,
 * simulate or submit a transaction. The engine's own mode decides whether a
 * queued job is dry-run.
 *
 * The route is not mounted. A page, an HTML 404 or a network failure is
 * "nothing queued", never a success. An unknown job status is not read as
 * extended: #643 may add states, and a state this module does not know stays
 * unreadable.
 *
 * No router address is published (`PH2-E4-03`, `PH2-E4-08`). This module does
 * not build a router invocation and does not build a second signature.
 */
import { apiRequest, type ApiOutcome, type FetchLike } from './api';

/** Unset until a production router address is published. Never a spike address. */
export const ROUTER_CONTRACT_ID: string | undefined = undefined;

export const JOB_STATUSES = [
  'queued',
  'preflight-failed',
  'cancelled',
  'pulled',
  'extended',
  'refunded',
  'failed',
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;
const STROOPS = /^\d+$/;
const KEY = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface ExtendJob {
  readonly id: string;
  readonly network: 'testnet';
  readonly contractId: string;
  readonly kind: 'extend-now' | 'autopilot';
  readonly createdAt: string;
  readonly status: JobStatus;
  readonly pullAmountStroops?: string;
  readonly pullTxHash?: string;
  readonly extendTxHash?: string;
  readonly refundTxHash?: string;
  readonly preflightReason?: string;
}

export type QueueOutcome =
  | { readonly kind: 'queued'; readonly job: ExtendJob; readonly replay: boolean }
  | {
      readonly kind: 'not-queued';
      readonly reason:
        | 'no-key'
        | 'unavailable'
        | 'not-signed-in'
        | 'autopilot-off'
        | 'allowance-missing'
        | 'allowance-expired'
        | 'daily-limit'
        | 'not-testnet'
        | 'reused-key'
        | 'unrecognised';
    };

export interface ExtendRow {
  readonly contractId: string;
  readonly autopilot: boolean;
  readonly limitPerDay?: number;
  readonly usedToday?: number;
  readonly resetsAt?: string;
}

function digits(value: unknown): value is string {
  return typeof value === 'string' && STROOPS.test(value);
}

function optionalHash(value: unknown): string | undefined {
  if (value === undefined || value === null) return undefined;
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

/** `undefined` unless the body is a job this screen can describe. */
export function parseExtendJob(body: unknown): ExtendJob | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const row = body as Record<string, unknown>;
  const job = (typeof row.job === 'object' && row.job !== null ? row.job : row) as Record<
    string,
    unknown
  >;
  if (typeof job.id !== 'string' || job.id === '') return undefined;
  if (job.network !== 'testnet') return undefined;
  if (typeof job.contractId !== 'string' || !/^C[A-Z2-7]{55}$/.test(job.contractId))
    return undefined;
  if (job.kind !== 'extend-now' && job.kind !== 'autopilot') return undefined;
  if (typeof job.createdAt !== 'string' || !ISO.test(job.createdAt)) return undefined;
  if (typeof job.status !== 'string' || !(JOB_STATUSES as readonly string[]).includes(job.status)) {
    return undefined;
  }
  const steps =
    typeof job.steps === 'object' && job.steps !== null
      ? (job.steps as Record<string, unknown>)
      : {};
  const pull =
    typeof steps.pull === 'object' && steps.pull !== null
      ? (steps.pull as Record<string, unknown>)
      : undefined;
  const refund =
    typeof steps.refund === 'object' && steps.refund !== null
      ? (steps.refund as Record<string, unknown>)
      : undefined;
  const preflight =
    typeof steps.preflight === 'object' && steps.preflight !== null
      ? (steps.preflight as Record<string, unknown>)
      : undefined;
  const extend = Array.isArray(steps.extend)
    ? (steps.extend[0] as Record<string, unknown> | undefined)
    : undefined;
  const pullAmount = pull && digits(pull.amountStroops) ? pull.amountStroops : undefined;
  const reason = preflight && typeof preflight.reason === 'string' ? preflight.reason : undefined;
  const pullTxHash = optionalHash(pull?.txHash);
  const extendTxHash = optionalHash(extend?.txHash);
  const refundTxHash = optionalHash(refund?.txHash);
  return {
    id: job.id,
    network: 'testnet',
    contractId: job.contractId,
    kind: job.kind,
    createdAt: job.createdAt,
    status: job.status as JobStatus,
    ...(pullAmount === undefined ? {} : { pullAmountStroops: pullAmount }),
    ...(pullTxHash === undefined ? {} : { pullTxHash }),
    ...(extendTxHash === undefined ? {} : { extendTxHash }),
    ...(refundTxHash === undefined ? {} : { refundTxHash }),
    ...(reason === undefined ? {} : { preflightReason: reason }),
  };
}

export function extendRows(items: unknown): {
  readonly rows: readonly ExtendRow[];
  readonly unreadable: number;
} {
  if (!Array.isArray(items)) return { rows: [], unreadable: 0 };
  const rows: ExtendRow[] = [];
  let unreadable = 0;
  for (const item of items) {
    if (typeof item !== 'object' || item === null) {
      unreadable += 1;
      continue;
    }
    const row = item as Record<string, unknown>;
    if (row.network !== 'testnet') continue;
    if (typeof row.contractId !== 'string' || !/^C[A-Z2-7]{55}$/.test(row.contractId)) {
      unreadable += 1;
      continue;
    }
    const auto = row.autopilot;
    const enabled =
      typeof auto === 'object' && auto !== null && (auto as { enabled?: unknown }).enabled === true;
    const now = row.extendNow;
    let limit: number | undefined;
    let used: number | undefined;
    let resetsAt: string | undefined;
    if (typeof now === 'object' && now !== null) {
      const n = now as Record<string, unknown>;
      if (Number.isInteger(n.limitPerDay) && (n.limitPerDay as number) > 0)
        limit = n.limitPerDay as number;
      if (Number.isInteger(n.usedToday) && (n.usedToday as number) >= 0)
        used = n.usedToday as number;
      if (typeof n.resetsAt === 'string' && ISO.test(n.resetsAt)) resetsAt = n.resetsAt;
    }
    rows.push({
      contractId: row.contractId,
      autopilot: enabled,
      ...(limit === undefined ? {} : { limitPerDay: limit }),
      ...(used === undefined ? {} : { usedToday: used }),
      ...(resetsAt === undefined ? {} : { resetsAt }),
    });
  }
  return { rows, unreadable };
}

function fromError(outcome: Extract<ApiOutcome<unknown>, { kind: 'error' }>): QueueOutcome {
  switch (outcome.code) {
    case 'UNAUTHENTICATED':
      return { kind: 'not-queued', reason: 'not-signed-in' };
    case 'AUTOPILOT_OFF':
      return { kind: 'not-queued', reason: 'autopilot-off' };
    case 'ALLOWANCE_MISSING':
      return { kind: 'not-queued', reason: 'allowance-missing' };
    case 'ALLOWANCE_EXPIRED':
      return { kind: 'not-queued', reason: 'allowance-expired' };
    case 'DAILY_LIMIT_REACHED':
      return { kind: 'not-queued', reason: 'daily-limit' };
    case 'NETWORK_NOT_WRITABLE':
      return { kind: 'not-queued', reason: 'not-testnet' };
    case 'IDEMPOTENCY_KEY_REUSED':
      return { kind: 'not-queued', reason: 'reused-key' };
    default:
      return { kind: 'not-queued', reason: 'unrecognised' };
  }
}

/**
 * Queue one extend-now job. A missing or non-UUID key does not call the API.
 * One call, no retry.
 */
export async function queueExtendNow(
  contractId: string,
  idempotencyKey: string,
  fetchImpl?: FetchLike,
): Promise<QueueOutcome> {
  if (!KEY.test(idempotencyKey)) return { kind: 'not-queued', reason: 'no-key' };
  const me = await apiRequest<{ csrfToken?: unknown }>('/me', { method: 'GET' }, fetchImpl);
  if (me.kind === 'unavailable') return { kind: 'not-queued', reason: 'unavailable' };
  if (me.kind === 'error') return fromError(me);
  if (typeof me.data?.csrfToken !== 'string' || me.data.csrfToken === '') {
    return { kind: 'not-queued', reason: 'unrecognised' };
  }
  const res = await apiRequest<unknown>(
    '/jobs',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Evergreen-CSRF': me.data.csrfToken,
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ network: 'testnet', contractId, kind: 'extend-now' }),
    },
    fetchImpl,
  );
  if (res.kind === 'unavailable') return { kind: 'not-queued', reason: 'unavailable' };
  if (res.kind === 'error') return fromError(res);
  const job = parseExtendJob(res.data);
  if (job === undefined) return { kind: 'not-queued', reason: 'unrecognised' };
  if (res.status !== 202 && res.status !== 200)
    return { kind: 'not-queued', reason: 'unrecognised' };
  return { kind: 'queued', job, replay: res.status === 200 };
}
