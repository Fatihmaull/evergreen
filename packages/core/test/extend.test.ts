import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import type { ScanResult } from '@evergreen-stellar/shared-types';
import { createMockReader } from './mock-rpc.js';
import { scanContract } from '../src/scan-contract.js';
import { instanceKey } from '../src/rpc.js';
import { planExtension, executeExtensions } from '../src/extend.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url), 'utf8'),
).result as {
  latestLedger: number;
  entries: { key: string; xdr: string; liveUntilLedgerSeq: number }[];
};
const dataKeys = fixture.entries.slice(2).map((e) => e.key);
async function scan(): Promise<ScanResult> {
  return scanContract(
    createMockReader(
      fixture.latestLedger,
      fixture.entries.map((e) => ({
        key: e.key,
        entryXdr: e.xdr,
        liveUntilLedgerSeq: e.liveUntilLedgerSeq,
      })),
    ),
    { id: A },
    dataKeys,
  );
}
const options = { contractId: A, additionalLedgers: 20, maxEntryTtl: 1000 };
async function atRemaining(remaining = 100): Promise<ScanResult> {
  const s = await scan();
  return {
    ...s,
    entries: Object.fromEntries(
      Object.entries(s.entries).map(([k, e]) => [
        k,
        {
          ...e,
          observedAtLedger: 1000,
          ttl: { status: 'known', endsAtLedger: 1000 + remaining, remainingLedgers: remaining },
        },
      ]),
    ),
  };
}
describe('manual extension selection', () => {
  it('selects only the instance by default and adds a delta to its current TTL', async () => {
    const p = planExtension(await atRemaining(), options);
    expect(p.entries).toHaveLength(1);
    expect(p.entries[0]).toMatchObject({
      entryKey: instanceKey(A),
      extendToLedgers: 120,
      wasCapped: false,
      skip: false,
    });
  });
  it('includes only explicit data keys and deduplicates them', async () => {
    const p = planExtension(await atRemaining(), {
      ...options,
      dataKeys: [dataKeys[0]!, dataKeys[0]!],
    });
    expect(p.entries.map((e) => e.entryKey)).toEqual([instanceKey(A), dataKeys[0]]);
    expect(
      planExtension(await atRemaining(), { ...options, dataKeys: [dataKeys[1]!] }).entries[1]?.kind,
    ).toBe('temporary');
  });
  it('requires explicit code selection and warns about invisible consumers', async () => {
    const p = planExtension(await atRemaining(), { ...options, includeCode: true });
    expect(p.entries.map((e) => e.kind)).toEqual(['instance', 'code']);
    expect(p.warnings.join(' ')).toContain('outside this scan');
  });
  it('caps before pricing and skips entries already at the ceiling', async () => {
    expect(planExtension(await atRemaining(990), options).entries[0]).toMatchObject({
      extendToLedgers: 999,
      wasCapped: true,
      skip: false,
    });
    expect(planExtension(await atRemaining(1000), options).entries[0]?.skip).toBe(true);
  });
  it('keeps remaining zero live and refuses expiry, missing and unreadable entries', async () => {
    expect(planExtension(await atRemaining(0), options).entries[0]?.extendToLedgers).toBe(20);
    const expired = await atRemaining(-1);
    expect(() => planExtension(expired, options)).toThrow();
    const s = await atRemaining();
    expect(() => planExtension({ ...s, entries: {} }, options)).toThrow();
    const entries = {
      ...s.entries,
      [instanceKey(A)]: { ...s.entries[instanceKey(A)]!, ttl: { status: 'unavailable' as const } },
    };
    expect(() => planExtension({ ...s, entries }, options)).toThrow();
  });
  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER, Infinity])(
    'refuses unsafe increments %s',
    async (additionalLedgers) => {
      const s = await atRemaining();
      expect(() => planExtension(s, { ...options, additionalLedgers })).toThrow();
    },
  );
  it('rejects foreign/non-data keys instead of silently omitting them', async () => {
    const s = await atRemaining();
    expect(() => planExtension(s, { ...options, dataKeys: [instanceKey(A)] })).toThrow();
    expect(() => planExtension(s, { ...options, dataKeys: ['invalid'] })).toThrow();
  });
  it('does not let an unrelated unselected code read error prevent instance extension', async () => {
    const s = await atRemaining();
    const code = Object.keys(s.entries).find((k) => s.entries[k]?.kind === 'code')!;
    const entries = { ...s.entries };
    delete entries[code];
    const partial = {
      ...s,
      entries,
      issues: [
        { kind: 'rpc-error' as const, contracts: [A], entryKey: code, message: 'unreadable' },
      ],
    };
    expect(planExtension(partial, options).entries).toHaveLength(1);
    expect(() => planExtension(partial, { ...options, includeCode: true })).toThrow();
  });
});

