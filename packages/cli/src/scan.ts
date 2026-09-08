import type { ScanResult } from '@evergreen/shared-types';
import { estimateEndsAt, isLive } from '@evergreen/core';

/**
 * Format a scan for humans. The CLI is thin: it parses, calls core, formats,
 * and sets an exit code. All logic lives in core.
 */

export const EXIT_OK = 0;
export const EXIT_BELOW_THRESHOLD = 1;
export const EXIT_ERROR = 2;

export function formatHuman(result: ScanResult, now: Date): string {
  const lines: string[] = [];
  const entries = Object.entries(result.entries);

  if (entries.length === 0 && result.issues.length === 0) {
    return 'No ledger entries found.';
  }

  for (const [key, entry] of entries) {
    const live = isLive(entry.ttl);
    const shortKey = `${key.slice(0, 10)}…`;
    lines.push(`${entry.kind}  ${shortKey}`);
    lines.push(`  contracts:  ${entry.contracts.join(', ')}`);

    if (entry.ttl.status === 'unavailable') {
      // Say "no TTL", never "0 ledgers" — an entry type that carries no TTL is
      // not an entry that is about to expire.
      lines.push('  ttl:        no TTL metadata for this entry type');
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
 * Exit code contract, consumed by the `evergreen-check` GitHub Action. Keep it
 * stable once published — it is the Action's entire interface to this system.
 */
export function exitCodeFor(result: ScanResult, thresholdLedgers: number): number {
  if (result.issues.some((i) => i.kind === 'rpc-error')) return EXIT_ERROR;
  for (const entry of Object.values(result.entries)) {
    if (entry.ttl.status === 'unavailable') continue;
    if (entry.ttl.remainingLedgers < thresholdLedgers) return EXIT_BELOW_THRESHOLD;
  }
  return result.issues.length > 0 ? EXIT_BELOW_THRESHOLD : EXIT_OK;
}
