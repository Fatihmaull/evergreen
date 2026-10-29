/**
 * PH2-E4-05 failure modes (docs/PH2-E4-05-FAILURE-MODES.md, #483): the pure
 * part of the wiring. Maps every mode F1–F19 to its user and operator alert,
 * plus detectors over plain inputs where the doc defines the condition, and
 * the per-user pulled-then-failed rate. No transport, no clock, no storage.
 *
 * PENDING (not here, by design):
 * - Reading the inputs: job rows, ledger rows, RPC, `scheduler_ticks`, the DLQ,
 *   Neon usage. Needs the scheduler (PH2-E4-04, #482 open), the engine
 *   (PH2-E4-02) or schema that does not exist yet (#466, the outbox).
 * - Delivering the operator alert: its channel is undetermined (doc,
 *   "Alert channels"); the heartbeat alert's independent trigger is open.
 * - Every threshold, window, retry bound and copy the doc marks undetermined.
 */
import { AUTH_SECRET_NAMES } from '../auth/mount.js';
import { wholeNumber } from '../watchlist/mount.js';
import { ALERT_SPECS, type AlertKind } from './policy.js';

export type FailureMode =
  | 'F1'
  | 'F2'
  | 'F3'
  | 'F4'
  | 'F5'
  | 'F6'
  | 'F7'
  | 'F8'
  | 'F9'
  | 'F10'
  | 'F11'
  | 'F12'
  | 'F13'
  | 'F14'
  | 'F15'
  | 'F16'
  | 'F17'
  | 'F18'
  | 'F19';

export const FAILURE_MODES: readonly FailureMode[] = [
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'F13',
  'F14',
  'F15',
  'F16',
  'F17',
  'F18',
  'F19',
];

/** What the user gets for a mode. */
export type UserAlert =
  /** An E2-06 alert email; `kinds` are keys of ALERT_SPECS. */
  | { readonly kind: 'email'; readonly alerts: readonly AlertKind[] }
  /** No email of its own; the user hears about it if it becomes `via`. */
  | { readonly kind: 'via'; readonly modes: readonly FailureMode[] }
  /** The affected screen renders undetermined (docs/API.md:390). */
  | { readonly kind: 'dashboard' }
  /** Nothing: an absorbed event is not an event for the user (F12). */
  | { readonly kind: 'none' }
  /** The doc leaves the user side open. */
  | { readonly kind: 'undetermined'; readonly note: string };

/** What the operator gets. Rule 1: every mode alerts the operator. */
export type OperatorAlert =
  | { readonly when: 'every'; readonly highest?: true }
  /** Alert on a count or level whose threshold the doc leaves undetermined. */
  | { readonly when: 'threshold'; readonly threshold: 'undetermined'; readonly signal: string };

export interface FailureModeAlerts {
  readonly user: UserAlert;
  readonly operator: OperatorAlert;
  /** Detector exported from this module, or 'pending' / 'undetermined'. */
  readonly detector: string;
}

const thr = (signal: string): OperatorAlert => ({
  when: 'threshold',
  threshold: 'undetermined',
  signal,
});

