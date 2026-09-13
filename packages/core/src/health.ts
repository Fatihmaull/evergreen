import type {
  BumpThresholds,
  LedgerEntryTTL,
  ScanIssue,
  ScanResult,
} from '@evergreen-stellar/shared-types';
import { hasExpired, isValidThreshold, needsAction } from './ttl.js';

/**
 * Display health for one ledger entry (`W2-D10-01`).
 *
 * Distinct from `LivenessVerdict.severity`, and the distinction is not
 * cosmetic. They answer different questions:
 *
 *   assessEntry     "how bad is this ENTRY's state?"   — a property of the chain
 *   assertLiveness  "how bad is it that this RUN did   — a property of a run
 *                    not act?"
 *
 * A scan is not a run that failed to act. Feeding a scan to `assertLiveness`
 * with `records: []` would grade every low entry `no-action-recorded` /
 * critical, which is true of a run and nonsense as a description of a contract
 * someone just asked about. So the two grades stay separate — but the inputs
 * they share do NOT get restated: both call `needsAction` and `hasExpired`,
 * and the blast-radius rule lives here, once, for every display to call.
 */

/**
 * Four states, not three. `unknown` exists because an entry whose TTL could not
 * be read is not healthy, not warning, and not critical — it is unread. Forcing
 * it into one of the other three is the collapse this codebase keeps refusing:
 * unknown and fine must never render as the same colour.
 */
export type EntryHealth = 'healthy' | 'warning' | 'critical' | 'unknown';

/**
 * Whether this entry is shared — including the case where that **cannot be
 * known**.
 *
 * `undetermined` exists because a single-contract scan can never establish that
 * a `ContractCode` entry is unshared: the chain does not index reverse
 * dependencies from one contract query. So `false` there is not merely
 * unverified, it is **unverifiable by construction on this code path**, and
 * reporting it would be an unknown rendered as a negative — in the channel the
 * engine and dashboard consume, while the human channel says "invisible here".
 *
 * `exclusive` IS assertable for instance, persistent and temporary entries:
 * those ledger keys are derived from the contract itself, so one contract is
 * the whole census rather than a floor.
 */
export type SharingStatus = 'shared' | 'exclusive' | 'undetermined';

export interface EntryAssessment {
  readonly health: EntryHealth;
  readonly needsAction: boolean;
  readonly isExpired: boolean;
  /**
   * Contracts KNOWN to use this entry — the ones this scan was handed. A floor,
   * never a census.
   */
  readonly observedContractCount: number;
  /**
   * Lower bound on how many contracts this entry takes down with it. **Named as
   * a bound because it is one**: for a code entry seen from a single contract
   * the true radius may be any number, and `1` would read as a measurement.
   */
  readonly blastRadiusAtLeast: number;
  readonly sharingStatus: SharingStatus;
  /** Printable justification. Never a raw error. */
  readonly reason: string;
}

/**
 * Grade one entry, weighting by blast radius.
 *
 * **A shared code entry at three days is not one contract at three days, it is
 * N contracts at three days.** Severity that ignores that is confidently green
 * right up until every contract built from that Wasm dies at once — misleading
 * in the worst available direction.
 *
 * `critical` is reserved for states that are unrecoverable or widespread:
 *
 *   - already expired            — past `extendTTL`; needs restoring
 *   - temporary and low          — deletion is unrecoverable, unlike archival
 *   - shared and low             — N contracts, not one
 *
 * A single archived entry that is merely low is `warning`: it needs action, it
 * is recoverable, and it takes nothing else with it.
 */
/**
 * Two horizons, because a warning and an action answer different questions.
 *
 * Decided by Fatih 2026-09-10. A single threshold forced a choice between
 * missing things and crying wolf: at 17,280 ledgers (~24 h) an entry crosses
 * into trouble with **exactly one scheduled run left** to act on it, so one
 * missed run — a rate limit, a bad deploy, a network hiccup — leaves no second
 * chance. That does not serve "100% uptime" with strict alerting; it is the
 * tightest value that still technically warns.
 *
 * So the tight value is kept and demoted to the URGENT tier, where its
 * tightness is a feature, and a wider horizon is added above it:
 *
 *   WARNING   120,960 ledgers (~7 days)  — six failed daily runs of margin
 *   CRITICAL   17,280 ledgers (~1 day)   — act now
 *
 * Separating them is also what resolves the false-alarm tension: the noisy
 * level and the urgent level stop being the same number.
 */
