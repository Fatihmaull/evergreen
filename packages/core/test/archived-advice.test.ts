import { describe, expect, it } from 'vitest';
import type { LedgerEntryTTL, ScanResult, Stroops } from '@evergreen-stellar/shared-types';
import { ARCHIVED_ENTRY_ADVICE } from '../src/archived-advice.js';
import { assessEntry } from '../src/health.js';
import { assertLiveness } from '../src/liveness.js';
import { estimateRent } from '../src/rent.js';
import { expiredEntryIssues } from '../src/ttl.js';

// PH2-E1-05: every surface that tells a user what to do about an archived entry
// says the same thing, in the site's terms (#322), and none says it about a
// deleted temporary entry. Built on the real expired shape: since #235 an
// entry past its final live ledger is `status: 'expired'`, and an archived one
// is returned by RPC with no final ledger.
const KEY = 'AAAABgAAAAEbInstanceB';

function expired(kind: 'instance' | 'temporary'): LedgerEntryTTL {
  return {
    kind,
    endBehavior: kind === 'temporary' ? 'deleted' : 'archived',
    contracts: ['CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ'],
    observedAtLedger: 5_292_238,
    ttl: { status: 'expired' },
  } as LedgerEntryTTL;
}

function scanOf(entry: LedgerEntryTTL): ScanResult {
  return {
    network: 'testnet',
    contracts: [{ id: entry.contracts[0]! }],
    entries: { [KEY]: entry },
    issues: [],
  };
}

const noQuote = {
  quote: () => Promise.resolve([] as { entryKey: string; estimatedRentStroops: Stroops }[]),
};

/** The four places core tells a user about an entry past its final live ledger. */
async function surfaces(entry: LedgerEntryTTL): Promise<Record<string, string | undefined>> {
  const scan = scanOf(entry);
  return {
    'health reason': assessEntry(entry, 17_280).reason,
    'liveness finding': assertLiveness({
      scan,
      decisions: [],
      thresholds: { bumpWhenRemainingLedgersBelow: 17_280 },
      records: [],
    }).findings[0]?.detail,
    'rent exclusion': (await estimateRent(scan, { extendToLedgers: {} }, noQuote)).excluded[0]
      ?.detail,
    'scan issue': expiredEntryIssues(scan.entries)[0]?.message,
  };
}

describe('archived-entry advice (PH2-E1-05)', () => {
  it('names the restore list, simulation, and the extend exception', () => {
    expect(ARCHIVED_ENTRY_ADVICE).toContain('restore list');
    expect(ARCHIVED_ENTRY_ADVICE).toContain('simulation fills that list in');
    expect(ARCHIVED_ENTRY_ADVICE).toContain('restores it automatically');
    expect(ARCHIVED_ENTRY_ADVICE).toContain('an extend is not an invocation');
    expect(ARCHIVED_ENTRY_ADVICE).toContain('RestoreFootprintOp');
  });

  it('carries no protocol version number (claims-and-copy.md: never)', () => {
    expect(ARCHIVED_ENTRY_ADVICE).not.toMatch(/protocol|\bP\d{2}\b|\bv\d{2}\b|CAP-/i);
  });

  it('🔴 every surface gives an archived entry the same advice', async () => {
    const said = await surfaces(expired('instance'));
    for (const [where, text] of Object.entries(said)) {
      expect(text, where).toContain(ARCHIVED_ENTRY_ADVICE);
    }
  });

  it('🔴 no surface offers a restore for a deleted temporary entry', async () => {
    const said = await surfaces(expired('temporary'));
    for (const [where, text] of Object.entries(said)) {
      expect(text, where).toBeDefined();
      expect(text, where).not.toContain('restore list');
      expect(text, where).not.toContain('RestoreFootprintOp');
    }
  });
});
