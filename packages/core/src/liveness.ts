import type {
  BumpDecision,
  BumpRecord,
  BumpThresholds,
  ContractId,
  LedgerKey,
  ScanResult,
} from '@evergreen-stellar/shared-types';
import { hasExpired, isValidThreshold, needsAction } from './ttl.js';

/**
 * The liveness assertion (`W2-D10-04`).
 *
 * A run that does nothing looks exactly like a run that succeeded. That is the
 * dominant failure mode of a scheduled job, and it is not hypothetical here:
 * `claim()` returning null is the ORDINARY skip path, so roughly 96 clean
 * exit-0 runs could pass across guinea-pig B's 24-hour window while B archives
 * unattended. Every one of those runs would look healthy.
 *
 * The rule is deliberately blunt:
 *
 *   if an entry needs action and this run did not verifiably extend it, the
 *   run is NOT healthy — whatever the reason.
 *
 * "Whatever the reason" is load-bearing. A claim held by another runner, a
 * lock lookup that threw, a dry-run, an unconfirmed submission, a decision
 * skipped by policy: all legitimate reasons not to bump, none of them a reason
 * to report health. The asymmetry is intentional — a false alarm costs an
 * email, a missed alarm costs the Sep 20 proof.
 *
 * WHEN it fires is strict. WHAT it says is graded: the five situations below
 * are genuinely different and must not arrive looking identical, or the alarm
 * that matters gets skimmed past on Sep 20.
 *
 * Pure — no I/O, no clock, no engine dependency. The engine calls it at the
 * end of a run (`W3-D15-01`); it is testable now, which is why it lands first.
 */

/**
 * How loud this finding should be. Everything still fires; severity separates
 * a routine dry-run from a contract about to archive. Suppression is NOT an
 * option here — training yourself to ignore the channel is the failure.
 */
export type LivenessSeverity = 'info' | 'warn' | 'critical';

export type LivenessReason =
  /** Needs action; this run produced no record and no decision. The silent skip. */
  | 'no-action-recorded'
  /** A decision explicitly skipped it — typically another run holds the claim. */
  | 'skipped'
  /** Simulated but never submitted. Dry-run is the DEFAULT, so this is likely. */
  | 'dry-run-only'
  /** Submitted, not confirmed. The run does not KNOW whether its work landed. */
  | 'submitted-unconfirmed'
  /** Attempted and failed. */
  | 'bump-failed'
  /** Watched, but its TTL could not be read. Absence of observation is not health. */
  | 'not-observed';

/**
 * What someone woken by this alarm should actually do. Separate from `reason`
 * because they are different questions, and because the answer changes at the
 * expiry boundary: an already-expired entry is past saving by `extendTTL` and
 * needs `RestoreFootprintOp`. Telling someone to "bump" it at the moment they
 * are acting under pressure sends them at the wrong operation.
 */
export type LivenessRemediation = 'extend' | 'restore' | 'investigate';

export interface LivenessFinding {
  readonly entryKey: LedgerKey;
  /**
   * Every contract this entry serves. A shared `ContractCode` entry reports
   * once but names all N — the blast radius is the point, not a detail.
   */
  readonly contracts: readonly ContractId[];
  readonly reason: LivenessReason;
  readonly severity: LivenessSeverity;
  readonly remediation: LivenessRemediation;
  /** Absent when the entry was never observed. Negative means already expired. */
  readonly remainingLedgers?: number;
  /** True when the entry is past `extendTTL` and needs restoring instead. */
  readonly isExpired: boolean;
  /** Human-readable, safe to print; never a raw stack trace. */
  readonly detail: string;
}

export interface LivenessVerdict {
  /** True when the run must NOT report success. Drives a non-zero exit. */
  readonly isAlarm: boolean;
  /** Loudest finding present, so a caller can route without re-scanning. */
  readonly severity?: LivenessSeverity;
  readonly findings: readonly LivenessFinding[];
}

/**
 * Only a CONFIRMED extension buys silence.
 *
 * `succeeded` requires both a confirmed transaction and a verified post-bump
 * TTL observation. `submitted` is explicitly "never treated as successful
 * yet", `simulated` never touched the chain, `failed` is self-evident.
 * Treating any of the other three as action is how a run reports health it did
 * not earn.
 */
function confirmedBump(record: BumpRecord): boolean {
  return record.outcome === 'succeeded';
}

const SEVERITY: Record<LivenessReason, LivenessSeverity> = {
  'bump-failed': 'critical',
  // The Sunday scenario. The one that produced 96 quiet successes.
  skipped: 'critical',
  'no-action-recorded': 'critical',
  'not-observed': 'critical',
  // Genuine uncertainty, not failure: the run does not know whether it landed.
  'submitted-unconfirmed': 'warn',
  // Semantically correct to fire, but not an emergency. Never suppressed.
  'dry-run-only': 'info',
};

const SEVERITY_RANK: Record<LivenessSeverity, number> = { critical: 0, warn: 1, info: 2 };

/** Most informative cause wins: a failed bump says more than "no action recorded". */
const REASON_RANK: Record<LivenessReason, number> = {
  'bump-failed': 0,
  'submitted-unconfirmed': 1,
  skipped: 2,
  'dry-run-only': 3,
  'no-action-recorded': 4,
  'not-observed': 5,
};

