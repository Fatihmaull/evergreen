import { describe, expect, it } from 'vitest';
import { scanInstances } from '../src/scan.js';
import { instanceKey } from '../src/rpc.js';
import { createMockReader } from './mock-rpc.js';

// Guinea-pig A and B. Real testnet IDs, used here only to derive ledger keys —
// no network access.
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';

describe('scanInstances', () => {
  it('keys entries by ledger key and back-references the contracts', async () => {
    const keyA = instanceKey(A);
    const reader = createMockReader(4_500_000, [{ key: keyA, liveUntilLedgerSeq: 4_600_000 }]);

    const result = await scanInstances(reader, [{ id: A }]);

    expect(Object.keys(result.entries)).toEqual([keyA]);
    expect(result.entries[keyA]?.contracts).toEqual([A]);
    expect(result.entries[keyA]?.ttl).toMatchObject({ remainingLedgers: 100_000 });
    expect(result.issues).toEqual([]);
  });

  it('records one entry, not two, when two contracts share a ledger key', async () => {
    // The shared-ContractCode case in miniature: the same key requested twice
    // must produce a single entry with both consumers. Duplicating it here is
    // where the rent double-count and duplicate-bump bugs originate.
    const keyA = instanceKey(A);
    const reader = createMockReader(4_500_000, [{ key: keyA, liveUntilLedgerSeq: 4_600_000 }]);

    const result = await scanInstances(reader, [{ id: A }, { id: A, label: 'again' }]);

    expect(Object.keys(result.entries)).toHaveLength(1);
    expect(result.entries[keyA]?.contracts).toEqual([A, A]);
  });

  it('marks an entry unavailable rather than expired when TTL metadata is missing', async () => {
    const keyA = instanceKey(A);
    const reader = createMockReader(4_500_000, [{ key: keyA, liveUntilLedgerSeq: undefined }]);

    const result = await scanInstances(reader, [{ id: A }]);

    expect(result.entries[keyA]?.ttl.status).toBe('unavailable');
  });

  it('reports a missing entry as an issue and never infers archival from absence', async () => {
    const keyA = instanceKey(A);
    const reader = createMockReader(4_500_000, [{ key: keyA, liveUntilLedgerSeq: 4_600_000 }], {
      omit: [instanceKey(B)],
    });

    const result = await scanInstances(reader, [{ id: A }, { id: B }]);

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0]).toMatchObject({ kind: 'entry-not-found', contracts: [B] });
    expect(result.issues[0]?.message).toContain('not proof of archival');
    // A is still reported — one missing entry must not discard the whole scan.
    expect(Object.keys(result.entries)).toEqual([keyA]);
  });

  it('surfaces a transport failure as an issue instead of throwing', async () => {
    const reader = createMockReader(0, [], { failWith: new Error('connect ECONNREFUSED') });

    const result = await scanInstances(reader, [{ id: A }]);

    expect(result.entries).toEqual({});
    expect(result.issues[0]).toMatchObject({ kind: 'rpc-error' });
  });

  it('rejects an invalid contract id without failing the whole scan', async () => {
    const keyA = instanceKey(A);
    const reader = createMockReader(4_500_000, [{ key: keyA, liveUntilLedgerSeq: 4_600_000 }]);

    const result = await scanInstances(reader, [{ id: A }, { id: 'not-a-contract-id' }]);

    expect(Object.keys(result.entries)).toEqual([keyA]);
    expect(result.issues.some((i) => i.kind === 'invalid-response')).toBe(true);
  });
});