export interface HealthThresholds {
  /** Below this, say something. Wide enough to survive several failed runs. */
  readonly warnBelowLedgers: number;
  /** Below this, act now. Deliberately tight. */
  readonly criticalBelowLedgers: number;
}

/** ~7 days at the measured cadence. Six daily runs of margin. */
export const DEFAULT_WARN_LEDGERS = 120_960;
/** ~1 day. The previous single threshold, kept where tightness is the point. */
export const DEFAULT_CRITICAL_LEDGERS = 17_280;

export const DEFAULT_THRESHOLDS: HealthThresholds = {
  warnBelowLedgers: DEFAULT_WARN_LEDGERS,
  criticalBelowLedgers: DEFAULT_CRITICAL_LEDGERS,
};

/** Validate policy ordering separately from observation classification. */
function assertHealthThresholds(thresholds: HealthThresholds): void {
  if (
    !Number.isSafeInteger(thresholds.criticalBelowLedgers) ||
    !isValidThreshold(thresholds.criticalBelowLedgers)
  ) {
    throw new Error('criticalBelowLedgers must be a non-negative safe integer of ledgers');
  }
  if (
    !Number.isSafeInteger(thresholds.warnBelowLedgers) ||
    !isValidThreshold(thresholds.warnBelowLedgers)
  ) {
    throw new Error('warnBelowLedgers must be a non-negative safe integer of ledgers');
  }
  if (!needsAction(thresholds.criticalBelowLedgers, thresholds.warnBelowLedgers)) {
    throw new Error(
      'warnBelowLedgers must be at least the action threshold (bumpWhenRemainingLedgersBelow)',
    );
  }
}

/** Preserve omission: only an implicit warning can widen for a legacy action override. */
export function resolveHealthThresholds(
  defaults: BumpThresholds,
  overrides: Partial<BumpThresholds> = {},
): HealthThresholds {
  const criticalBelowLedgers =
    overrides.bumpWhenRemainingLedgersBelow ?? defaults.bumpWhenRemainingLedgersBelow;
  const warnBelowLedgers =
    overrides.warnBelowLedgers ??
    defaults.warnBelowLedgers ??
    Math.max(DEFAULT_WARN_LEDGERS, criticalBelowLedgers);
  const resolved = { warnBelowLedgers, criticalBelowLedgers };
  assertHealthThresholds(resolved);
  return resolved;
}

/** Two-tier engine assessment. Impact may be critical without authorizing an action. */
export function assessEntryWithThresholds(
  entry: LedgerEntryTTL,
  thresholds: HealthThresholds,
): EntryAssessment {
  assertHealthThresholds(thresholds);
  const assessment = assessEntry(entry, thresholds.warnBelowLedgers);
  if (entry.ttl.status === 'unavailable' || assessment.isExpired) return assessment;
  if (needsAction(entry.ttl.remainingLedgers, thresholds.criticalBelowLedgers)) {
    return {
      ...assessment,
      health: 'critical',
      needsAction: true,
      reason: `At or below action threshold (${thresholds.criticalBelowLedgers} ledgers). ${assessment.reason}`,
    };
  }
  if (assessment.health === 'healthy') return assessment;
  return {
    ...assessment,
    needsAction: false,
    reason: `${assessment.reason} Above action threshold (${thresholds.criticalBelowLedgers} ledgers); warning only, no bump needed.`,
  };
}

