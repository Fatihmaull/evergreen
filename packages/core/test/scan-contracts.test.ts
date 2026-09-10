import { readFileSync } from 'node:fs';
import { Address, StrKey, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { scanContracts } from '../src/scan-contract.js';
import type { LedgerEntryReader, RawLedgerEntry } from '../src/rpc.js';
import { codeKey, instanceKey } from '../src/rpc.js';
import { createMockReader } from './mock-rpc.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url), 'utf8'),
) as {
  result: {
    latestLedger: number;
    entries: { key: string; xdr: string; liveUntilLedgerSeq: number }[];
  };
};
const at = fixture.result.latestLedger;
const recorded = fixture.result.entries.map((e) => ({
  key: e.key,
  entryXdr: e.xdr,
  liveUntilLedgerSeq: e.liveUntilLedgerSeq,
}));
const CODE = recorded[1]!.key;

// Synthetic variants of A's recorded XDR, not fresh observations of B.
function dataFor(id: string, row = recorded[0]!, applicationKey?: xdr.ScVal): RawLedgerEntry {
  const value = xdr.LedgerEntryData.fromXDR(row.entryXdr!, 'base64');
  if (value.type !== 'contractData') throw new Error('fixture');
  const fields = {
    ...value.contractData,
    contract: new Address(id).toScAddress(),
    ...(applicationKey ? { key: applicationKey } : {}),
  };
  return {
    ...row,
    key: xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData(fields)).toXDR('base64'),
    entryXdr: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry(fields)).toXDR('base64'),
  };
}
const bInstance = dataFor(B);
const bData = dataFor(B, recorded[2]!);
const aKeys = recorded.slice(2).map((e) => e.key);
function reader(rows = [...recorded, bInstance, bData]) {
  const base = createMockReader(at, rows);
  return { read: vi.fn(base.read) };
}

