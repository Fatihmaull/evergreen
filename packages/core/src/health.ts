import type { LedgerEntryTTL } from '@evergreen-stellar/shared-types';
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

export interface EntryAssessment {
  readonly health: EntryHealth;
  readonly needsAction: boolean;
  readonly isExpired: boolean;
  /**
   * How many contracts this entry takes down with it. 1 for an ordinary entry;
   * N for a `ContractCode` entry shared across a factory deployment.
   */
  readonly blastRadius: number;
  /** True when more than one contract depends on this single entry. */
  readonly isShared: boolean;
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
export function assessEntry(entry: LedgerEntryTTL, thresholdLedgers: number): EntryAssessment {
  if (!isValidThreshold(thresholdLedgers)) {
    throw new Error('thresholdLedgers must be a non-negative integer of ledgers');
  }

  const blastRadius = entry.contracts.length;
  const isShared = blastRadius > 1;

  if (entry.ttl.status === 'unavailable') {
    return {
      health: 'unknown',
      needsAction: false,
      isExpired: false,
      blastRadius,
      isShared,
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
      blastRadius,
      isShared,
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
      blastRadius,
      isShared,
      reason: 'Above threshold.',
    };
  }

  if (entry.endBehavior === 'deleted') {
    return {
      health: 'critical',
      needsAction: true,
      isExpired: false,
      blastRadius,
      isShared,
      reason: 'Low, and temporary — this data is DELETED at expiry, not archived. Unrecoverable.',
    };
  }

  if (isShared) {
    return {
      health: 'critical',
      needsAction: true,
      isExpired: false,
      blastRadius,
      isShared,
      reason: `Low, and shared by ${blastRadius} contracts — every one of them fails together.`,
    };
  }

  return {
    health: 'warning',
    needsAction: true,
    isExpired: false,
    blastRadius,
    isShared,
    reason: 'Low, recoverable, and affects only this contract.',
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
