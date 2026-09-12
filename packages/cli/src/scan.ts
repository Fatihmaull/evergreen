import type { ScanResult } from '@evergreen-stellar/shared-types';
import {
  assessEntry,
  coverageIssues,
  estimateEndsAt,
  isLive,
  needsAction,
  worstHealth,
} from '@evergreen-stellar/core';
import type { EntryAssessment, EntryHealth } from '@evergreen-stellar/core';

/**
 * Colour is opt-in and off by default. A CLI whose output is piped into a log,
 * a CI annotation or a grant reviewer's terminal transcript should not emit
 * escape codes nobody asked for; `bin.ts` enables it only for an interactive
 * TTY with NO_COLOR unset.
 *
 * The health WORD is always printed. Colour is redundant emphasis on top of it,
 * never the only carrier of the state — a reader who is colour-blind, piping to
 * a file, or reading a screenshot must get the same information.
 */
const ANSI: Record<EntryHealth, string> = {
  healthy: '\u001B[32m',
  warning: '\u001B[33m',
  critical: '\u001B[31m',
  unknown: '\u001B[35m',
};
const RESET = '\u001B[0m';

function paint(health: EntryHealth, text: string, color: boolean): string {
  return color ? `${ANSI[health]}${text}${RESET}` : text;
}

const LABEL: Record<EntryHealth, string> = {
  healthy: 'HEALTHY',
  warning: 'WARNING',
  critical: 'CRITICAL',
  unknown: 'UNKNOWN',
};

export interface FormatOptions {
  /** Emit ANSI colour. Default false; `bin.ts` decides from the environment. */
  readonly color?: boolean;
  /** Ledgers below which an entry needs action. Must match the exit-code gate. */
  readonly thresholdLedgers?: number;
}

/**
 * Format a scan for humans. The CLI is thin: it parses, calls core, formats,
 * and sets an exit code. All logic lives in core.
 */

export const EXIT_OK = 0;
export const EXIT_BELOW_THRESHOLD = 1;
export const EXIT_ERROR = 2;
export const EXIT_INCOMPLETE = 3;

/** Matches evergreen.config.example.json; pinned by scripts/check-policy-constants.mjs. */
export const DEFAULT_THRESHOLD_LEDGERS = 17_280;

/**
 * The `--json` health block.
 *
 * Additive to `ScanResult`, never a mutation of it: `ScanResult` is
 * ADR-005-accepted and consumed by the engine and dashboard, and existing
 * readers of `entries`/`issues` must keep working untouched.
 *
 * This is where blast radius lives. ADR-006 § *Considered and declined*
 * settles that it must NOT reach the exit code: exit codes signal category,
 * not magnitude, and a new code silently breaks every consumer matching the
 * old set. Magnitude belongs in output, and this is the machine-readable half.
 */
export interface ScanHealthReport {
  readonly thresholdLedgers: number;
  /** Worst state across all entries. Absent when nothing was observed. */
  readonly worst?: EntryHealth;
  /** Entries KNOWN to serve more than one contract. A floor. */
  readonly sharedEntryCount: number;
  /**
   * Entries whose sharing could not be determined. **Non-zero means
   * `sharedEntryCount` is a lower bound, not a count** — do not read a zero
   * shared count as "nothing is shared" while this is above zero.
   */
  readonly undeterminedSharingCount: number;
  readonly byEntry: Readonly<Record<string, EntryAssessment>>;
}

/** Grade every entry once, for whichever renderer wants it. */
export function healthReport(result: ScanResult, thresholdLedgers: number): ScanHealthReport {
  const byEntry: Record<string, EntryAssessment> = {};
  for (const [key, entry] of Object.entries(result.entries)) {
    byEntry[key] = assessEntry(entry, thresholdLedgers);
  }
  const assessments = Object.values(byEntry);
  const worst = worstHealth(assessments);
  return {
    thresholdLedgers,
    ...(worst === undefined ? {} : { worst }),
    sharedEntryCount: assessments.filter((a) => a.sharingStatus === 'shared').length,
    undeterminedSharingCount: assessments.filter((a) => a.sharingStatus === 'undetermined').length,
    byEntry,
  };
}