describe('scanContracts — unique keys and consumers', () => {
  it('reads shared Wasm once while preserving separate instance/data entries and coverage', async () => {
    const rpc = reader();
    const result = await scanContracts(rpc, [
      { contract: { id: A }, dataKeys: aKeys },
      { contract: { id: B }, dataKeys: [bData.key] },
    ]);
    expect(Object.keys(result.entries)).toHaveLength(6);
    expect(result.entries[CODE]?.contracts).toEqual([A, B]);
    expect(result.entries[bData.key]?.contracts).toEqual([B]);
    expect(result.entries[aKeys[0]!]?.contracts).toEqual([A]);
    expect(result.coverage?.dataKeysSuppliedByContract).toEqual({ [A]: 2, [B]: 1 });
    const requests = rpc.read.mock.calls.flatMap(([keys]) => keys);
    expect(requests.filter((key) => key === CODE)).toHaveLength(1);
    expect(new Set(requests).size).toBe(requests.length);
    expect(result.issues).toEqual([]);
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('unions repeated inputs before RPC and keeps the first supplied label', async () => {
    const rpc = reader();
    const result = await scanContracts(rpc, [
      { contract: { id: A }, dataKeys: [aKeys[0]!] },
      { contract: { id: A, label: 'first' }, dataKeys: [` ${aKeys[0]!}\n`, aKeys[1]!] },
      { contract: { id: A, label: 'second' } },
      { contract: { id: B } },
    ]);
    expect(result.contracts).toEqual([{ id: A, label: 'first' }, { id: B }]);
    expect(result.entries[CODE]?.contracts).toEqual([A, B]);
    expect(result.coverage?.dataKeysSuppliedByContract).toEqual({ [A]: 2, [B]: 0 });
    const keys = rpc.read.mock.calls.flatMap(([batch]) => batch);
    expect(new Set(keys).size).toBe(keys.length);
    expect(result.issues).toEqual([]);
  });

  it.each([false, true])(
    'rejects contradictory repeated declarations in either order (%s)',
    async (reverse) => {
      const contradictory = [
        { contract: { id: A }, noDataKeys: true },
        { contract: { id: A }, dataKeys: aKeys },
      ];
      const rpc = reader();
      const result = await scanContracts(rpc, [
        ...(reverse ? contradictory.reverse() : contradictory),
        { contract: { id: B } },
      ]);
      expect(result.issues).toContainEqual(
        expect.objectContaining({ kind: 'invalid-response', contracts: [A] }),
      );
      expect(rpc.read.mock.calls.flatMap(([keys]) => keys)).not.toContain(instanceKey(A));
      expect(result.entries[CODE]?.contracts).toEqual([B]);
      expect(result.entries[instanceKey(B)]).toBeDefined();
    },
  );

  it('keeps empty-data assertions scoped to their own contract', async () => {
    const result = await scanContracts(reader(), [
      { contract: { id: A }, noDataKeys: true },
      { contract: { id: B } },
      { contract: { id: A }, noDataKeys: true },
    ]);
    expect(result.coverage?.noDataKeysDeclaredByContract).toEqual({ [A]: true });
    expect(result.coverage?.dataKeysSuppliedByContract).toEqual({ [A]: 0, [B]: 0 });
  });

  it('does not invent an absent instance consumer on a shared code entry', async () => {
    const result = await scanContracts(reader(recorded), [
      { contract: { id: A } },
      { contract: { id: B }, dataKeys: [bData.key] },
    ]);
    expect(result.entries[CODE]?.contracts).toEqual([A]);
    expect(result.issues).toContainEqual(
      expect.objectContaining({ entryKey: instanceKey(B), contracts: [B] }),
    );
  });

  it.each(['missing', 'malformed', 'duplicate'])(
    'attributes %s shared code to all known consumers',
    async (mode) => {
      const rows = [...recorded, bInstance].filter((e) => e.key !== CODE);
      const code = recorded[1]!;
      if (mode === 'malformed') rows.push({ ...code, entryXdr: 'bad' });
      if (mode === 'duplicate') rows.push(code, code);
      const result = await scanContracts(reader(rows), [
        { contract: { id: A } },
        { contract: { id: B } },
      ]);
      expect(result.entries[CODE]).toBeUndefined();
      expect(Object.keys(result.entries)).toHaveLength(2);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          entryKey: CODE,
          contracts: [A, B],
          kind: mode === 'missing' ? 'entry-not-found' : 'invalid-response',
        }),
      );
    },
  );

  it('keeps distinct Wasm hashes separate', async () => {
    const hash = Buffer.alloc(32, 7);
    const original = xdr.LedgerEntryData.fromXDR(bInstance.entryXdr!, 'base64');
    if (
      original.type !== 'contractData' ||
      original.contractData.val.type !== 'scvContractInstance'
    )
      throw new Error('fixture');
    const changed = xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ...original.contractData,
        val: xdr.ScVal.scvContractInstance(
          new xdr.ScContractInstance({
            ...original.contractData.val.instance,
            executable: xdr.ContractExecutable.contractExecutableWasm(hash),
          }),
        ),
      }),
    );
    const baseCode = xdr.LedgerEntryData.fromXDR(recorded[1]!.entryXdr, 'base64');
    if (baseCode.type !== 'contractCode') throw new Error('fixture');
    const other = xdr.LedgerEntryData.contractCode(
      new xdr.ContractCodeEntry({ ...baseCode.contractCode, hash }),
    );
    const rpc = reader([
      ...recorded,
      { ...bInstance, entryXdr: changed.toXDR('base64') },
      {
        key: codeKey(hash),
        entryXdr: other.toXDR('base64'),
        liveUntilLedgerSeq: at + 500,
      },
    ]);
    const result = await scanContracts(rpc, [{ contract: { id: A } }, { contract: { id: B } }]);
    expect(result.entries[CODE]?.contracts).toEqual([A]);
    expect(result.entries[codeKey(hash)]?.contracts).toEqual([B]);
    expect(result.issues).toEqual([]);
  });

  it('handles empty input without RPC or a claim of completeness', async () => {
    const rpc = reader();
    const result = await scanContracts(rpc, []);
    expect(result.contracts).toEqual([]);
    expect(result.entries).toEqual({});
    expect(rpc.read).not.toHaveBeenCalled();
  });
});

