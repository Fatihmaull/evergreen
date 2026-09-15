import { readFileSync } from 'node:fs';
import { xdr } from '@stellar/stellar-sdk';
import { describe, it, expect } from 'vitest';
import type { EvergreenConfig, BumpDecision } from '@evergreen-stellar/shared-types';
import { loadConfig } from '../src/config.js';
import { temporaryConsent } from '../src/temporary-policy.js';
import { scanContract } from '../src/scan-contract.js';
import { createMockReader } from './mock-rpc.js';
import { decideBumps } from '../src/engine.js';
import { planEngineExecution } from '../src/engine-execution-plan.js';
import { assertLiveness } from '../src/liveness.js';
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const raw = JSON.parse(
  readFileSync(new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url), 'utf8'),
).result;
const key: string = raw.entries[3].key;
const persistent: string = raw.entries[2].key;
const config: EvergreenConfig = {
  network: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  defaults: { bumpWhenRemainingLedgersBelow: 100, extendToLedgers: 1000 },
  contracts: [{ id: A, payer: 'p', dataKeys: [key, persistent] }],
  payers: { p: { signer: 'ed25519', secretEnvVar: 'UNREAD' } },
};
const opted = (value = true): EvergreenConfig => ({
  ...config,
  contracts: [
    { ...config.contracts[0]!, temporaryEntryPolicies: [{ entryKey: key, autoExtend: value }] },
  ],
});
async function scan(remaining = 50) {
  return scanContract(
    createMockReader(
      1000,
      raw.entries.map((e: { key: string; xdr: string }) => ({
        key: e.key,
        entryXdr: e.xdr,
        liveUntilLedgerSeq: 1000 + remaining,
      })),
    ),
    { id: A },
    [key, persistent],
  );
}
const decision: BumpDecision = {
  action: 'extend',
  entryKey: key,
  contracts: [A],
  payer: 'p',
  extendToLedgers: 1000,
  reason: 'forged',
};
describe('temporary retention consent', () => {
  it('round trips explicit consent but defaults each other key off', () => {
    const c = loadConfig(JSON.stringify(opted())).config;
    expect(temporaryConsent(c, key, A).allowed).toBe(true);
    expect(temporaryConsent(config, key, A).allowed).toBe(false);
    expect(temporaryConsent(opted(false), key, A).allowed).toBe(false);
    expect(temporaryConsent(c, persistent, A).allowed).toBe(false);
  });
  it.each([null, 'true', 1])('rejects non-boolean consent %s', (autoExtend) => {
    const c = opted();
    const input = {
      ...c,
      contracts: [{ ...c.contracts[0], temporaryEntryPolicies: [{ entryKey: key, autoExtend }] }],
    };
    expect(() => loadConfig(JSON.stringify(input))).toThrow(/temporaryEntryPolicies/);
  });
  it('rejects undeclared, wrong-kind, wrong-owner and duplicate keys', () => {
    for (const row of [
      { ...opted().contracts[0], dataKeys: [] },
      {
        ...opted().contracts[0],
        temporaryEntryPolicies: [{ entryKey: persistent, autoExtend: true }],
      },
      { ...opted().contracts[0], id: 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ' },
      {
        ...opted().contracts[0],
        temporaryEntryPolicies: [
          { entryKey: key, autoExtend: true },
          { entryKey: key, autoExtend: true },
        ],
      },
    ])
      expect(() => loadConfig(JSON.stringify({ ...config, contracts: [row] }))).toThrow(
        /temporaryEntryPolicies/,
      );
  });
  it('does not inherit consent when another temporary key is declared', () => {
    const original = xdr.LedgerKey.fromXDR(key, 'base64');
    if (original.type !== 'contractData') throw new Error('fixture');
    const other = xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        ...original.contractData,
        key: xdr.ScVal.scvSymbol('OtherTemporary'),
      }),
    ).toXDR('base64');
    const c = opted();
    const expanded = { ...c, contracts: [{ ...c.contracts[0]!, dataKeys: [key, other] }] };
    expect(temporaryConsent(expanded, key, A).allowed).toBe(true);
    expect(temporaryConsent(expanded, other, A).allowed).toBe(false);
  });
  it('vetoes silent/false duplicate registration in either order', () => {
    for (const other of [config.contracts[0]!, opted(false).contracts[0]!])
      for (const rows of [
        [opted().contracts[0]!, other],
        [other, opted().contracts[0]!],
      ])
        expect(temporaryConsent({ ...config, contracts: rows }, key, A).allowed).toBe(false);
  });
  it('default-off skips planning and rejects a forged execution decision', async () => {
    const s = await scan();
    expect(decideBumps(s, config, 10000).find((d) => d.entryKey === key)).toMatchObject({
      action: 'skip',
      reason: expect.stringContaining('Temporary'),
    });
    expect(planEngineExecution(s, [decision], config).entries).toEqual([]);
    expect(
      assertLiveness({ scan: s, thresholds: config.defaults, records: [], decisions: [], config })
        .isAlarm,
    ).toBe(true);
  });
  it('allows consent at TTL zero, but never after expiry', async () => {
    const c = opted();
    const s = await scan(0);
    expect(decideBumps(s, c, 10000).find((d) => d.entryKey === key)?.action).toBe('extend');
    expect(planEngineExecution(s, [decision], c).entries[0]?.entry.kind).toBe('temporary');
    const expired = await scan(-1);
    expect(() => planEngineExecution(expired, [decision], c)).toThrow(/valid live state/);
  });
  it('escalates opted-in temporary preview, preserving persistent severity', async () => {
    const s = await scan();
    const records: never[] = [];
    const decisions: BumpDecision[] = [{ ...decision, action: 'skip', reason: 'policy test' }];
    const result = assertLiveness({
      scan: s,
      thresholds: config.defaults,
      records,
      decisions,
      config: opted(),
    });
    expect(result.findings.find((f) => f.entryKey === key)).toMatchObject({
      severity: 'critical',
      temporaryRetention: true,
    });
  });
  /**
   * The escalation, tested where it is the ONLY thing that could produce
   * `critical`.
   *
   * The case above reaches `assertLiveness` with reason `skipped`, and
   * `SEVERITY.skipped` is already `critical` — so it asserts a value that is true
   * whether or not the retention override exists. Confirmed by deleting the
   * override: that test stays green. It reads as a check on the escalation and
   * is not one.
   *
   * Only two reasons have a non-critical base — `dry-run-only` (info) and
   * `submitted-unconfirmed` (warn) — so those are the only places the override
   * can be observed. A dry run is the realistic one: an opted-in temporary entry
   * running out during preview is exactly the case Fatih's ruling is about, and
   * downgrading it to `info` would bury the one finding that has no restore
   * behind it.
   */
  it('🔴 escalates a dry-run finding that would otherwise be info', async () => {
    const s2 = await scan();
    const simulated = {
      entryKey: key,
      contracts: [A],
      payer: 'p',
      reason: 'preview',
      extendToLedgers: 1000,
      recordedAt: '2026-09-15T00:00:00.000Z',
      before: { observedAtLedger: 1000, endsAtLedger: 1050 },
      mode: 'dry-run' as const,
      outcome: 'simulated' as const,
    };
    const base = assertLiveness({
      scan: s2,
      thresholds: config.defaults,
      records: [simulated],
      decisions: [decision],
      config,
    }).findings.find((f) => f.entryKey === key);
    const escalated = assertLiveness({
      scan: s2,
      thresholds: config.defaults,
      records: [simulated],
      decisions: [decision],
      config: opted(),
    }).findings.find((f) => f.entryKey === key);

    // Same scan, same record — only consent differs.
    expect(base?.reason).toBe('dry-run-only');
    expect(base?.severity).toBe('info');
    expect(base?.temporaryRetention).toBeUndefined();

    expect(escalated?.reason).toBe('dry-run-only');
    expect(escalated?.severity).toBe('critical');
    expect(escalated?.temporaryRetention).toBe(true);
    expect(escalated?.detail).toContain('no restore is possible');
  });
});
