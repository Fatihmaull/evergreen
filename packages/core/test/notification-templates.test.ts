import { describe, expect, it } from 'vitest';
import type { BumpRecord, LedgerEntryTTL } from '@evergreen-stellar/shared-types';
import { approachingCritical, bumpFailed, bumpSucceeded } from '../src/notification-templates.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const base = {
  entryKey: 'AAAABgAAAAEbInstanceKey',
  contracts: [A],
  reason: 'due',
  payer: 'bot',
  extendToLedgers: 600_000,
  recordedAt: '2026-09-14T00:00:00Z',
  before: { observedAtLedger: 1_000_000, endsAtLedger: 1_050_000 },
};

function entry(over: Partial<LedgerEntryTTL> & { remaining?: number } = {}): LedgerEntryTTL {
  const remaining = over.remaining ?? 100;
  return {
    kind: over.kind ?? 'instance',
    endBehavior: over.endBehavior ?? 'archived',
    contracts: over.contracts ?? [A],
    observedAtLedger: 1_000_000,
    ttl: { status: 'known', endsAtLedger: 1_000_000 + remaining, remainingLedgers: remaining },
  } as LedgerEntryTTL;
}

describe('bumpSucceeded — only a confirmed extension', () => {
  it('states the ledger range gained and the transaction', () => {
    const n = bumpSucceeded({
      ...base,
      outcome: 'succeeded',
      mode: 'live',
      signer: { kind: 'ed25519', account: 'G...' },
      transactionHash: 'a'.repeat(64),
      after: { observedAtLedger: 1_000_100, endsAtLedger: 1_600_000 },
    } as Extract<BumpRecord, { outcome: 'succeeded' }>);
    expect(n.severity).toBe('info');
    expect(n.body).toContain('CONFIRMED');
    expect(n.body).toContain('a'.repeat(64));
    expect(n.subject).toContain('550,000');
  });
});

describe('🔴 bumpFailed — submitted is not success', () => {
  it('routes an UNCONFIRMED submission here, not to the success template', () => {
    // The one state that looks like success and is not. `assertLiveness`
    // refuses to grant it silence; an email must not grant it either.
    const n = bumpFailed({
      ...base,
      outcome: 'submitted',
      mode: 'live',
      signer: { kind: 'ed25519', account: 'G...' },
      transactionHash: 'b'.repeat(64),
    } as Extract<BumpRecord, { outcome: 'submitted' }>);
    expect(n.severity).toBe('critical');
    expect(n.subject).toContain('UNCONFIRMED');
    expect(n.body).not.toContain('CONFIRMED\n');
    expect(n.body).toContain('DO NOT retry blindly');
  });

  it('labels failed simulation without claiming a live extension or safe retry', () => {
    const n = bumpFailed({
      ...base,
      outcome: 'failed',
      mode: 'dry-run',
      error: { code: 'RPC_TIMEOUT', message: 'timed out' },
    } as unknown as Extract<BumpRecord, { outcome: 'failed' }>);
    expect(n.body).toContain('RPC_TIMEOUT');
    expect(n.body).toContain('Simulation failed');
    expect(n.body).toContain('No transaction was submitted');
    expect(n.body).not.toContain('retry is safe');
  });
});

describe('approachingCritical — severity comes from assessEntry, not from here', () => {
  it('🔴 never offers restore for a temporary entry, and says DELETED', () => {
    // Temporary data is deleted at expiry. Telling someone to restore it is a
    // lie with a deadline on it.
    const n = approachingCritical(
      entry({ kind: 'temporary', endBehavior: 'deleted' }),
      'k',
      17_280,
    );
    expect(n.body).toContain('DELETED');
    // The requirement is that restore is never OFFERED — not that the word is
    // absent. "It cannot be restored" contains it and is exactly right. An
    // earlier version of this assertion banned the substring and failed on the
    // correct sentence: the test was checking the word, not the behaviour.
    expect(n.body).not.toContain('RestoreFootprintOp');
    expect(n.body).toContain('cannot be restored');
    expect(n.severity).toBe('critical');
  });

  it('🔴 reports a shared entry as N contracts failing together', () => {
    const n = approachingCritical(entry({ contracts: [A, 'CB', 'CC'], kind: 'code' }), 'k', 17_280);
    expect(n.body).toContain('SHARED by 3 contracts');
    expect(n.severity).toBe('critical');
  });

  it('says a single-contract scan cannot rule out sharing on a code entry', () => {
    const n = approachingCritical(entry({ kind: 'code' }), 'k', 17_280);
    expect(n.body).toContain('may serve others it cannot see');
  });

  it('carries the reason the engine declined, when there is one', () => {
    const n = approachingCritical(entry(), 'k', 17_280, 'REFUSED BY WRITE GUARD — guinea-pig B');
    expect(n.body).toContain('REFUSED BY WRITE GUARD');
  });

  it('does not claim an unreadable TTL is healthy', () => {
    const unreadable = { ...entry(), ttl: { status: 'unavailable' } } as unknown as LedgerEntryTTL;
    const n = approachingCritical(unreadable, 'k', 17_280);
    expect(n.body).toContain('not healthy');
    expect(n.severity).not.toBe('info');
  });
});

describe('failure evidence limits', () => {
  it.each([undefined, 'a'.repeat(64)])(
    'does not claim unchanged TTL or resolved intent for live failure (%s)',
    (hash) => {
      const n = bumpFailed({
        ...base,
        mode: 'live',
        outcome: 'failed',
        ...(hash ? { transactionHash: hash } : {}),
        error: { code: 'EXTENSION_FAILED', message: 'Post-state unverified' },
      });
      expect(n.body).toContain('could not be verified');
      expect(n.body).not.toContain('extension did not happen');
      expect(n.body).not.toContain('original TTL');
      expect(n.body).not.toContain('Nothing was left pending');
      expect(n.body).not.toContain('retry is safe');
      expect(n.body).toContain('before retrying');
    },
  );
});