describe('scanContracts — partial batches and validation', () => {
  function manyData(id: string, count: number) {
    return Array.from({ length: count }, (_, i) => dataFor(id, recorded[2]!, xdr.ScVal.scvU32(i)));
  }

  it('keeps per-response ledgers across batches and deduplicates shared code before batching', async () => {
    const rows = manyData(A, 201);
    const base = reader([...recorded.slice(0, 2), bInstance, ...rows]);
    let call = 0;
    const read = vi.fn(async (keys: readonly string[]) => ({
      ...(await base.read(keys)),
      latestLedger: at + call++,
    }));
    const result = await scanContracts({ read }, [
      { contract: { id: A }, dataKeys: rows.map((r) => r.key) },
      { contract: { id: B } },
    ]);
    expect(read.mock.calls.map(([keys]) => keys.length)).toEqual([2, 200, 2]);
    expect(result.entries[instanceKey(A)]?.observedAtLedger).toBe(at);
    expect(result.entries[rows[0]!.key]?.observedAtLedger).toBe(at + 1);
    expect(result.entries[CODE]?.observedAtLedger).toBe(at + 2);
    expect(result.entries[CODE]?.ttl).toMatchObject({
      remainingLedgers: recorded[1]!.liveUntilLedgerSeq - at - 2,
    });
    expect(result.entries[CODE]?.contracts).toEqual([A, B]);
    expect(result.issues).toEqual([]);
  });

  it.each(['throw', 'malformed'])(
    'limits %s batch diagnostics to affected consumers and keeps later successes',
    async (mode) => {
      const rows = manyData(A, 200);
      const base = reader([...recorded, bInstance, ...rows]);
      let call = 0;
      const rpc = {
        read: async (keys: readonly string[]) => {
          if (++call === 2) {
            if (mode === 'throw') throw new Error('private RPC details');
            return { latestLedger: -1, entries: [] };
          }
          return base.read(keys);
        },
      } as LedgerEntryReader;
      const result = await scanContracts(rpc, [
        { contract: { id: A }, dataKeys: rows.map((r) => r.key) },
        { contract: { id: B } },
      ]);
      expect(result.issues).toHaveLength(1);
      expect(result.issues[0]?.contracts).toEqual([A]);
      expect(result.entries[CODE]?.contracts).toEqual([A, B]);
      expect(Object.keys(result.entries)).toHaveLength(3);
      expect(JSON.stringify(result)).not.toContain('private RPC details');
    },
  );

  it('attributes a shared-code RPC failure to both consumers and retains both instances', async () => {
    const base = reader();
    const rpc = {
      read: async (keys: readonly string[]) => {
        if (keys.includes(CODE)) throw new Error('offline');
        return base.read(keys);
      },
    };
    const result = await scanContracts(rpc, [{ contract: { id: A } }, { contract: { id: B } }]);
    expect(Object.keys(result.entries)).toEqual([instanceKey(A), instanceKey(B)]);
    expect(result.issues).toEqual([
      expect.objectContaining({ kind: 'rpc-error', contracts: [A, B] }),
    ]);
  });

  it('retains explicitly known data despite missing instances and does not infer code consumers', async () => {
    const result = await scanContracts(reader([recorded[2]!, bInstance, recorded[1]!]), [
      { contract: { id: A }, dataKeys: [aKeys[0]!] },
      { contract: { id: B } },
    ]);
    expect(result.entries[aKeys[0]!]?.contracts).toEqual([A]);
    expect(result.entries[CODE]?.contracts).toEqual([B]);
    expect(result.issues[0]).toMatchObject({ entryKey: instanceKey(A), contracts: [A] });
  });

  it('preserves consumer order when the RPC returns instances in reverse order', async () => {
    const result = await scanContracts(reader([bInstance, ...recorded]), [
      { contract: { id: A } },
      { contract: { id: B } },
    ]);
    expect(result.entries[CODE]?.contracts).toEqual([A, B]);
  });

  it('keeps invalid/foreign keys scoped to the submitting contract', async () => {
    const result = await scanContracts(reader(), [
      { contract: { id: A }, dataKeys: [bData.key, 'bad key', aKeys[0]!] },
      { contract: { id: B }, dataKeys: [bData.key] },
      { contract: { id: 'bad-id' } },
    ]);
    expect(result.issues.filter((i) => i.contracts.includes(A))).toHaveLength(2);
    expect(result.issues.some((i) => i.contracts.includes(B))).toBe(false);
    expect(result.coverage?.dataKeysSuppliedByContract).toEqual({ [A]: 1, [B]: 1 });
    expect(result.entries[CODE]?.contracts).toEqual([A, B]);
  });

  it.each([{ dataKeys: null }, { noDataKeys: 'true' }])(
    'rejects malformed scope %j before reads for that contract',
    async (invalid) => {
      const rpc = reader();
      const result = await scanContracts(rpc, [
        { contract: { id: A }, ...invalid },
        { contract: { id: B } },
      ] as unknown as Parameters<typeof scanContracts>[1]);
      expect(rpc.read.mock.calls.flatMap(([keys]) => keys)).not.toContain(instanceKey(A));
      expect(result.entries[CODE]?.contracts).toEqual([B]);
      expect(result.issues[0]?.kind).toBe('invalid-response');
    },
  );

  it.each([null, {}, [null], [{ contract: {} }]])(
    'diagnoses malformed request shape %j',
    async (input) => {
      const rpc = reader();
      const result = await scanContracts(
        rpc,
        input as unknown as Parameters<typeof scanContracts>[1],
      );
      expect(rpc.read).not.toHaveBeenCalled();
      expect(result.issues[0]?.kind).toBe('invalid-response');
    },
  );

  it('keeps shared unavailable TTL distinct from a live zero TTL instance', async () => {
    const rows = [...recorded, bInstance].map((r) => ({
      ...r,
      liveUntilLedgerSeq: r.key === CODE ? undefined : at,
    }));
    const result = await scanContracts({ read: createMockReader(at, rows).read }, [
      { contract: { id: A } },
      { contract: { id: B } },
    ]);
    expect(result.entries[CODE]?.ttl).toEqual({ status: 'unavailable' });
    expect(result.entries[instanceKey(A)]?.ttl).toMatchObject({ remainingLedgers: 0 });
  });
});

