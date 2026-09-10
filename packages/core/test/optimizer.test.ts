import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { ScanResult } from '@evergreen-stellar/shared-types';
import { scanContract } from '../src/scan-contract.js';
import { readerFromFixture } from './mock-rpc.js';
import { analyzeStorage } from '../src/optimizer.js';
import { coverageIssues } from '../src/health.js';
import type { StorageAdviceContext } from '../src/optimizer.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const fixturePath = new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url)
  .pathname;
const fixture = JSON.parse(readFileSync(fixturePath, 'utf8'));
async function scan(): Promise<ScanResult> {
  return scanContract(
    readerFromFixture(fixturePath),
    { id: A },
    fixture.result.entries.slice(2).map((e: { key: string }) => e.key),
  );
}
const settings = { minTemporaryTtl: 720, minPersistentTtl: 120960, observedAtLedger: 4519665 };
describe('basic storage advice', () => {
  it('retains code advice for advisory sharing issues but suppresses real read failures', async () => {
    const s = await scan();
    const key = Object.keys(s.entries).find((k) => s.entries[k]?.kind === 'code')!;
    const advisory = { ...s, issues: coverageIssues(s) };
    const report = analyzeStorage(advisory, {});
    expect(report.findings.find((f) => f.entryKey === key)?.code).toBe('shared-code-dependency');
    expect(report.limitations.join(' ')).not.toContain('missing or unreadable');
    const failed = {
      ...advisory,
      issues: [
        ...advisory.issues,
        { kind: 'rpc-error' as const, contracts: [A], entryKey: key, message: 'unreadable' },
      ],
    };
    expect(analyzeStorage(failed, {}).findings.some((f) => f.entryKey === key)).toBe(false);
  });
  it('sanitizes malformed quote maps and null optional settings', async () => {
    const s = await scan();
    for (const quote of [
      { pricedAtLedger: 4519665, additionalLedgers: 1000 },
      { pricedAtLedger: 4519665, additionalLedgers: 1000, rentByEntry: null },
    ]) {
      const r = analyzeStorage(s, { settings: null, quote } as unknown as StorageAdviceContext);
      expect(r.context.settings).toBeUndefined();
      expect(r.context.quote).toBeUndefined();
      expect(r.findings.every((f) => f.currentRent.status === 'unavailable')).toBe(true);
    }
  });
  it('rejects stale, malformed and negative quote amounts without manufacturing savings', async () => {
    const s = await scan();
    const key = Object.keys(s.entries).find((k) => s.entries[k]?.kind === 'persistent')!;
    for (const amount of ['-1', '1.5', 'NaN', 123]) {
      const r = analyzeStorage(s, {
        quote: { rentByEntry: { [key]: amount }, pricedAtLedger: 4519665, additionalLedgers: 1000 },
      } as unknown as StorageAdviceContext);
      expect(r.findings.find((f) => f.entryKey === key)?.currentRent).toEqual({
        status: 'unavailable',
      });
      expect(r.context.quote?.rentByEntry).toEqual({});
    }
    expect(
      analyzeStorage(s, {
        quote: { rentByEntry: { [key]: '100' }, pricedAtLedger: 0, additionalLedgers: 1000 },
      }).findings.find((f) => f.entryKey === key)?.currentRent,
    ).toEqual({ status: 'unavailable' });
  });
  it('advises on data durability and code dependencies, never instance migration', async () => {
    const s = await scan();
    const copy = JSON.stringify(s);
    const r = analyzeStorage(s, { settings });
    expect(r.findings.map((f) => f.code).sort()).toEqual([
      'durability-review',
      'shared-code-dependency',
      'temporary-retention',
    ]);
    expect(r.scope).toBe('observed-keys-only');
    expect(JSON.stringify(s)).toBe(copy);
    expect(r.findings.find((f) => f.code === 'durability-review')?.action).toContain('Only if');
    expect(r.findings.find((f) => f.code === 'temporary-retention')?.ttl).toMatchObject({
      remainingLedgers: 688,
    });
  });
  it('reports one code finding with unique known consumers, never global exclusivity', async () => {
    const s = await scan();
    const code = Object.keys(s.entries).find((k) => s.entries[k]?.kind === 'code')!;
    const shared = {
      ...s,
      entries: { ...s.entries, [code]: { ...s.entries[code]!, contracts: [A, 'another', A] } },
    };
    const r = analyzeStorage(shared, {});
    const f = r.findings.filter((f) => f.code === 'shared-code-dependency');
    expect(f).toHaveLength(1);
    expect(f[0]?.knownConsumers).toEqual([A, 'another']);
    expect(f[0]?.rationale).toContain('outside this scan');
  });
  it('keeps historical benchmark prices separate from absent, zero and large current quotes', async () => {
    const s = await scan();
    const key = Object.keys(s.entries).find((k) => s.entries[k]?.kind === 'persistent')!;
    expect(analyzeStorage(s, {}).findings.find((f) => f.entryKey === key)?.currentRent).toEqual({
      status: 'unavailable',
    });
    for (const amount of ['0', '9007199254740993'] as const) {
      const r = analyzeStorage(s, {
        quote: { rentByEntry: { [key]: amount }, pricedAtLedger: 4519665, additionalLedgers: 1000 },
      });
      expect(r.findings.find((f) => f.entryKey === key)?.currentRent).toEqual({
        status: 'quoted',
        stroops: amount,
      });
      expect(r.evidence.rent.persistent.rentStroops).toBe('103849');
    }
  });
  it('qualifies missing and invalid settings instead of reporting zero minima', async () => {
    const s = await scan();
    for (const value of [
      undefined,
      { ...settings, minTemporaryTtl: 0 },
      { ...settings, observedAtLedger: NaN },
    ]) {
      const r = analyzeStorage(s, value ? { settings: value } : {});
      expect(r.context.settings).toBeUndefined();
      expect(r.limitations.join(' ')).toContain('Historical');
    }
  });
  it('does not turn unreadable entries into fabricated retention facts', async () => {
    const s = await scan();
    const unknown = {
      ...s,
      entries: Object.fromEntries(
        Object.entries(s.entries).map(([k, e]) => [
          k,
          { ...e, ttl: { status: 'unavailable' as const } },
        ]),
      ),
    };
    const r = analyzeStorage(unknown, {});
    expect(r.findings).toEqual([]);
    expect(r.limitations.join(' ')).toContain('unreadable');
    expect(analyzeStorage({ ...s, entries: {} }, {}).findings).toEqual([]);
  });
  it('uses extended observed TTL rather than claiming expiry from minimum lifetime', async () => {
    const s = await scan();
    const key = Object.keys(s.entries).find((k) => s.entries[k]?.kind === 'temporary')!;
    const entry = s.entries[key]!;
    const r = analyzeStorage(
      {
        ...s,
        entries: {
          ...s.entries,
          [key]: {
            ...entry,
            ttl: {
              status: 'known',
              remainingLedgers: 500000,
              endsAtLedger: entry.observedAtLedger + 500000,
            },
          },
        },
      },
      { settings },
    );
    expect(r.findings.find((f) => f.entryKey === key)?.ttl).toMatchObject({
      remainingLedgers: 500000,
    });
    expect(r.findings.find((f) => f.entryKey === key)?.action).not.toContain('hour');
  });
});