export const FAILURE_MODE_ALERTS: Readonly<Record<FailureMode, FailureModeAlerts>> = {
  F1: {
    user: { kind: 'email', alerts: ['preflight_failed'] },
    operator: thr('preflight-failed count per reason'),
    detector: 'isPreflightFailed',
  },
  F2: {
    user: { kind: 'email', alerts: ['allowance_missing', 'allowance_expiring'] },
    operator: thr('users with autopilot on and no valid allowance'),
    detector: 'pending: allowance() read and checkBudget run in scheduler evaluation (PH2-E4-04)',
  },
  F3: {
    user: { kind: 'via', modes: ['F4', 'F5'] },
    operator: thr('job submitted-unconfirmed older than the envelope bound'),
    detector: 'pending: submitted-hash column (#466, migration 0006) and the per-step bound',
  },
  F4: {
    user: { kind: 'email', alerts: ['extend_failed_refund'] },
    operator: { when: 'every' },
    detector: 'isPulledThenFailed',
  },
  F5: {
    user: { kind: 'via', modes: ['F4'] },
    // Retries per job/hour: threshold undetermined. TRY_AGAIN_LATER: any occurrence (isTryAgainLater).
    operator: thr('extend retries per job and per hour; any TRY_AGAIN_LATER'),
    detector: 'isTryAgainLater (retry counting pending on PH2-E4-02)',
  },
  F6: {
    user: { kind: 'email', alerts: ['refund_delayed'] },
    operator: { when: 'every', highest: true },
    detector: 'isRefundOwed',
  },
  F7: {
    user: { kind: 'email', alerts: ['unexplained_charge'] },
    operator: { when: 'every' },
    detector: 'reconcileProblems (engine-tx-without-job pending on #466)',
  },
  F8: {
    user: { kind: 'via', modes: ['F1'] },
    operator: thr('engine balance vs float cap and refund headroom'),
    detector: 'undetermined: float cap and headroom undetermined',
  },
  F9: {
    user: { kind: 'dashboard' },
    operator: thr('consecutive failed ticks'),
    detector: 'pending: scheduler (PH2-E4-04)',
  },
  F10: {
    user: { kind: 'email', alerts: ['testnet_reset'] },
    operator: { when: 'every' },
    // PROVISIONAL (PM-accepted, pending Tih's confirmation): signal 1 only.
    // The user email needs the signal-2 confirmation, pending on #482.
    detector:
      'testnetResetSignal (signal 1, provisional; user email needs signal 2, pending on #482)',
  },
  F11: {
    // PROVISIONAL (PM-accepted, pending Tih's confirmation): option 1, entriesAtRiskFromGap.
    user: {
      kind: 'undetermined',
      note: 'at-risk rule provisional (entriesAtRiskFromGap); user channel undetermined',
    },
    operator: thr(
      'gap in ledgers between scheduler_ticks; trigger must be independent of the scheduler',
    ),
    detector:
      'tickGaps, gapMarginHolds, entriesAtRiskFromGap (reading scheduler_ticks and the trigger pending on #482; alert threshold undetermined)',
  },
  F12: {
    user: { kind: 'none' },
    operator: thr('duplicates absorbed; a duplicate pull on chain is P0 (duplicatePulls)'),
    detector: 'duplicatePulls (absorbed-count pending on scheduler)',
  },
  F13: {
    user: { kind: 'via', modes: ['F3', 'F4', 'F5', 'F6'] },
    operator: { when: 'every' },
    detector: 'pending: dead-letter queue config (PH2-E4-04)',
  },
  F14: {
    user: { kind: 'dashboard' },
    operator: { when: 'every' },
    detector: 'pending: trigger outside the database (as F11)',
  },
  F15: {
    user: { kind: 'via', modes: ['F14'] },
    operator: thr('Neon CU-hours this month (70 is proposed, not decided)'),
    detector: 'undetermined: flag level not decided',
  },
  F16: {
    user: {
      kind: 'undetermined',
      note: 'second channel when the alert email itself fails is undetermined',
    },
    operator: { when: 'every' },
    detector:
      "pending: sendAlert's transport result has no failure shape yet; outbox schema pending",
  },
  F17: {
    user: { kind: 'dashboard' },
    operator: { when: 'every' },
    detector: 'thresholdFloorProblem (operator delivery needs a channel)',
  },
  F18: {
    user: { kind: 'dashboard' },
    operator: { when: 'every' },
    detector:
      'missingApiSettings (engine key pending: it does not exist yet; operator delivery needs a channel)',
  },
  F19: {
    user: { kind: 'email', alerts: ['restore_lost_changes'] },
    operator: { when: 'every' },
    detector: 'pending: restore is a manual operator procedure',
  },
};

/** Inverse check: every email alert named here maps back to the same mode in ALERT_SPECS. */
export function alertModeMismatches(): string[] {
  const out: string[] = [];
  for (const mode of FAILURE_MODES) {
    const u = FAILURE_MODE_ALERTS[mode].user;
    if (u.kind !== 'email') continue;
    for (const k of u.alerts) if (ALERT_SPECS[k].mode !== mode) out.push(`${mode}:${k}`);
  }
  return out;
}

// ---- Detectors over plain inputs (doc-defined conditions only) ----

export type JobStatus =
  'queued' | 'preflight-failed' | 'cancelled' | 'pulled' | 'extended' | 'refunded' | 'failed';

/** A job as these detectors need it (subset of docs/API.md `Job`). */
export interface JobFacts {
  readonly status: JobStatus;
  /** `steps.pull` present: the pull confirmed. */
  readonly pulled: boolean;
}

/** F1: job in `preflight-failed` (docs/API.md:270). */
export const isPreflightFailed = (job: JobFacts): boolean => job.status === 'preflight-failed';

/** F4 / metric numerator: the pull confirmed and the job ended `refunded` (docs/API.md:237). */
export const isPulledThenFailed = (job: JobFacts): boolean =>
  job.pulled && job.status === 'refunded';

/**
 * F6: past F4 (pull confirmed, extend finally failed) with no confirmed
 * refund row. "Finally failed" needs the retry bound (undetermined), so the
 * caller supplies it.
 */
export function isRefundOwed(f: {
  readonly pulled: boolean;
  readonly extendFinallyFailed: boolean;
  readonly refundConfirmed: boolean;
}): boolean {
  return f.pulled && f.extendFinallyFailed && !f.refundConfirmed;
}

