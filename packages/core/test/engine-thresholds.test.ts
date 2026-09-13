import { readFileSync } from 'node:fs';
import { Address, xdr } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import type { EvergreenConfig } from '@evergreen-stellar/shared-types';
import { runEngine } from '../src/engine.js';
import { instanceKey } from '../src/rpc.js';
import { createMockReader } from './mock-rpc.js';
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url), 'utf8'),
) as { result: { latestLedger: number; entries: { key: string; xdr: string }[] } };
const settings = JSON.parse(
  readFileSync(
    new URL('./fixtures/state-archival-settings-2026-09-05.json', import.meta.url),
    'utf8',
  ),
) as { result: { entries: { key: string; xdr: string }[] } };
const code = fixture.result.entries[1]!.key;
const temporary = fixture.result.entries[3]!.key;
function reader(remaining: number, shared = false) {
  const at = fixture.result.latestLedger;
  const rows = fixture.result.entries.map((e) => ({
    key: e.key,
    entryXdr: e.xdr,
    liveUntilLedgerSeq: at + remaining,
  }));
  if (shared) {
    // Synthetic B instance using A's Wasm. Not a live B observation.
    const value = xdr.LedgerEntryData.fromXDR(rows[0]!.entryXdr, 'base64');
    if (value.type !== 'contractData') throw new Error('Expected instance fixture');
    const fields = { ...value.contractData, contract: new Address(B).toScAddress() };
    rows.push({
      key: instanceKey(B),
      entryXdr: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry(fields)).toXDR('base64'),
      liveUntilLedgerSeq: at + remaining,
    });
  }
  return createMockReader(at, [
    ...rows,
    ...settings.result.entries.map((e) => ({
      key: e.key,
      entryXdr: e.xdr,
      liveUntilLedgerSeq: undefined,
    })),
  ]);
}
function config(): EvergreenConfig {
  return {
    network: {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    defaults: { bumpWhenRemainingLedgersBelow: 17280, extendToLedgers: 518400 },
    contracts: [{ id: A, payer: 'payer' }],
    payers: { payer: { signer: 'ed25519', secretEnvVar: 'UNREAD_SECRET' } },
  };
}
describe('runEngine — visible warning without premature action', () => {
  it.each([50000, 120960, 17281])(
    'reports warning-only remaining %s without bump or alarm',
    async (remaining) => {
      const run = await runEngine(reader(remaining), config());
      expect(run.health.byEntry[instanceKey(A)]).toMatchObject({
        health: 'warning',
        needsAction: false,
      });
      expect(run.health.thresholdsByEntry[instanceKey(A)]).toEqual({
        warnBelowLedgers: 120960,
        criticalBelowLedgers: 17280,
      });
      expect(run.decisions.every((d) => d.action === 'skip')).toBe(true);
      expect(run.liveness.isAlarm).toBe(false);
      expect(JSON.parse(JSON.stringify(run))).toEqual(run);
    },
  );
  it('uses action, not warning, for candidate targets and liveness', async () => {
    const run = await runEngine(reader(17280), config());
    expect(run.health.byEntry[instanceKey(A)]).toMatchObject({
      health: 'critical',
      needsAction: true,
    });
    expect(run.decisions.find((d) => d.entryKey === instanceKey(A))).toMatchObject({
      action: 'extend',
      extendToLedgers: 518400,
    });
    expect(run.liveness.isAlarm).toBe(true);
  });
  it('changing only warning affects assessment, not decisions or liveness', async () => {
    const base = config();
    const before = await runEngine(reader(50000), {
      ...base,
      defaults: { ...base.defaults, warnBelowLedgers: 60000 },
    });
    const after = await runEngine(reader(50000), {
      ...base,
      defaults: { ...base.defaults, warnBelowLedgers: 40000 },
    });
    expect(before.health.byEntry[instanceKey(A)]?.health).toBe('warning');
    expect(after.health.byEntry[instanceKey(A)]?.health).toBe('healthy');
    expect(before.decisions.map((d) => d.action)).toEqual(after.decisions.map((d) => d.action));
    expect(before.liveness).toEqual(after.liveness);
  });
  it('keeps temporary warning impact critical without extending it', async () => {
    const base = config();
    const run = await runEngine(reader(50000), {
      ...base,
      contracts: [{ ...base.contracts[0]!, dataKeys: [temporary] }],
    });
    expect(run.scan.entries[temporary]?.kind).toBe('temporary');
    expect(run.health.byEntry[temporary]).toMatchObject({ health: 'critical', needsAction: false });
    expect(run.decisions.find((d) => d.entryKey === temporary)?.action).toBe('skip');
    expect(run.liveness.isAlarm).toBe(false);
  });
  it('keeps shared warning impact critical without extending it', async () => {
    const base = config();
    const run = await runEngine(reader(50000, true), {
      ...base,
      contracts: [...base.contracts, { id: B, payer: 'payer' }],
    });
    expect(run.health.byEntry[code]).toMatchObject({
      health: 'critical',
      needsAction: false,
      observedContractCount: 2,
    });
    expect(run.decisions.find((d) => d.entryKey === code)?.action).toBe('skip');
    expect(run.liveness.isAlarm).toBe(false);
  });
  it.each([false, true])(
    'aggregates both horizons across repeated rows in either order (%s)',
    async (reverse) => {
      const base = config();
      const contracts = [
        {
          id: A,
          payer: 'payer',
          thresholds: { warnBelowLedgers: 60480, bumpWhenRemainingLedgersBelow: 1000 },
        },
        {
          id: A,
          payer: 'payer',
          thresholds: { warnBelowLedgers: 120960, bumpWhenRemainingLedgersBelow: 100 },
        },
      ];
      const run = await runEngine(reader(1000), {
        ...base,
        contracts: reverse ? contracts.reverse() : contracts,
      });
      expect(run.health.thresholdsByEntry[instanceKey(A)]).toEqual({
        warnBelowLedgers: 120960,
        criticalBelowLedgers: 1000,
      });
      expect(run.decisions.filter((d) => d.entryKey === instanceKey(A))).toHaveLength(1);
      expect(run.decisions.find((d) => d.entryKey === instanceKey(A))?.action).toBe('extend');
      expect(run.liveness.isAlarm).toBe(true);
    },
  );
});

describe('D15-02 review — combined policy boundaries', () => {
  it.each([false, true])(
    'combines independent consumer horizons without changing guard/action behavior (%s)',
    async (reverse) => {
      const base = config();
      const contracts = [
        {
          id: A,
          payer: 'payer',
          thresholds: { warnBelowLedgers: 300000, bumpWhenRemainingLedgersBelow: 1000 },
        },
        {
          id: B,
          payer: 'payer',
          thresholds: { warnBelowLedgers: 60480, bumpWhenRemainingLedgersBelow: 2000 },
        },
      ];
      const cfg = { ...base, contracts: reverse ? contracts.reverse() : contracts };
      const early = await runEngine(reader(50000, true), cfg);
      expect(early.health.thresholdsByEntry[code]).toEqual({
        warnBelowLedgers: 300000,
        criticalBelowLedgers: 2000,
      });
      expect(early.health.byEntry[code]).toMatchObject({ health: 'critical', needsAction: false });
      expect(early.decisions.every((d) => d.action === 'skip')).toBe(true);
      expect(early.liveness.isAlarm).toBe(false);
      const due = await runEngine(reader(2000, true), cfg);
      expect(due.health.byEntry[code]?.needsAction).toBe(true);
      expect(due.decisions.find((d) => d.entryKey === code)).toMatchObject({
        action: 'skip',
        reason: expect.stringContaining('REFUSED BY WRITE GUARD'),
      });
      expect(due.liveness.findings.some((f) => f.entryKey === code)).toBe(true);
    },
  );
  it('keeps a legacy high action override usable with a derived warning and exact target', async () => {
    const base = config();
    const run = await runEngine(reader(1300000), {
      ...base,
      contracts: [
        {
          ...base.contracts[0]!,
          thresholds: { bumpWhenRemainingLedgersBelow: 1500000, extendToLedgers: 2000000 },
        },
      ],
    });
    expect(run.health.thresholdsByEntry[instanceKey(A)]).toEqual({
      warnBelowLedgers: 1500000,
      criticalBelowLedgers: 1500000,
    });
    expect(run.decisions.find((d) => d.entryKey === instanceKey(A))).toMatchObject({
      action: 'extend',
      extendToLedgers: 2000000,
    });
    expect(run.liveness.isAlarm).toBe(true);
  });
  it('keeps explicit zero horizons in both assessment and liveness through the last live ledger', async () => {
    const base = config();
    const cfg = {
      ...base,
      contracts: [
        {
          ...base.contracts[0]!,
          thresholds: { warnBelowLedgers: 0, bumpWhenRemainingLedgersBelow: 0 },
        },
      ],
    };
    const before = await runEngine(reader(1), cfg);
    expect(before.health.thresholdsByEntry[instanceKey(A)]).toEqual({
      warnBelowLedgers: 0,
      criticalBelowLedgers: 0,
    });
    expect(before.health.byEntry[instanceKey(A)]).toMatchObject({
      health: 'healthy',
      needsAction: false,
    });
    expect(before.liveness.isAlarm).toBe(false);
    const finalLive = await runEngine(reader(0), cfg);
    expect(finalLive.health.byEntry[instanceKey(A)]).toMatchObject({
      health: 'critical',
      needsAction: true,
      isExpired: false,
    });
    expect(finalLive.decisions.find((d) => d.entryKey === instanceKey(A))?.action).toBe('extend');
    expect(finalLive.liveness.isAlarm).toBe(true);
  });
});
