import type { ScanResult } from '@evergreen-stellar/shared-types';
import { estimateEndsAt, isLive } from '@evergreen-stellar/core';

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
        lines.push(
          '  Data-key coverage unknown: supply keys, or --no-data-keys only if applicable.',
        );
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
export function exitCodeFor(result: ScanResult, thresholdLedgers: number): number {
  if (result.issues.some((i) => i.kind === 'rpc-error' || i.kind === 'invalid-response'))
    return EXIT_ERROR;
  if (
    !result.coverage ||
    result.contracts.length === 0 ||
    Object.keys(result.entries).length === 0 ||
    result.issues.length > 0 ||
    result.contracts.some((c) => {
      const count = result.coverage?.dataKeysSuppliedByContract[c.id];
      const empty = result.coverage?.noDataKeysDeclaredByContract?.[c.id] === true;
      return (
        count === undefined ||
        !Number.isInteger(count) ||
        count < 0 ||
        (count === 0 ? !empty : empty)
      );
    }) ||
    Object.values(result.entries).some((e) => e.ttl.status === 'unavailable')
  ) {
    return EXIT_INCOMPLETE;
  }
  for (const entry of Object.values(result.entries)) {
    if (entry.ttl.status === 'unavailable') continue;
    if (entry.ttl.remainingLedgers < thresholdLedgers) return EXIT_BELOW_THRESHOLD;
  }
  return EXIT_OK;
}