describe('scanContracts — instance batches', () => {
  it.each([false, true])(
    'batches 201 unique instances and discovers only successful consumers (failed first batch: %s)',
    async (failFirst) => {
      const ids = Array.from({ length: 201 }, (_, i) => {
        const bytes = Buffer.alloc(32);
        bytes.writeUInt32BE(i + 1, 28);
        return StrKey.encodeContract(bytes);
      });
      const base = createMockReader(at, [...ids.map((id) => dataFor(id)), recorded[1]!]);
      let call = 0;
      const read = vi.fn(async (keys: readonly string[]) => {
        const current = call++;
        if (current === 0 && failFirst) throw new Error('offline');
        return { ...(await base.read(keys)), latestLedger: at + current };
      });
      const result = await scanContracts(
        { read },
        ids.map((id) => ({ contract: { id } })),
      );
      expect(read.mock.calls.map(([keys]) => keys.length)).toEqual([200, 1, 1]);
      expect(result.entries[CODE]?.contracts).toEqual(failFirst ? ids.slice(200) : ids);
      expect(result.entries[instanceKey(ids[200]!)]?.observedAtLedger).toBe(at + 1);
      expect(result.entries[CODE]?.observedAtLedger).toBe(at + 2);
      expect(Object.keys(result.entries)).toHaveLength(failFirst ? 2 : 202);
      if (failFirst) expect(result.issues[0]?.contracts).toEqual(ids.slice(0, 200));
      else expect(result.issues).toEqual([]);
    },
  );
});