export function formatHuman(result: ScanResult, now: Date, options: FormatOptions = {}): string {
  const color = options.color === true;
  const thresholdLedgers = options.thresholdLedgers ?? DEFAULT_THRESHOLD_LEDGERS;
  const lines: string[] = [];
  const entries = Object.entries(result.entries);
  const assessments: EntryAssessment[] = [];

  // Every caveat the human sees comes from `coverageIssues`, which is also what
  // the JSON emits. One source of truth, so the two channels cannot disagree.
  const caveats = coverageIssues(result);

  // The ROSTER, not an inference from one. `W2-D10-01c` asks that a scan say
  // which contracts it actually scanned, in both channels, so that an argument
  // dropped by a parser is VISIBLE rather than deduced from something missing
  // further down. The JSON has always carried `contracts`; the human channel
  // only listed them as a side effect of per-contract data-key counts, which
  // reads as a coverage detail rather than "here is what I looked at".
  if (result.contracts.length > 0) {
    lines.push(
      `Scanned ${result.contracts.length} contract(s): ${result.contracts.map((c) => c.id).join(', ')}`,
    );
  }
  if (result.coverage) {
    lines.push('Coverage: known keys only — contract storage has NOT been fully enumerated.');
    for (const [contract, count] of Object.entries(result.coverage.dataKeysSuppliedByContract)) {
      lines.push(`  ${contract}: ${count} explicit data key(s)`);
      if (result.coverage.noDataKeysDeclaredByContract?.[contract] === true) {
        lines.push('  No additional data keys declared by caller; not independently verified.');
      }
    }
    for (const caveat of caveats) {
      if (caveat.kind !== 'coverage-limited') continue;
      lines.push(`  ${caveat.message}`);
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
    const assessment = assessEntry(entry, thresholdLedgers);
    assessments.push(assessment);
    const shortKey = `${key.slice(0, 10)}…`;
    lines.push(
      `${paint(assessment.health, LABEL[assessment.health], color)}  ${entry.kind}  ${shortKey}`,
    );
    lines.push(`  contracts:  ${entry.contracts.join(', ')}`);
    // Misleading BY OMISSION otherwise, and misleading in the
    // confidently-green-before-total-outage direction: a per-contract view that
    // never mentions sharing shows N healthy contracts whose one common entry
    // is about to take all of them down together.
    if (assessment.sharingStatus === 'shared') {
      const others = assessment.observedContractCount - 1;
      lines.push(
        `  ⚠ shared:   this ${entry.kind} entry is shared with ${others} other contract${others === 1 ? '' : 's'} — they fail together`,
      );
    } else if (assessment.sharingStatus === 'undetermined') {
      // Rendered from the SAME sharingStatus the JSON reports, so the two
      // channels cannot say different things about the same entry.
      lines.push(
        '  ⚠ sharing:  code entries are shared by every contract built from the same Wasm.',
      );
      lines.push(
        `              This scan saw ${assessment.observedContractCount}. Whether others depend on this entry cannot be`,
      );
      lines.push('              determined from a single-contract scan — pass them together.');
    }

    if (entry.ttl.status === 'unavailable') {
      // Say "no TTL", never "0 ledgers" — an entry type that carries no TTL is
      // not an entry that is about to expire.
      lines.push('  ttl:        no TTL metadata returned; health is unknown');
    } else {
      const state = live ? 'live' : `EXPIRED (${entry.endBehavior})`;
      lines.push(`  remaining:  ${entry.ttl.remainingLedgers.toLocaleString()} ledgers — ${state}`);
      lines.push(`  ends at:    ledger ${entry.ttl.endsAtLedger.toLocaleString()}`);
      const at = estimateEndsAt(entry.ttl, now);
      // "expires", not "approx" or "crosses". `check-decay-drift.py` projects
      // the ALERT THRESHOLD and this projects EXPIRY; they sit exactly 24h
      // apart because THRESHOLD_LEDGERS is exactly one day, which is what made
      // the 2026-09-12 collision so convincing. Both were right, and a vague
      // label is what let one word cover two events.
      if (at) lines.push(`  expires ~:  ${at.toISOString()} (estimate — ledgers are the truth)`);
    }
    lines.push(`  observed:   ledger ${entry.observedAtLedger.toLocaleString()}`);
    lines.push(`  health:     ${LABEL[assessment.health]} — ${assessment.reason}`);
    lines.push('');
  }

  for (const issue of result.issues) {
    lines.push(`! ${issue.kind}: ${issue.message}`);
    lines.push(`  contracts: ${issue.contracts.join(', ')}`);
    // An absent entry has two very different causes with two different fixes,
    // and the scan genuinely cannot tell them apart — RPC returns nothing
    // either way. Naming both beats implying the wrong one, and beats leaving
    // a reader to guess at the moment they are trying to act.
    if (issue.kind === 'entry-not-found') {
      lines.push('  This means one of two things, and a scan cannot distinguish them:');
      lines.push('    · the entry was ARCHIVED — restore it with RestoreFootprintOp, or');
      lines.push('    · it never existed — check the contract ID and that it is deployed here.');
    }
    lines.push('');
  }

  const worst = worstHealth(assessments);
  if (worst !== undefined) {
    const shared = assessments.filter((a) => a.sharingStatus === 'shared').length;
    lines.push(
      `Worst entry health: ${paint(worst, LABEL[worst], color)}` +
        ` (threshold ${thresholdLedgers.toLocaleString()} ledgers)` +
        (shared > 0 ? ` · ${shared} shared entr${shared === 1 ? 'y' : 'ies'}` : ''),
    );
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