export function assessEntry(entry: LedgerEntryTTL, thresholdLedgers: number): EntryAssessment {
  if (!isValidThreshold(thresholdLedgers)) {
    throw new Error('thresholdLedgers must be a non-negative integer of ledgers');
  }

  const observedContractCount = entry.contracts.length;
  // A code entry belongs to the Wasm, not the contract, so one observed
  // consumer proves nothing about the rest. Every other entry kind is keyed
  // from the contract itself, where one consumer IS the whole census.
  const sharingStatus: SharingStatus =
    observedContractCount > 1 ? 'shared' : entry.kind === 'code' ? 'undetermined' : 'exclusive';
  const shared = sharingStatus === 'shared';

  if (entry.ttl.status === 'unavailable') {
    return {
      health: 'unknown',
      needsAction: false,
      isExpired: false,
      observedContractCount,
      blastRadiusAtLeast: observedContractCount,
      sharingStatus,
      reason: 'No TTL metadata was returned, so this entry’s health is unread — not healthy.',
    };
  }

  const { remainingLedgers } = entry.ttl;
  const isExpired = hasExpired(remainingLedgers);
  const act = needsAction(remainingLedgers, thresholdLedgers);

  if (isExpired) {
    return {
      health: 'critical',
      needsAction: true,
      isExpired: true,
      observedContractCount,
      blastRadiusAtLeast: observedContractCount,
      sharingStatus,
      reason:
        entry.endBehavior === 'deleted'
          ? 'Already deleted. Temporary entries are not recoverable.'
          : 'Already archived. Restore it with RestoreFootprintOp — extendTTL cannot reach it.',
    };
  }

  if (!act) {
    return {
      health: 'healthy',
      needsAction: false,
      isExpired: false,
      observedContractCount,
      blastRadiusAtLeast: observedContractCount,
      sharingStatus,
      reason: 'Above threshold.',
    };
  }

  if (entry.endBehavior === 'deleted') {
    return {
      health: 'critical',
      needsAction: true,
      isExpired: false,
      observedContractCount,
      blastRadiusAtLeast: observedContractCount,
      sharingStatus,
      reason: 'Low, and temporary — this data is DELETED at expiry, not archived. Unrecoverable.',
    };
  }

  if (shared) {
    return {
      health: 'critical',
      needsAction: true,
      isExpired: false,
      observedContractCount,
      blastRadiusAtLeast: observedContractCount,
      sharingStatus,
      reason: `Low, and shared by ${observedContractCount} contracts — every one of them fails together.`,
    };
  }

  return {
    health: 'warning',
    needsAction: true,
    isExpired: false,
    observedContractCount,
    blastRadiusAtLeast: observedContractCount,
    sharingStatus,
    reason:
      sharingStatus === 'undetermined'
        ? 'Low. This scan saw one contract on it, but a code entry may serve others it cannot see.'
        : 'Low, recoverable, and affects only this contract.',
  };
}

/** Loudest health present, for a one-line summary. `unknown` never reads as healthy. */
const HEALTH_RANK: Record<EntryHealth, number> = {
  critical: 0,
  unknown: 1,
  warning: 2,
  healthy: 3,
};

export function worstHealth(assessments: readonly EntryAssessment[]): EntryHealth | undefined {
  if (assessments.length === 0) return undefined;
  return assessments.reduce<EntryHealth>(
    (worst, a) => (HEALTH_RANK[a.health] < HEALTH_RANK[worst] ? a.health : worst),
    'healthy',
  );
}

/**
 * The caveats a scan must state, produced ONCE and consumed by every renderer.
 *
 * These are not read failures — they are bounds on what a successful read can
 * establish. They are returned as `ScanIssue`s so that a consumer asking the
 * obvious question, `issues.length === 0`, gets a correct answer.
 *
 * **The bug this exists to prevent:** the human channel printed two caveats
 * while the JSON reported `issues: []`, `isShared: false` and `blastRadius: 1`.
 * The code that ACTS got the confident version and the person who does not act
 * got the honest one — backwards, and in the field the product exists to
 * surface. Deriving both channels from this function is what makes the two
 * unable to disagree, rather than merely agreeing today.
 */
export function coverageIssues(
  scan: Pick<ScanResult, 'entries' | 'coverage'>,
): readonly ScanIssue[] {
  const issues: ScanIssue[] = [];

  for (const [entryKey, entry] of Object.entries(scan.entries)) {
    if (assessEntry(entry, 0).sharingStatus !== 'undetermined') continue;
    issues.push({
      kind: 'sharing-undetermined',
      contracts: entry.contracts,
      entryKey,
      observedAtLedger: entry.observedAtLedger,
      message:
        'Code entries are shared by every contract built from the same Wasm. This scan saw ' +
        `${entry.contracts.length}. Whether others depend on this entry cannot be determined from ` +
        'a single-contract scan — pass them together to see the real blast radius.',
    });
  }

  const supplied = scan.coverage?.dataKeysSuppliedByContract ?? {};
  for (const [contract, count] of Object.entries(supplied)) {
    if (count > 0) continue;
    if (scan.coverage?.noDataKeysDeclaredByContract?.[contract] === true) continue;
    issues.push({
      kind: 'coverage-limited',
      contracts: [contract],
      message:
        'No data keys were supplied, so any further entries are unread. A clean result covers ' +
        'only what was asked for, never the whole contract.',
    });
  }

  return issues;
}