/** F5 operator: `TRY_AGAIN_LATER` should not occur with max_concurrency = 1, so any occurrence alerts. */
export const isTryAgainLater = (sendStatus: string): boolean => sendStatus === 'TRY_AGAIN_LATER';

export type LedgerKind =
  'pull' | 'rent' | 'network-fee' | 'evergreen-fee' | 'refund' | 'difference';
export interface LedgerFact {
  readonly jobId: string;
  readonly kind: LedgerKind;
  readonly amountStroops: bigint; // always positive; kind gives direction
  readonly txHash: string | null;
}

export type ReconcileProblem =
  | { readonly jobId: string; readonly problem: 'stored_row_without_tx'; readonly kind: LedgerKind }
  | {
      readonly jobId: string;
      readonly problem: 'unbalanced';
      readonly pull: bigint;
      readonly accounted: bigint;
    };

const STORED: ReadonlySet<LedgerKind> = new Set(['pull', 'refund', 'network-fee']);

/**
 * F7 (docs/API.md:294-296): per job, pull = rent + evergreen-fee + refund +
 * difference (network-fee is not in the sum), and stored kinds carry a txHash.
 * The third signal, an engine transaction with no job, is pending on #466.
 */
export function reconcileProblems(rows: readonly LedgerFact[]): ReconcileProblem[] {
  const out: ReconcileProblem[] = [];
  const byJob = new Map<string, LedgerFact[]>();
  for (const r of rows) {
    if (STORED.has(r.kind) && !r.txHash)
      out.push({ jobId: r.jobId, problem: 'stored_row_without_tx', kind: r.kind });
    byJob.set(r.jobId, [...(byJob.get(r.jobId) ?? []), r]);
  }
  for (const [jobId, list] of byJob) {
    const sum = (k: LedgerKind) =>
      list.filter((r) => r.kind === k).reduce((a, r) => a + r.amountStroops, 0n);
    const pull = sum('pull');
    const accounted = sum('rent') + sum('evergreen-fee') + sum('refund') + sum('difference');
    if (pull !== accounted) out.push({ jobId, problem: 'unbalanced', pull, accounted });
  }
  return out;
}

/** F12 P0: more than one confirmed pull for one job (the job ID is the pull's idempotency key). */
export function duplicatePulls(pulls: readonly { readonly jobId: string }[]): string[] {
  const n = new Map<string, number>();
  for (const p of pulls) n.set(p.jobId, (n.get(p.jobId) ?? 0) + 1);
  return [...n].filter(([, c]) => c > 1).map(([id]) => id);
}

// ---- Metric: per-user pulled-then-failed rate ----

export interface UserJobFact extends JobFacts {
  readonly userId: string;
}

export interface PulledThenFailedRate {
  readonly pulled: number;
  readonly pulledThenFailed: number;
  readonly rate: number;
}

/**
 * Per user: jobs whose pull confirmed and that ended `refunded`, over jobs
 * that pulled. The window is undetermined: the caller passes the jobs in
 * whatever window is decided. Threshold and breach action are undetermined.
 * A user with no pulled jobs is absent from the result: no rate, never 0.
 */
export function pulledThenFailedRates(
  jobs: readonly UserJobFact[],
): Map<string, PulledThenFailedRate> {
  const acc = new Map<string, { pulled: number; failed: number }>();
  for (const j of jobs) {
    if (!j.pulled) continue;
    const a = acc.get(j.userId) ?? { pulled: 0, failed: 0 };
    a.pulled += 1;
    if (isPulledThenFailed(j)) a.failed += 1;
    acc.set(j.userId, a);
  }
  const out = new Map<string, PulledThenFailedRate>();
  for (const [u, a] of acc)
    out.set(u, { pulled: a.pulled, pulledThenFailed: a.failed, rate: a.failed / a.pulled });
  return out;
}

// ---- Detectors over inputs that exist on main: scheduler_ticks, the API's env ----

/** One `scheduler_ticks` row (apps/api/db/0005_scheduler_ticks.sql:7). */
export interface TickFact {
  readonly tickedAt: number;
  readonly observedLedger: bigint;
}

export interface TickGaps {
  /** Largest ledger step between consecutive ticks; undefined with fewer than two ticks (never 0). */
  readonly worstGapLedgers: bigint | undefined;
  /** Steps where observed_ledger did not increase. A candidate F10 signal, not decided as one. */
  readonly nonIncreasing: readonly { readonly from: bigint; readonly to: bigint }[];
}

/**
 * F11: the gap in ledgers between consecutive ticks, ordered by `ticked_at`
 * (the migration's index). The window and alert threshold are undetermined;
 * the caller passes the rows of whatever window is decided.
 */
