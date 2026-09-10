import type {
  BumpRecord,
  BumpThresholds,
  ContractId,
  LedgerKey,
  ScanResult,
} from '@evergreen-stellar/shared-types';

/**
 * The liveness assertion (`W2-D10-04`).
 *
 * A run that does nothing looks exactly like a run that succeeded. That is the
 * dominant failure mode of a scheduled job, and it is not hypothetical here:
 * `claim()` returning null is the ORDINARY skip path, so roughly 96 clean
 * exit-0 runs could pass across guinea-pig B's 24-hour window while B archives
 * unattended. Every one of those runs would look healthy.
 *
 * This converts that silence into an alarm. The rule is deliberately blunt:
 *
 *   if an entry was seen below threshold and this run did not verifiably
 *   extend it, the run is NOT healthy — whatever the reason.
 *
 * "Whatever the reason" is the load-bearing part. A claim held by another
 * runner, a lock lookup that threw, a dry-run, an unconfirmed submission, a
 * decision skipped by policy — these are all legitimate reasons not to bump,
 * and none of them is a reason to report health. The failure this guards
 * against is exactly the one that looks fine: same shape as the testnet guard
 * that refused every deploy and screamed at nobody.
 *
 * Pure — no I/O, no clock, no engine dependency. The engine calls it at the
 * end of a run (`W3-D15-01`); it is testable now, which is why it can land
 * before the run loop exists.
 */

export type LivenessReason =
  /** Below threshold, and this run produced no record for it at all. The silent skip. */
  | 'no-action-recorded'
  /** A bump was simulated but never submitted. Dry-run is the DEFAULT, so this is likely. */
  | 'dry-run-only'
  /** Submitted but not confirmed. Not yet a success; the ledger has not agreed. */
  | 'submitted-unconfirmed'
  /** The bump was attempted and failed. */
  | 'bump-failed'
  /** Watched, but its TTL could not be read. Absence of observation is not health. */
  | 'not-observed';

export interface LivenessFinding {
  readonly entryKey: LedgerKey;
  /**
   * Every contract this entry serves. A shared `ContractCode` entry alarms once
   * but names all N — the blast radius is the point, not a detail.
   */
  readonly contracts: readonly ContractId[];
  readonly reason: LivenessReason;
  /** Absent when the entry was never observed. */
  readonly remainingLedgers?: number;
  /** Human-readable, safe to print; never a raw error. */
  readonly detail: string;
}

export interface LivenessVerdict {
  /** True when the run must NOT report success. Drives a non-zero exit. */
  readonly isAlarm: boolean;
  readonly findings: readonly LivenessFinding[];
}

/**
 * Only a CONFIRMED extension counts as having acted.
 *
 * `succeeded` requires both a confirmed transaction and a verified post-bump
 * TTL observation. `submitted` is explicitly "never treated as successful yet",
 * `simulated` never touched the chain, and `failed` is self-evident. Treating
 * any of the other three as action is how a run reports health it did not earn.
 */
function confirmedBump(record: BumpRecord): boolean {
  return record.outcome === 'succeeded';
}

function describe(reason: LivenessReason, remainingLedgers?: number): string {
  const at =
    remainingLedgers === undefined
      ? 'its TTL could not be read'
      : `${remainingLedgers.toLocaleString()} ledgers remain`;
  switch (reason) {
    case 'no-action-recorded':
      return `Below threshold (${at}) and this run recorded no action for it.`;
    case 'dry-run-only':
      return `Below threshold (${at}) and the extension was only simulated — nothing was submitted.`;
    case 'submitted-unconfirmed':
      return `Below threshold (${at}) and the extension was submitted but not confirmed on ledger.`;
    case 'bump-failed':
      return `Below threshold (${at}) and the extension failed.`;
    case 'not-observed':
      return `Watched, but ${at}; absence of an observation is not evidence of health.`;
  }
}

/**
 * Rank reasons so one entry reports its most informative cause. A failed bump
 * says more than "no action recorded", which would also be true of it.
 */
const REASON_RANK: Record<LivenessReason, number> = {
  'bump-failed': 0,
  'submitted-unconfirmed': 1,
  'dry-run-only': 2,
  'no-action-recorded': 3,
  'not-observed': 4,
};

export function assertLiveness(args: {
  readonly scan: ScanResult;
  readonly thresholds: Pick<BumpThresholds, 'bumpWhenRemainingLedgersBelow'>;
  /** Every record this run produced. An empty array is the silent-run case. */
  readonly records: readonly BumpRecord[];
}): LivenessVerdict {
  const { scan, records } = args;
  const threshold = args.thresholds.bumpWhenRemainingLedgersBelow;
  if (!Number.isInteger(threshold) || threshold < 0) {
    throw new Error('bumpWhenRemainingLedgersBelow must be a non-negative integer of ledgers');
  }

  const byEntry = new Map<LedgerKey, BumpRecord[]>();
  for (const record of records) {
    const existing = byEntry.get(record.entryKey);
    if (existing) existing.push(record);
    else byEntry.set(record.entryKey, [record]);
  }

  const findings: LivenessFinding[] = [];

  for (const [entryKey, entry] of Object.entries(scan.entries)) {
    // An entry we could not read is not an entry we can call healthy. This is
    // the same rule as `remainingLedgers === 0 is still live`: unknown and
    // fine must never collapse into the same answer.
    if (entry.ttl.status === 'unavailable') {
      findings.push({
        entryKey,
        contracts: entry.contracts,
        reason: 'not-observed',
        detail: describe('not-observed'),
      });
      continue;
    }

    const { remainingLedgers } = entry.ttl;
    if (remainingLedgers >= threshold) continue;

    const forEntry = byEntry.get(entryKey) ?? [];
    if (forEntry.some(confirmedBump)) continue;

    const reasons = forEntry.map((record): LivenessReason => {
      switch (record.outcome) {
        case 'simulated':
          return 'dry-run-only';
        case 'submitted':
          return 'submitted-unconfirmed';
        case 'failed':
          return 'bump-failed';
        default:
          return 'no-action-recorded';
      }
    });
    const reason =
      reasons.length === 0
        ? 'no-action-recorded'
        : reasons.reduce((a, b) => (REASON_RANK[a] <= REASON_RANK[b] ? a : b));

    findings.push({
      entryKey,
      contracts: entry.contracts,
      reason,
      remainingLedgers,
      detail: describe(reason, remainingLedgers),
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
      detail: describe('not-observed'),
    });
  }

  return { isAlarm: findings.length > 0, findings };
}