function describe(
  reason: LivenessReason,
  remainingLedgers: number | undefined,
  isExpired: boolean,
  note?: string,
): string {
  const where =
    remainingLedgers === undefined
      ? 'its TTL could not be read'
      : isExpired
        ? `EXPIRED ${Math.abs(remainingLedgers).toLocaleString()} ledgers ago`
        : `${remainingLedgers.toLocaleString()} ledgers remain`;
  // Said once, here, so no caller has to remember which operation applies.
  const fix = isExpired ? ' Past extendTTL — this needs RestoreFootprintOp, not a bump.' : '';
  switch (reason) {
    case 'no-action-recorded':
      return `Needs action (${where}) and this run recorded nothing for it.${fix}`;
    case 'skipped':
      return `Skipped (${where})${note ? `: ${note}` : ': another run holds the claim'}.${fix}`;
    case 'dry-run-only':
      return `Would have acted (${where}); dry-run mode, nothing was submitted.${fix}`;
    case 'submitted-unconfirmed':
      return `Submitted (${where}), could not confirm within this run.${fix}`;
    case 'bump-failed':
      return `Attempted and failed (${where})${note ? `: ${note}` : ''}.${fix}`;
    case 'not-observed':
      return `Watched, but ${where}; absence of an observation is not evidence of health.`;
  }
}

export function assertLiveness(args: {
  readonly scan: ScanResult;
  readonly thresholds: Pick<BumpThresholds, 'bumpWhenRemainingLedgersBelow'>;
  /** Every record this run produced. An empty array is the silent-run case. */
  readonly records: readonly BumpRecord[];
  /** Every real caller supplies decisions, even when there were none. */
  readonly decisions: readonly BumpDecision[];
  /** The decision pass's effective threshold per key; global is the fallback. */
  readonly actionThresholdByEntry?: Readonly<Record<LedgerKey, number>>;
}): LivenessVerdict {
  const { scan, records } = args;
  const threshold = args.thresholds.bumpWhenRemainingLedgersBelow;
  if (!isValidThreshold(threshold)) {
    throw new Error('bumpWhenRemainingLedgersBelow must be a non-negative integer of ledgers');
  }

  for (const value of Object.values(args.actionThresholdByEntry ?? {})) {
    if (!isValidThreshold(value))
      throw new Error('Entry action thresholds must be non-negative integer ledgers');
  }

  const byEntry = new Map<LedgerKey, BumpRecord[]>();
  for (const record of records) {
    const existing = byEntry.get(record.entryKey);
    if (existing) existing.push(record);
    else byEntry.set(record.entryKey, [record]);
  }
  const skips = new Map<LedgerKey, string>();
  for (const decision of args.decisions) {
    if (decision.action === 'skip') skips.set(decision.entryKey, decision.reason);
  }

  const findings: LivenessFinding[] = [];

  for (const [entryKey, entry] of Object.entries(scan.entries)) {
    // An entry we could not read is not an entry we can call healthy. Same rule
    // as remaining zero still being live: unknown and fine must never collapse.
    if (entry.ttl.status === 'unavailable') {
      findings.push({
        entryKey,
        contracts: entry.contracts,
        reason: 'not-observed',
        severity: SEVERITY['not-observed'],
        remediation: 'investigate',
        isExpired: false,
        detail: describe('not-observed', undefined, false),
      });
      continue;
    }

    const { remainingLedgers } = entry.ttl;
    if (!needsAction(remainingLedgers, args.actionThresholdByEntry?.[entryKey] ?? threshold))
      continue;

    const forEntry = byEntry.get(entryKey) ?? [];
    if (forEntry.some(confirmedBump)) continue;

    // Expiry is the protocol boundary, not the policy one: live AT zero, dead
    // below it. `extendTTL` cannot reach an entry past this line. Calls the
    // predicate rather than restating it — see CONVENTIONS § one home.
    const isExpired = hasExpired(remainingLedgers);

    const candidates = forEntry.map((record): { reason: LivenessReason; note?: string } => {
      switch (record.outcome) {
        case 'simulated':
          return { reason: 'dry-run-only' };
        case 'submitted':
          return { reason: 'submitted-unconfirmed' };
        case 'failed':
          return { reason: 'bump-failed', note: record.error.message };
        default:
          return { reason: 'no-action-recorded' };
      }
    });
    const skipReason = skips.get(entryKey);
    if (candidates.length === 0 && skipReason !== undefined) {
      candidates.push({ reason: 'skipped', note: skipReason });
    }

    const chosen =
      candidates.length === 0
        ? { reason: 'no-action-recorded' as LivenessReason, note: undefined }
        : candidates.reduce((a, b) => (REASON_RANK[a.reason] <= REASON_RANK[b.reason] ? a : b));

    findings.push({
      entryKey,
      contracts: entry.contracts,
      reason: chosen.reason,
      severity: SEVERITY[chosen.reason],
      remediation: isExpired ? 'restore' : 'extend',
      remainingLedgers,
      isExpired,
      detail: describe(chosen.reason, remainingLedgers, isExpired, chosen.note),
    });
  }

  // A run that could not read what it watches has not established health
  // either. An RPC failure over a watched entry is silence with a cause.
  for (const issue of scan.issues) {
    if (issue.kind !== 'rpc-error' && issue.kind !== 'entry-not-found') continue;
    if (issue.entryKey !== undefined && scan.entries[issue.entryKey] !== undefined) continue;
    findings.push({
      entryKey: issue.entryKey ?? '(unknown key)',
      contracts: issue.contracts,
      reason: 'not-observed',
      severity: SEVERITY['not-observed'],
      remediation: 'investigate',
      isExpired: false,
      detail: describe('not-observed', undefined, false),
    });
  }

  if (findings.length === 0) return { isAlarm: false, findings: [] };
  const severity = findings.reduce<LivenessSeverity>(
    (worst, f) => (SEVERITY_RANK[f.severity] < SEVERITY_RANK[worst] ? f.severity : worst),
    'info',
  );
  return { isAlarm: true, severity, findings };
}
