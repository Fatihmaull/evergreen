/**
 * Event ids for the 0015 ledger facts (PH2-E2-06). No database and no send.
 * `eventIdProblem` is the outbox rule: 1..200 chars, no whitespace, no `@`.
 */
import { describe, expect, it } from 'vitest';
import { allowanceExpiringEventId, approachingCriticalEventId } from '@evergreen-stellar/core';
import { eventIdProblem } from '../src/alerts/plan.js';

const entry = {
  network: 'testnet',
  contractId: 'C1',
  entryKey: 'contract-instance',
  liveUntilLedger: 4_000_000,
};

const allowance = {
  network: 'testnet',
  account: 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF',
  spender: 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBWHF',
  liveUntilLedger: 5_000_000,
  bandLedgers: 518_400 as const,
};

describe('alert ledger event ids', () => {
  it('the two shapes pass eventIdProblem', () => {
    expect(eventIdProblem(approachingCriticalEventId(entry))).toBeNull();
    expect(eventIdProblem(allowanceExpiringEventId(allowance))).toBeNull();
  });

  it('an @ in the id does not', () => {
    const withAt = approachingCriticalEventId({ ...entry, entryKey: 'owner@example' });
    expect(eventIdProblem(withAt)).toBe('contains_at');
  });
});
