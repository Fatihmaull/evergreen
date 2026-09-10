import { describe, expect, it } from 'vitest';
import type { LedgerEntryTTL, ScanResult } from '@evergreen-stellar/shared-types';
import { assertLiveness, needsAction } from '@evergreen-stellar/core';
import { exitCodeFor } from '../src/scan.js';

/**
 * The CLI health gate and the engine's liveness assertion are two consumers of
 * ONE policy. They must never disagree about whether an entry needs action.
 *
 * They already did once. `exitCodeFor` carried a longhand `remaining <
 * threshold`; when the threshold became a floor on 2026-09-10, the copy did not
 * move with it, so at exactly the threshold the engine alarmed while
 * `evergreen-check` reported a clean CI pass. Both call `needsAction` now, and
 * this pins the agreement so a future edit to one cannot silently outrun the
 * other.
 */

const KEY = 'AAAAB0NvZGVLZXk=';
const THRESHOLD = 17_280;

function scanAt(remainingLedgers: number): ScanResult {
  const entry: LedgerEntryTTL = {
    kind: 'persistent',
    endBehavior: 'archived',
    contracts: ['CONTRACT_A'],
    observedAtLedger: 1_000_000,
    ttl: { status: 'known', endsAtLedger: 1_000_000 + remainingLedgers, remainingLedgers },
  };
  return {
    network: 'testnet',
    contracts: [{ id: 'CONTRACT_A' }],
    entries: { [KEY]: entry },
    issues: [],
    coverage: {
      mode: 'known-keys',
      dataKeysSuppliedByContract: { CONTRACT_A: 0 },
      noDataKeysDeclaredByContract: { CONTRACT_A: true },
    },
  };
}

describe('the CLI gate and the engine agree about "needs action"', () => {
  // Walk straight across the boundary rather than sampling near it.
  const around = [THRESHOLD + 2, THRESHOLD + 1, THRESHOLD, THRESHOLD - 1, 0, -1, -5];

  it.each(around)('agrees at remaining = %i', (remainingLedgers) => {
    const scan = scanAt(remainingLedgers);
    const engineAlarms = assertLiveness({
      scan,
      thresholds: { bumpWhenRemainingLedgersBelow: THRESHOLD },
      records: [],
    }).isAlarm;
    const cliFlags = exitCodeFor(scan, THRESHOLD) !== 0;
    expect(cliFlags).toBe(engineAlarms);
    // And both must match the predicate itself, not merely each other — two
    // consumers agreeing on the wrong answer is still the wrong answer.
    expect(engineAlarms).toBe(needsAction(remainingLedgers, THRESHOLD));
  });

  it('flags the exact threshold — the case that was previously a clean CI pass', () => {
    expect(exitCodeFor(scanAt(THRESHOLD), THRESHOLD)).not.toBe(0);
  });
});