function executionDependencies() {
  const signer = {
    payer: 'manual',
    identity: { kind: 'ed25519' as const, account: 'public' },
    signExtendTTL: vi.fn(async () => 'signed'),
  };
  return {
    prepare: vi.fn(async (entry: import('../src/extend.js').PlannedExtension) => ({
      entry,
      sourceAccount: 'public',
      transactionXdr: 'unsigned',
      transactionHash: 'a'.repeat(64),
      feeStroops: '600',
      simulatedAtLedger: 1001,
    })),
    signer: vi.fn(() => signer),
    submit: vi.fn(async () => ({ status: 'PENDING', hash: 'a'.repeat(64) })),
    confirm: vi.fn(async () => ({ status: 'confirmed' as const, ledger: 1002 })),
    readAfter: vi.fn(async () => ({ observedAtLedger: 1003, endsAtLedger: 1122 })),
    preview: vi.fn(async () => {}),
    now: () => new Date('2026-09-10T00:00:00Z'),
  };
}
describe('extension execution safety', () => {
  it('does not turn an unconfirmed hash into success or attempt the next entry', async () => {
    const deps = {
      ...executionDependencies(),
      confirm: vi.fn(async () => ({ status: 'unconfirmed' as const })),
    };
    const p = planExtension(await atRemaining(), { ...options, dataKeys: [dataKeys[0]!] });
    const result = await executeExtensions(
      p,
      { payer: 'manual', submit: true, maxFeeStroops: '1200' },
      deps,
    );
    expect(result.records[0]?.outcome).toBe('submitted');
    expect(result.unattempted).toEqual([dataKeys[0]]);
    expect(deps.readAfter).not.toHaveBeenCalled();
    expect(deps.submit).toHaveBeenCalledTimes(1);
  });
  it('does not start a live request without a fee budget', async () => {
    const deps = executionDependencies();
    const p = planExtension(await atRemaining(), options);
    await expect(executeExtensions(p, { payer: 'manual', submit: true }, deps)).rejects.toThrow(
      'fee budget',
    );
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.signer).not.toHaveBeenCalled();
  });
  it('records a rejected submission as failure while preserving its known hash', async () => {
    const deps = executionDependencies();
    deps.submit.mockResolvedValue({ status: 'ERROR', hash: 'a'.repeat(64) });
    const result = await executeExtensions(
      planExtension(await atRemaining(), options),
      { payer: 'manual', submit: true, maxFeeStroops: '600' },
      deps,
    );
    expect(result.records[0]).toMatchObject({ outcome: 'failed', transactionHash: 'a'.repeat(64) });
    expect(deps.confirm).not.toHaveBeenCalled();
  });
  it('defaults to simulation without resolving any signer or sending', async () => {
    const deps = executionDependencies();
    const p = planExtension(await atRemaining(), options);
    const result = await executeExtensions(p, { payer: 'manual' }, deps);
    expect(result.records[0]).toMatchObject({ outcome: 'simulated', mode: 'dry-run' });
    expect(deps.signer).not.toHaveBeenCalled();
    expect(deps.submit).not.toHaveBeenCalled();
  });
  it('explicit live mode requires confirmation and increased absolute expiry', async () => {
    const deps = executionDependencies();
    const p = planExtension(await atRemaining(), options);
    const result = await executeExtensions(
      p,
      { payer: 'manual', submit: true, maxFeeStroops: '600' },
      deps,
    );
    expect(result.records[0]).toMatchObject({
      outcome: 'succeeded',
      after: { observedAtLedger: 1003, endsAtLedger: 1122 },
    });
    expect(deps.preview.mock.invocationCallOrder[0]).toBeLessThan(
      deps.signer.mock.invocationCallOrder[0]!,
    );
  });
  it('rejects SUCCESS without increased TTL or an inclusion-relative target', async () => {
    for (const endsAtLedger of [1100, 1110]) {
      const deps = executionDependencies();
      deps.readAfter.mockResolvedValue({ observedAtLedger: 1003, endsAtLedger });
      const result = await executeExtensions(
        planExtension(await atRemaining(), options),
        { payer: 'manual', submit: true, maxFeeStroops: '600' },
        deps,
      );
      expect(result.ok).toBe(false);
      expect(result.records[0]?.outcome).toBe('failed');
    }
  });
  it('retains the locally known hash and stops on uncertain sends', async () => {
    const deps = executionDependencies();
    deps.submit.mockRejectedValue(new Error('private raw transport detail'));
    const p = planExtension(await atRemaining(), { ...options, dataKeys: [dataKeys[0]!] });
    const result = await executeExtensions(
      p,
      { payer: 'manual', submit: true, maxFeeStroops: '1200' },
      deps,
    );
    expect(result.records[0]).toMatchObject({
      outcome: 'submitted',
      transactionHash: 'a'.repeat(64),
    });
    expect(result.ok).toBe(false);
    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect(deps.prepare).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private');
  });
  it('enforces the aggregate budget before signing a later transaction', async () => {
    const deps = executionDependencies();
    const p = planExtension(await atRemaining(), { ...options, dataKeys: [dataKeys[0]!] });
    const result = await executeExtensions(
      p,
      { payer: 'manual', submit: true, maxFeeStroops: '1000' },
      deps,
    );
    expect(result.records.map((r) => r.outcome)).toEqual(['succeeded', 'failed']);
    expect(deps.submit).toHaveBeenCalledTimes(1);
    expect(result.ok).toBe(false);
  });
  it('does not prepare, sign, or submit a no-op', async () => {
    const deps = executionDependencies();
    const p = planExtension(await atRemaining(1000), options);
    const result = await executeExtensions(
      p,
      { payer: 'manual', submit: true, maxFeeStroops: '600' },
      deps,
    );
    expect(result.skipped).toEqual([instanceKey(A)]);
    expect(result.ok).toBe(true);
    expect(deps.prepare).not.toHaveBeenCalled();
    expect(deps.signer).not.toHaveBeenCalled();
  });
});
