import type { ScanResult } from '@evergreen-stellar/shared-types';
import { estimateEndsAt, isLive, needsAction } from '@evergreen-stellar/core';

/**
 * Format a scan for humans. The CLI is thin: it parses, calls core, formats,
 * and sets an exit code. All logic lives in core.
 */

export const EXIT_OK = 0;
export const EXIT_BELOW_THRESHOLD = 1;
export const EXIT_ERROR = 2;
export const EXIT_INCOMPLETE = 3;

export function formatHuman(result: ScanResult, now: Date): string {
  const lines: string[] = [];
  const entries = Object.entries(result.entries);

  if (result.coverage) {
    lines.push('Coverage: known keys only — contract storage has NOT been fully enumerated.');
    for (const [contract, count] of Object.entries(result.coverage.dataKeysSuppliedByContract)) {
      lines.push(`  ${contract}: ${count} explicit data key(s)`);
      if (result.coverage.noDataKeysDeclaredByContract?.[contract] === true) {
        lines.push('  No additional data keys declared by caller; not independently verified.');
      } else if (count === 0) {
        // Stated as a limit of the read, not as a demand on the reader. Only the
        // contract's author can know whether there are further keys; telling
        // everyone else to "supply keys" invites an assertion they cannot make.
        lines.push('  No data keys were supplied, so any further entries are unread.');
      }
    }
    lines.push('');
  } else {
    lines.push('Coverage: unspecified by producer; health assessment is incomplete.', '');
  }

  if (entries.length === 0 && result.issues.length === 0) {
    return [...lines, 'No ledger entries found.'].join('\n');
  }

  for (const [key, entry] of entries) {
    const live = isLive(entry.ttl);
    const shortKey = `${key.slice(0, 10)}…`;
    lines.push(`${entry.kind}  ${shortKey}`);
    lines.push(`  contracts:  ${entry.contracts.join(', ')}`);

    if (entry.ttl.status === 'unavailable') {
      // Say "no TTL", never "0 ledgers" — an entry type that carries no TTL is
      // not an entry that is about to expire.
      lines.push('  ttl:        no TTL metadata returned; health is unknown');
    } else {
      const state = live ? 'live' : `EXPIRED (${entry.endBehavior})`;
      lines.push(`  remaining:  ${entry.ttl.remainingLedgers.toLocaleString()} ledgers — ${state}`);
      lines.push(`  ends at:    ledger ${entry.ttl.endsAtLedger.toLocaleString()}`);
      const at = estimateEndsAt(entry.ttl, now);
      if (at) lines.push(`  approx:     ${at.toISOString()} (estimate — ledgers are the truth)`);
    }
    lines.push(`  observed:   ledger ${entry.observedAtLedger.toLocaleString()}`);
    lines.push('');
  }

  for (const issue of result.issues) {
    lines.push(`! ${issue.kind}: ${issue.message}`);
    lines.push(`  contracts: ${issue.contracts.join(', ')}`);
    lines.push('');
  }

  // A partial scan must never read as a clean bill of health.
  if (result.issues.length > 0) {
    lines.push(`Scan is PARTIAL — ${result.issues.length} issue(s). Absence is not health.`);
  }

  return lines.join('\n').trimEnd();
}

/**
 * Health gate for the planned `evergreen-check` Action, never a spending decision.
 * Precedence: error (2), incomplete (3), observed low TTL (1), healthy scope (0).
 * Mixed results keep their observations/issues in JSON even when one exit wins.
 */
export interface ExitCodeOptions {
  /**
   * Demand that every contract declare its data-key scope, and report `3` when
   * one has not. **Off by default, and that default is the whole point of the
   * ADR-006 amendment** (2026-09-10).
   *
   * Whether a contract has data keys beyond its instance is knowable only from
   * its source. RPC cannot enumerate storage, so a caller scanning a contract
   * they did not write *cannot* declare scope truthfully — and for them the
   * original default made `3` permanent, with the only escape being a flag
   * asserting something they cannot check. A signal that fires on every default
   * invocation has stopped being a signal.
   *
   * So the demand moved to the caller who can actually satisfy it: the contract's
   * author, in CI. `evergreen-check` turns this on (`W4-D25-01`); a human at a
   * terminal scanning someone else's contract does not get it.
   */
  readonly requireDeclaredScope?: boolean;
}

/** True when the scan itself came back degraded — as opposed to merely un-declared. */
function scanIsDegraded(result: ScanResult): boolean {
  return (
    Object.keys(result.entries).length === 0 ||
    result.issues.some(
      (i) => i.kind === 'entry-not-found' || i.kind === 'unsupported-executable',
    ) ||
    Object.values(result.entries).some((e) => e.ttl.status === 'unavailable')
  );
}

/** True when a contract's data-key scope was never stated, or was stated inconsistently. */
function scopeIsUndeclared(result: ScanResult): boolean {
  if (!result.coverage || result.contracts.length === 0) return true;
  return result.contracts.some((c) => {
    const count = result.coverage?.dataKeysSuppliedByContract[c.id];
    const empty = result.coverage?.noDataKeysDeclaredByContract?.[c.id] === true;
    if (count === undefined || !Number.isInteger(count) || count < 0) return true;
    // Zero supplied keys means something only if the caller said it meant something,
    // and a non-empty list alongside an emptiness claim is a contradiction.
    return count === 0 ? !empty : empty;
  });
}

export function exitCodeFor(
  result: ScanResult,
  thresholdLedgers: number,
  options: ExitCodeOptions = {},
): number {
  if (result.issues.some((i) => i.kind === 'rpc-error' || i.kind === 'invalid-response'))
    return EXIT_ERROR;

  // `3` means the read came back degraded: an entry missing, a TTL unavailable,
  // an executable we cannot follow, nothing observed at all. Rare, and therefore
  // still informative.
  if (scanIsDegraded(result)) return EXIT_INCOMPLETE;

  // Undeclared scope is `3` only when the caller asked to be held to it.
  if (options.requireDeclaredScope === true && scopeIsUndeclared(result)) return EXIT_INCOMPLETE;

  // CALLS the shared predicate; never restates it. This line previously read
  // `remainingLedgers < thresholdLedgers`, a longhand copy of the policy. When
  // the threshold became a floor (`<=`) on 2026-09-10, the copy did not move
  // with it — so at EXACTLY the threshold the engine alarmed while the Action
  // reported a clean CI pass. A gate that disagrees with the engine it gates
  // is worse than no gate. See CONVENTIONS § one home for a policy.
  for (const entry of Object.values(result.entries)) {
    if (entry.ttl.status === 'unavailable') continue;
    if (needsAction(entry.ttl.remainingLedgers, thresholdLedgers)) return EXIT_BELOW_THRESHOLD;
  }
  return EXIT_OK;
}
