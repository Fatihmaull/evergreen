import { readFileSync } from 'node:fs';
import { Address, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { scanContract } from '../src/scan-contract.js';
import type { LedgerEntryReader, RawLedgerEntry } from '../src/rpc.js';
import { instanceKey } from '../src/rpc.js';
import { createMockReader } from './mock-rpc.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url), 'utf8'),
) as {
  result: {
    latestLedger: number;
    entries: { key: string; xdr: string; liveUntilLedgerSeq: number }[];
  };
};
const recorded = fixture.result.entries.map((e) => ({
  key: e.key,
  entryXdr: e.xdr,
  liveUntilLedgerSeq: e.liveUntilLedgerSeq,
}));
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
const INSTANCE = instanceKey(A);
const CODE = recorded[1]!.key;
const DATA_KEYS = recorded.slice(2).map((e) => e.key);
const at = fixture.result.latestLedger;
function reader(rows: readonly RawLedgerEntry[] = recorded): LedgerEntryReader {
  return createMockReader(at, rows);
}

describe('scanContract — recorded four-entry scan', () => {
  it('discovers code from instance, reads supplied data keys, and reports lifecycles', async () => {
    const rpc = reader();
    const read = vi.spyOn(rpc, 'read');
    const result = await scanContract(rpc, { id: A }, DATA_KEYS);
    expect(read.mock.calls.map(([keys]) => keys)).toEqual([[INSTANCE], [...DATA_KEYS, CODE]]);
    expect(result.issues).toEqual([]);
    expect(
      Object.values(result.entries)
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['code', 'instance', 'persistent', 'temporary']);
    expect(result.entries[DATA_KEYS[1]!]!.endBehavior).toBe('deleted');
    expect(result.entries[CODE]!.endBehavior).toBe('archived');
    expect(result.entries[DATA_KEYS[1]!]!.ttl).toMatchObject({ remainingLedgers: 688 });
    expect(result.coverage).toEqual({ mode: 'known-keys', dataKeysSuppliedByContract: { [A]: 2 } });
    expect(JSON.parse(JSON.stringify(result))).toEqual(result);
  });

  it('does not pretend storage was enumerated when no keys were supplied', async () => {
    const result = await scanContract(reader(), { id: A });
    expect(Object.keys(result.entries).sort()).toEqual([INSTANCE, CODE].sort());
    expect(result.coverage?.dataKeysSuppliedByContract[A]).toBe(0);
  });

  it('normalizes whitespace and counts each explicit data key once', async () => {
    const result = await scanContract(reader(), { id: A }, [DATA_KEYS[0]!, ` ${DATA_KEYS[0]!}\n`]);
    expect(result.coverage?.dataKeysSuppliedByContract[A]).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it.each(['not-xdr', '', INSTANCE, CODE, instanceKey(B)])(
    'rejects invalid/additional non-data keys: %s',
    async (key) => {
      const result = await scanContract(reader(), { id: A }, [key]);
      expect(result.issues.some((i) => i.kind === 'invalid-response')).toBe(true);
      expect(result.coverage?.dataKeysSuppliedByContract[A]).toBe(0);
    },
  );

  it('rejects a valid data key belonging to another contract', async () => {
    const original = xdr.LedgerKey.fromXDR(DATA_KEYS[0]!, 'base64');
    if (original.type !== 'contractData') throw new Error('fixture');
    const foreign = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        ...original.contractData,
        contract: new Address(B).toScAddress(),
      }),
    ).toXDR('base64');
    const result = await scanContract(reader(), { id: A }, [foreign]);
    expect(result.issues[0]?.kind).toBe('invalid-response');
  });

  it('does no RPC reads for an invalid contract', async () => {
    const rpc = reader();
    const read = vi.spyOn(rpc, 'read');
    const result = await scanContract(rpc, { id: 'bad-id' });
    expect(read).not.toHaveBeenCalled();
    expect(result.issues[0]?.kind).toBe('invalid-response');
  });

  it('reports absence without inferring deletion, retaining other results', async () => {
    const result = await scanContract(
      createMockReader(at, recorded, { omit: [DATA_KEYS[1]!] }),
      { id: A },
      DATA_KEYS,
    );
    expect(Object.keys(result.entries)).toHaveLength(3);
    expect(result.issues[0]).toMatchObject({
      kind: 'entry-not-found',
      entryKey: DATA_KEYS[1],
      observedAtLedger: at,
    });
    expect(result.issues[0]?.message).toContain('not proof');
  });

  it('still reads explicit data when the instance is absent, but invents no code key', async () => {
    const rpc = createMockReader(at, recorded, { omit: [INSTANCE] });
    const read = vi.spyOn(rpc, 'read');
    const result = await scanContract(rpc, { id: A }, DATA_KEYS);
    expect(read.mock.calls[1]?.[0]).toEqual(DATA_KEYS);
    expect(result.entries[CODE]).toBeUndefined();
    expect(Object.keys(result.entries)).toHaveLength(2);
  });

  it('keeps unavailable TTL distinct from zero and applies inclusive math', async () => {
    const rows = recorded.map((e, i) => ({ ...e, liveUntilLedgerSeq: i === 0 ? undefined : at }));
    const result = await scanContract(reader(rows), { id: A }, DATA_KEYS);
    expect(result.entries[INSTANCE]!.ttl).toEqual({ status: 'unavailable' });
    expect(result.entries[CODE]!.ttl).toMatchObject({ remainingLedgers: 0 });
  });

  it.each([null, -1, 1.5, NaN, 2 ** 32])(
    'rejects malformed TTL %s without losing valid rows',
    async (ttl) => {
      const rows = recorded.map((e, i) => (i === 2 ? { ...e, liveUntilLedgerSeq: ttl } : e));
      const rpc = reader(rows as unknown as RawLedgerEntry[]);
      const result = await scanContract(rpc, { id: A }, DATA_KEYS);
      expect(Object.keys(result.entries)).toHaveLength(3);
      expect(result.issues[0]?.kind).toBe('invalid-response');
    },
  );

  it('rejects a payload that does not match its requested key', async () => {
    const rows = recorded.map((e, i) => (i === 2 ? { ...e, entryXdr: recorded[3]!.entryXdr } : e));
    const result = await scanContract(reader(rows), { id: A }, DATA_KEYS);
    expect(result.entries[DATA_KEYS[0]!]).toBeUndefined();
    expect(result.issues[0]?.kind).toBe('invalid-response');
  });

  it.each([undefined, 'not-xdr'])(
    'rejects missing/malformed instance payload %s',
    async (payload) => {
      const rows = recorded.map((e, i) => (i === 0 ? { ...e, entryXdr: payload } : e));
      const result = await scanContract(
        reader(rows as unknown as RawLedgerEntry[]),
        { id: A },
        DATA_KEYS,
      );
      expect(result.entries[INSTANCE]).toBeUndefined();
      expect(result.entries[CODE]).toBeUndefined();
      expect(result.issues[0]?.kind).toBe('invalid-response');
    },
  );

  it('reports non-Wasm executable without inventing code, and retains instance/data', async () => {
    const original = xdr.LedgerEntryData.fromXDR(recorded[0]!.entryXdr, 'base64');
    if (original.type !== 'contractData') throw new Error('fixture');
    const changed = xdr.LedgerEntryData.contractData(
      new xdr.ContractDataEntry({
        ...original.contractData,
        val: xdr.ScVal.scvContractInstance(
          new xdr.ScContractInstance({
            executable: xdr.ContractExecutable.contractExecutableStellarAsset(),
            storage: [],
          }),
        ),
      }),
    );
    const rows = recorded.map((e, i) =>
      i === 0 ? { ...e, entryXdr: changed.toXDR('base64') } : e,
    );
    const result = await scanContract(reader(rows), { id: A }, DATA_KEYS);
    expect(Object.keys(result.entries)).toHaveLength(3);
    expect(result.issues[0]?.kind).toBe('unsupported-executable');
  });
});