export function tickGaps(ticks: readonly TickFact[]): TickGaps {
  const sorted = [...ticks].sort((a, b) => a.tickedAt - b.tickedAt);
  let worst: bigint | undefined;
  const nonIncreasing: { from: bigint; to: bigint }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1]!.observedLedger;
    const to = sorted[i]!.observedLedger;
    if (to <= from) nonIncreasing.push({ from, to });
    const gap = to - from;
    if (worst === undefined || gap > worst) worst = gap;
  }
  return { worstGapLedgers: worst, nonIncreasing };
}

/**
 * DoD-2 (phase-2/PHASE2-PLAN.md:49): 4 x the worst gap is below the lowest act
 * threshold in use. `undefined` when either input is missing: absence is not health.
 * A margin check on the scheduler, not a TTL comparison: no entry TTL is read here.
 */
export function gapMarginHolds(
  worstGapLedgers: bigint | undefined,
  lowestActLedgers: bigint | undefined,
): boolean | undefined {
  if (worstGapLedgers === undefined || lowestActLedgers === undefined) return undefined;
  return 4n * worstGapLedgers < lowestActLedgers;
}

/**
 * F17: `THRESHOLD_FLOOR_LEDGERS` by the watchlist mount's own rule
 * (apps/api/src/watchlist/mount.ts:47). Unset blocks autopilot (docs/API.md:175);
 * malformed takes the whole watchlist mount down.
 */
export function thresholdFloorProblem(
  env: Readonly<Record<string, string | undefined>>,
): 'unset' | 'malformed' | null {
  const raw = env['THRESHOLD_FLOOR_LEDGERS'];
  if (raw === undefined || raw === '') return 'unset';
  return wholeNumber(raw) === undefined ? 'malformed' : null;
}

/** F18 settings the API reads today (docs/API.md:35, apps/api/src/auth/mount.ts:27). */
export const API_REQUIRED_SETTINGS = [
  ...AUTH_SECRET_NAMES,
  'EMAIL_FROM',
  'DASHBOARD_ORIGIN',
] as const;

/**
 * F18: names (never values) of required settings that are unset or empty.
 * For the operator only; user-facing errors never name a setting.
 */
export function missingApiSettings(
  env: Readonly<Record<string, string | undefined>>,
): (typeof API_REQUIRED_SETTINGS)[number][] {
  return API_REQUIRED_SETTINGS.filter((n) => {
    const v = env[n];
    return v === undefined || v.trim() === '';
  });
}

// ---- PROVISIONAL decisions: PM-accepted, pending Tih's confirmation ----

export interface TestnetResetSignal {
  /** Operator alert: ledger went backwards between consecutive ticks. */
  readonly operatorAlert: boolean;
  /** DoD-2 measurement window must restart. */
  readonly restartDod2Window: boolean;
  /** The user email needs signal 2 (pending on #482); never true from signal 1 alone. */
  readonly userEmail: false;
  readonly decreases: readonly { readonly from: bigint; readonly to: bigint }[];
}

/**
 * F10 signal 1, PROVISIONAL (PM-accepted, pending Tih's confirmation):
 * observed_ledger decreasing between consecutive scheduler_ticks. Reads
 * tickGaps().nonIncreasing and keeps strict decreases only (an equal ledger is
 * a stall, not a reset). Triggers an operator alert and a DoD-2 window restart.
 * The user `testnet_reset` email waits on signal 2, pending on #482.
 */
export function testnetResetSignal(ticks: readonly TickFact[]): TestnetResetSignal {
  const decreases = tickGaps(ticks).nonIncreasing.filter((s) => s.to < s.from);
  const hit = decreases.length > 0;
  return { operatorAlert: hit, restartDod2Window: hit, userEmail: false, decreases };
}

export interface EntryLedgersLeft {
  readonly entryId: string;
  /** Ledgers left before expiry; undefined when not observed. */
  readonly ledgersLeft: number | undefined;
}

/**
 * F11 option 1, PROVISIONAL (PM-accepted, pending Tih's confirmation): an entry
 * is at risk when its ledgers left are below 4 x the running worst gap.
 * This is a scheduler-margin rule (gap vs ledgers left), not the act rule:
 * core's needsAction is not imported because apps/api does not depend on core
 * (Worker build). Whether this belongs in a core helper is asked on #385.
 * Returns undefined when the worst gap is unknown (absence is not health);
 * entries with unknown ledgers left are skipped.
 */
export function entriesAtRiskFromGap(
  entries: readonly EntryLedgersLeft[],
  worstGapLedgers: bigint | undefined,
): string[] | undefined {
  if (worstGapLedgers === undefined) return undefined;
  const margin = 4n * worstGapLedgers;
  return entries
    .filter((e) => e.ledgersLeft !== undefined && BigInt(e.ledgersLeft) < margin)
    .map((e) => e.entryId);
}
