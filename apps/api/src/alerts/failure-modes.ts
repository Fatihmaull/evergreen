/**
 * PH2-E4-05 failure modes (docs/PH2-E4-05-FAILURE-MODES.md, #483): the pure
 * part of the wiring. Maps every mode F1–F19 to its user and operator alert,
 * plus detectors over plain inputs where the doc defines the condition, and
 * the per-user pulled-then-failed rate. No transport, no clock, no storage.
 *
 * PENDING (not here, by design):
 * - Reading the inputs: job rows, ledger rows, RPC, `scheduler_ticks`, the DLQ,
 *   Neon usage. Needs the scheduler (PH2-E4-04; Stage 0 merged in #482), the engine
 *   (PH2-E4-02) or schema that does not exist yet (#466, the outbox).
 * - Delivering the operator alert: its channel is undetermined (doc,
 *   "Alert channels"); the heartbeat alert's independent trigger is open.
 * - Every threshold, window, retry bound and copy the doc marks undetermined.
 */
import { AUTH_SECRET_NAMES } from '../auth/mount.js';
import { wholeNumber } from '../watchlist/mount.js';
import { ALERT_SPECS, type AlertKind } from './policy.js';
import { belowGapMargin, gapMarginHolds as coreGapMarginHolds } from '@evergreen-stellar/core';

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
    detector: 'isPulledThenFailed; rate breach: pulledThenFailedBreaches (operator only)',
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
    operator: thr('engine balance vs headroom (in-flight pulls) and cap (headroom + sweep buffer)'),
    detector: 'floatCheck (sweep buffer decided at PH2-E4-03; balance read pending on PH2-E4-02)',
  },
  F9: {
    user: { kind: 'dashboard' },
    operator: thr('consecutive failed ticks'),
    detector: 'pending: scheduler (PH2-E4-04)',
  },
  F10: {
    user: { kind: 'email', alerts: ['testnet_reset'] },
    operator: { when: 'every' },
    // Decided (Fatih, 2026-10-29 17:03 WIB, option 3): signal 1 alerts the operator.
    // Signal 2 (PM, 2026-10-29): the next tick is still <= the pre-drop ledger.
    detector: 'testnetResetSignal (signal 1 alerts operator; signal 2 confirms the user email)',
  },
  F11: {
    // Decided (Fatih, 2026-10-29 17:03 WIB, option 1): entriesAtRiskFromGap, < 4 x worst gap.
    user: {
      kind: 'undetermined',
      note: 'at-risk rule decided (entriesAtRiskFromGap); user channel undetermined',
    },
    operator: thr(
      'gap in ledgers between scheduler_ticks; trigger must be independent of the scheduler',
    ),
    detector:
      'tickGaps, gapMarginHolds, entriesAtRiskFromGap (reading scheduler_ticks not wired; alert threshold undetermined)',
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
    // Decided (Fatih, 2026-10-29): a $5 Neon spending notification in Neon Billing, set by
    // DevOps; the project is on Neon Launch. Not 70 CU-hours. Nothing in this repo reads it.
    operator: { when: 'every' },
    detector: 'none in code: Neon Billing spending notification at $5 (DevOps)',
  },
  F16: {
    user: {
      kind: 'undetermined',
      note: 'second channel when the alert email itself fails is undetermined',
    },
    operator: { when: 'every' },
    detector:
      'emailFailureOperatorAlert (permanent now, transient after retries; outbox schema pending)',
  },
  F17: {
    user: { kind: 'dashboard' },
    operator: { when: 'every' },
    detector:
      'thresholdFloorProblem, logged by configCheck in the API cron (operator delivery needs a channel)',
  },
  F18: {
    user: { kind: 'dashboard' },
    operator: { when: 'every' },
    detector:
      'missingApiSettings, logged by configCheck in the API cron (engine key pending; operator delivery needs a channel)',
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
 * Delegates to core (packages/core/src/gap-margin.ts). A negative worst gap is a
 * ledger going down (a reset, not a gap), so it is undetermined here instead of
 * throwing inside a detector.
 */
export function gapMarginHolds(
  worstGapLedgers: bigint | undefined,
  lowestActLedgers: bigint | undefined,
): boolean | undefined {
  if (worstGapLedgers !== undefined && worstGapLedgers < 0n) return undefined;
  return coreGapMarginHolds(worstGapLedgers, lowestActLedgers);
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

// ---- F10 / F11 decisions (Fatih, 2026-10-29 17:03 WIB) ----

export interface TestnetResetSignal {
  /** Operator alert: ledger went backwards between consecutive ticks (signal 1). */
  readonly operatorAlert: boolean;
  /** DoD-2 measurement window must restart. */
  readonly restartDod2Window: boolean;
  /** User `testnet_reset` email: true only when signal 2 confirms a decrease. */
  readonly userEmail: boolean;
  readonly decreases: readonly { readonly from: bigint; readonly to: bigint }[];
  /** Decreases confirmed by signal 2 (the following tick is still <= `from`). */
  readonly confirmed: readonly {
    readonly from: bigint;
    readonly to: bigint;
    readonly next: bigint;
  }[];
}

/**
 * F10 (option 3, Fatih 2026-10-29 17:03 WIB; signal 2 decided by PM 2026-10-29).
 * Signal 1: observed_ledger strictly decreasing between consecutive
 * scheduler_ticks (an equal ledger is a stall, not a reset). Triggers an
 * operator alert and a DoD-2 window restart.
 * Signal 2: the tick after the decrease still observes a ledger lower than or
 * equal to the ledger before the decrease (it did not bounce back to the old
 * network). Only a confirmed decrease sets `userEmail`. A decrease on the
 * latest tick stays unconfirmed until the next tick exists.
 */
export function testnetResetSignal(ticks: readonly TickFact[]): TestnetResetSignal {
  const sorted = [...ticks].sort((a, b) => a.tickedAt - b.tickedAt);
  const decreases: { from: bigint; to: bigint }[] = [];
  const confirmed: { from: bigint; to: bigint; next: bigint }[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const from = sorted[i - 1]!.observedLedger;
    const to = sorted[i]!.observedLedger;
    if (to >= from) continue;
    decreases.push({ from, to });
    const after = sorted[i + 1];
    if (after !== undefined && after.observedLedger <= from) {
      confirmed.push({ from, to, next: after.observedLedger });
    }
  }
  const hit = decreases.length > 0;
  return {
    operatorAlert: hit,
    restartDod2Window: hit,
    userEmail: confirmed.length > 0,
    decreases,
    confirmed,
  };
}

export interface EntryLedgersLeft {
  readonly entryId: string;
  /** Ledgers left before expiry; undefined when not observed. */
  readonly ledgersLeft: number | undefined;
}

/**
 * F11 option 1 (Fatih, 2026-10-29 17:03 WIB): an entry
 * is at risk when its ledgers left are below 4 x the running worst gap.
 * This is a scheduler-margin rule (gap vs ledgers left), not the act rule:
 * Delegates to core's belowGapMargin (packages/core/src/gap-margin.ts).
 * Returns undefined when the worst gap is unknown (absence is not health);
 * entries with unknown ledgers left are skipped.
 */
export function entriesAtRiskFromGap(
  entries: readonly EntryLedgersLeft[],
  worstGapLedgers: bigint | undefined,
): string[] | undefined {
  if (worstGapLedgers === undefined || worstGapLedgers < 0n) return undefined;
  return entries
    .filter(
      (e) =>
        e.ledgersLeft !== undefined &&
        belowGapMargin(BigInt(e.ledgersLeft), worstGapLedgers) === true,
    )
    .map((e) => e.entryId);
}

// ---- Detectors on the final numbers (Fatih, 2026-10-29 17:03 WIB) ----

/** Pulled-then-failed metric, option 1: 30 days rolling. */
export const PULLED_THEN_FAILED_WINDOW_SECONDS = 30 * 24 * 60 * 60;
/** A user needs at least this many pulled jobs in the window before a rate can breach. */
export const PULLED_THEN_FAILED_MIN_PULLED = 3;
/** Breach at a rate of at least 50%, compared in integers (failed × 2 ≥ pulled). */
export const PULLED_THEN_FAILED_RATE_PERCENT = 50;

export interface WindowedUserJobFact extends UserJobFact {
  /** `jobs.pulled_at`, unix seconds; undefined when the pull did not confirm. */
  readonly pulledAt: number | undefined;
}

export interface PulledThenFailedBreach extends PulledThenFailedRate {
  readonly userId: string;
}

/**
 * Pulled-then-failed breach (option 1): over the 30 days up to `nowSeconds`,
 * a user with ≥ 3 pulled jobs and a pulled-then-failed rate ≥ 50%. Operator
 * alert only; nothing is done to the user's account. Jobs with no `pulledAt`
 * or pulled in the future are not counted. Sorted by userId.
 */
export function pulledThenFailedBreaches(
  jobs: readonly WindowedUserJobFact[],
  nowSeconds: number,
): PulledThenFailedBreach[] {
  const from = nowSeconds - PULLED_THEN_FAILED_WINDOW_SECONDS;
  const inWindow = jobs.filter(
    (j) => j.pulled && j.pulledAt !== undefined && j.pulledAt > from && j.pulledAt <= nowSeconds,
  );
  const out: PulledThenFailedBreach[] = [];
  for (const [userId, r] of pulledThenFailedRates(inWindow)) {
    if (r.pulled < PULLED_THEN_FAILED_MIN_PULLED) continue;
    if (r.pulledThenFailed * 100 < r.pulled * PULLED_THEN_FAILED_RATE_PERCENT) continue;
    out.push({ userId, ...r });
  }
  return out.sort((a, b) => (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0));
}

export interface FloatFacts {
  /** Engine account balance in stroops; undefined when the read failed. */
  readonly balanceStroops: bigint | undefined;
  /** Sum of the pulls in flight (pulled, not yet extended or refunded): the refund headroom. */
  readonly inFlightPullsStroops: bigint;
  /** Sweep buffer, decided at PH2-E4-03; undefined until then. */
  readonly sweepBufferStroops: bigint | undefined;
}

export interface FloatCheck {
  /** Balance below the headroom; undefined when the balance is unknown. */
  readonly belowHeadroom: boolean | undefined;
  /** Balance above cap = headroom + sweep buffer; undefined while the buffer or balance is unknown. */
  readonly aboveCap: boolean | undefined;
}

/**
 * F8 (option 2): headroom = the pulls in flight; cap = headroom + sweep
 * buffer. Unknown inputs give undefined, never false (absence is not health).
 */
export function floatCheck(f: FloatFacts): FloatCheck {
  if (f.balanceStroops === undefined) return { belowHeadroom: undefined, aboveCap: undefined };
  const belowHeadroom = f.balanceStroops < f.inFlightPullsStroops;
  const aboveCap =
    f.sweepBufferStroops === undefined
      ? undefined
      : f.balanceStroops > f.inFlightPullsStroops + f.sweepBufferStroops;
  return { belowHeadroom, aboveCap };
}

/** The part of an email send failure F16 needs (apps/api/src/auth/mailer-error.ts). */
export interface EmailFailureFacts {
  readonly kind: 'rejected' | 'unavailable' | 'network';
  readonly fetchStage?: 'build' | 'send';
}

/**
 * Permanent: the provider rejected it (4xx other than 429), or the request
 * could not even be built. Retrying the same request will not help.
 */
export const isPermanentEmailFailure = (f: EmailFailureFacts): boolean =>
  f.kind === 'rejected' || (f.kind === 'network' && f.fetchStage === 'build');

/**
 * F16 (option 3): when the operator's Telegram alert goes out. A permanent
 * rejection: now. A transient failure: only once its retries are exhausted
 * (the retry bound itself is undetermined; the caller decides exhaustion).
 */
export function emailFailureOperatorAlert(
  f: EmailFailureFacts,
  retriesExhausted: boolean,
): 'now' | 'wait_for_retries' {
  return isPermanentEmailFailure(f) || retriesExhausted ? 'now' : 'wait_for_retries';
}