describe('RPC boundaries', () => {
  it.each([
    {},
    { latestLedger: 10 },
    { latestLedger: 10, entries: null },
    { latestLedger: -1, entries: [] },
  ])('rejects malformed response %j', async (response) => {
    const rpc = { read: async () => response } as unknown as LedgerEntryReader;
    const result = await scanContract(rpc, { id: A });
    expect(result.entries).toEqual({});
    expect(result.issues[0]?.kind).toBe('invalid-response');
  });

  it('rejects unexpected rows and discards duplicate observations', async () => {
    const rpc = {
      read: async () => ({
        latestLedger: at,
        entries: [recorded[0]!, recorded[0]!, recorded[1]!, null],
      }),
    } as unknown as LedgerEntryReader;
    const result = await scanContract(rpc, { id: A });
    expect(result.entries).toEqual({});
    expect(result.issues.filter((i) => i.kind === 'invalid-response')).toHaveLength(3);
  });

  it('does not leak credentials from thrown RPC errors', async () => {
    const rpc = createMockReader(at, recorded, {
      failWith: new Error('https://user:SECRET@rpc/?key=TOKEN'),
    });
    const result = await scanContract(rpc, { id: A });
    expect(result.issues[0]?.kind).toBe('rpc-error');
    expect(JSON.stringify(result)).not.toMatch(/SECRET|TOKEN/);
  });

  // Synthetic variants of the recorded persistent entry, solely for batch boundaries.
  function many(count: number): RawLedgerEntry[] {
    const base = xdr.LedgerEntryData.fromXDR(recorded[2]!.entryXdr, 'base64');
    if (base.type !== 'contractData') throw new Error('fixture');
    return Array.from({ length: count }, (_, i) => {
      const fields = { ...base.contractData, key: xdr.ScVal.scvU32(i) };
      return {
        key: xdr.LedgerKey.contractData(new xdr.LedgerKeyContractData(fields)).toXDR('base64'),
        entryXdr: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry(fields)).toXDR(
          'base64',
        ),
        liveUntilLedgerSeq: at + 1000,
      };
    });
  }

  it.each([199, 200, 201])(
    'chunks %i data keys plus discovered code and preserves each response ledger',
    async (count) => {
      const rows = many(count);
      const base = reader([...recorded.slice(0, 2), ...rows]);
      let call = 0;
      const read = vi.fn(async (keys: readonly string[]) => ({
        ...(await base.read(keys)),
        latestLedger: at + call++,
      }));
      const result = await scanContract(
        { read },
        { id: A },
        rows.map((r) => r.key),
      );
      expect(result.issues).toEqual([]);
      expect(Object.keys(result.entries)).toHaveLength(count + 2);
      expect(read.mock.calls.every(([keys]) => keys.length <= 200)).toBe(true);
      expect(result.entries[INSTANCE]!.observedAtLedger).toBe(at);
      expect(result.entries[CODE]!.observedAtLedger).toBe(at + (count >= 200 ? 2 : 1));
    },
  );

  it('retains successful batches when a later one fails', async () => {
    const rows = many(201);
    const base = reader([...recorded.slice(0, 2), ...rows]);
    let call = 0;
    const rpc: LedgerEntryReader = {
      read: (keys) => (++call === 3 ? Promise.reject(new Error('offline')) : base.read(keys)),
    };
    const result = await scanContract(
      rpc,
      { id: A },
      rows.map((r) => r.key),
    );
    expect(Object.keys(result.entries)).toHaveLength(201);
    expect(result.issues[0]?.kind).toBe('rpc-error');
  });
});
