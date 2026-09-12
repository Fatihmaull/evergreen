import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import type { EvergreenConfig, LedgerEntryTTL, ScanResult } from '@evergreen-stellar/shared-types';
import { decideBumps, runEngine } from '../src/engine.js';
import { codeKey, instanceKey } from '../src/rpc.js';
import { STATE_ARCHIVAL_CONFIG_KEY, parseStateArchivalSettings } from '../src/network-config.js';
import { createMockReader } from './mock-rpc.js';
import { loadConfig } from '../src/config.js';
import { assertLiveness } from '../src/liveness.js';
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const D = StrKey.encodeContract(Buffer.alloc(32, 7));
const code = codeKey(new Uint8Array(32).fill(6));
const settingsFixture = JSON.parse(
  readFileSync(
    new URL('./fixtures/state-archival-settings-2026-09-05.json', import.meta.url),
    'utf8',
  ),
) as { result: { latestLedger: number; entries: { key: string; xdr: string }[] } };
const settingsEntry = settingsFixture.result.entries[0]!;
const ceiling = parseStateArchivalSettings(
  settingsEntry.xdr,
  settingsFixture.result.latestLedger,
).maxEntryTtl;
function config(ids = [A]): EvergreenConfig {
  return {
    network: {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    defaults: { bumpWhenRemainingLedgersBelow: 17280, extendToLedgers: 518400 },
    contracts: ids.map((id) => ({ id, payer: id === A ? 'payer-a' : 'payer-d' })),
    payers: {
      'payer-a': { signer: 'ed25519', secretEnvVar: 'UNREAD_A' },
      'payer-d': { signer: 'ed25519', secretEnvVar: 'UNREAD_D' },
    },
  };
}
function scan(
  remaining: number,
  consumers = [A],
  kind: 'instance' | 'code' = 'instance',
): ScanResult {
  const entry: LedgerEntryTTL = {
    kind,
    endBehavior: 'archived',
    contracts: consumers,
    observedAtLedger: 1000000,
    ttl: { status: 'known', endsAtLedger: 1000000 + remaining, remainingLedgers: remaining },
  };
  return {
    network: 'testnet',
    contracts: consumers.map((id) => ({ id })),
    entries: { [kind === 'instance' ? instanceKey(A) : code]: entry },
    issues: [],
  };
}
function reader(includeSettings = true) {
  const fixture = JSON.parse(
    readFileSync(new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url), 'utf8'),
  ) as { result: { latestLedger: number; entries: { key: string; xdr: string }[] } };
  const at = fixture.result.latestLedger;
  const base = createMockReader(at, [
    ...fixture.result.entries.map((e) => ({
      key: e.key,
      entryXdr: e.xdr,
      liveUntilLedgerSeq: at + 1000,
    })),
    ...(includeSettings
      ? [{ key: settingsEntry.key, entryXdr: settingsEntry.xdr, liveUntilLedgerSeq: undefined }]
      : []),
  ]);
  return { read: vi.fn(base.read) };
}
function overrideConfig(action: number, fallback: number): EvergreenConfig {
  const base = config();
  return {
    ...base,
    defaults: { ...base.defaults, bumpWhenRemainingLedgersBelow: fallback },
    contracts: [{ id: A, payer: 'payer-a', thresholds: { bumpWhenRemainingLedgersBelow: action } }],
  };
}
describe('engine correction — configured targets and entry lifecycle', () => {
  it('preserves a configured remaining-TTL target rather than treating it as an increment', () => {
    const [d] = decideBumps(scan(17280), config(), ceiling);
    expect(d?.action).toBe('extend');
    expect(d?.action === 'extend' && d.extendToLedgers).toBe(518400);
  });
  it('caps the target at the recorded network ceiling minus the current ledger', () => {
    const cfg = config();
    const [d] = decideBumps(
      scan(100),
      { ...cfg, defaults: { ...cfg.defaults, extendToLedgers: 4000000 } },
      ceiling,
    );
    expect(d).toMatchObject({ action: 'extend', extendToLedgers: 3110399 });
    expect(d?.reason).toMatch(/cap/i);
  });
  it.each([undefined, 0, -1, Number.MAX_SAFE_INTEGER, 1.5])(
    'does not invent an executable target without a valid network ceiling (%s)',
    (max) => {
      expect(decideBumps(scan(100), config(), max)[0]?.action).toBe('skip');
    },
  );
  it.each([100, 1000, 17000])(
    'refuses a target that cannot clear the action threshold (%s)',
    (target) => {
      const cfg = config();
      const [d] = decideBumps(
        scan(1000),
        { ...cfg, defaults: { ...cfg.defaults, extendToLedgers: target } },
        ceiling,
      );
      expect(d?.action).toBe('skip');
    },
  );
  it('refuses when capping would leave the entry at its action threshold', () => {
    const [d] = decideBumps(scan(0), config(), 17281);
    expect(d?.action).toBe('skip');
  });
  it('does not propose extending an expired instance', () => {
    expect(decideBumps(scan(-1), config(), ceiling)[0]?.action).toBe('skip');
  });
  it('still permits a live entry at zero', () => {
    expect(decideBumps(scan(0), config(), ceiling)[0]).toMatchObject({
      action: 'extend',
      extendToLedgers: 518400,
    });
  });
});
describe('engine correction — shared policy must not depend on consumer order', () => {
  it.each([
    [A, D],
    [D, A],
  ])('does not elect a payer for consumer order %j', (...consumers) => {
    const [d] = decideBumps(scan(100, consumers, 'code'), config([A, D]), ceiling);
    expect(d?.action).toBe('skip');
    expect(d?.reason).toMatch(/payer/i);
  });
  it('permits one shared-key decision when every consumer agrees on payer and target', () => {
    const cfg = config([A, D]);
    const decisions = decideBumps(
      scan(100, [A, D], 'code'),
      { ...cfg, contracts: cfg.contracts.map((c) => ({ ...c, payer: 'payer-a' })) },
      ceiling,
    );
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      action: 'extend',
      entryKey: code,
      contracts: [A, D],
      payer: 'payer-a',
      extendToLedgers: 518400,
    });
  });
  it('refuses different targets even when the payer agrees', () => {
    const cfg = config();
    const [d] = decideBumps(
      scan(100, [A, D], 'code'),
      {
        ...cfg,
        contracts: [
          ...cfg.contracts,
          { id: D, payer: 'payer-a', thresholds: { extendToLedgers: 600000 } },
        ],
      },
      ceiling,
    );
    expect(d?.action).toBe('skip');
    expect(d?.reason).toMatch(/target/i);
  });
  it('does not drop a consumer whose payer policy is missing', () => {
    expect(decideBumps(scan(100, [A, D], 'code'), config(), ceiling)[0]?.action).toBe('skip');
  });
  it('does not accept a payer reference missing from the payer registry', () => {
    expect(decideBumps(scan(100), { ...config(), payers: {} }, ceiling)[0]?.action).toBe('skip');
  });
  it.each([
    [A, D],
    [D, A],
  ])('acts when any consumer reaches its threshold, in order %j', (...consumers) => {
    const cfg = overrideConfig(100, 100);
    const [d] = decideBumps(
      scan(1000, consumers, 'code'),
      {
        ...cfg,
        contracts: [
          ...cfg.contracts,
          { id: D, payer: 'payer-a', thresholds: { bumpWhenRemainingLedgersBelow: 1000 } },
        ],
      },
      ceiling,
    );
    expect(d?.action).toBe('extend');
  });
});
describe('runEngine — decisions and liveness resolve the same policy', () => {
  it('alarms when an override needs action but the decision-only run does not act', async () => {
    const rpc = reader();
    const run = await runEngine(rpc, overrideConfig(2000, 100));
    expect(run.decisions.find((d) => d.entryKey === instanceKey(A))).toMatchObject({
      action: 'extend',
      extendToLedgers: 518400,
    });
    expect(run.liveness.isAlarm).toBe(true);
    expect(
      rpc.read.mock.calls.filter(([keys]) => keys.includes(STATE_ARCHIVAL_CONFIG_KEY)),
    ).toHaveLength(1);
  });
  it('does not falsely alarm when the explicit override is lower than the global threshold', async () => {
    const run = await runEngine(reader(), overrideConfig(100, 2000));
    expect(run.decisions.every((d) => d.action === 'skip')).toBe(true);
    expect(run.liveness.isAlarm).toBe(false);
  });
  it('retains observations but refuses targets when the network settings cannot be read', async () => {
    const run = await runEngine(reader(false), overrideConfig(2000, 100));
    expect(run.scan.entries[instanceKey(A)]?.ttl.status).toBe('known');
    expect(run.decisions.every((d) => d.action === 'skip')).toBe(true);
    expect(run.liveness.isAlarm).toBe(true);
    expect(run.scan.issues.some((i) => i.message.includes('state-archival'))).toBe(true);
  });
});

describe('internal review — repeated registrations and expired temporary guidance', () => {
  it.each([false, true])(
    'refuses repeated-contract payer conflicts in either order (%s)',
    async (reverse) => {
      const base = config();
      const registrations = [
        { id: A, payer: 'payer-a' },
        { id: A, payer: 'payer-d' },
      ];
      const { config: parsed } = loadConfig(
        JSON.stringify({
          ...base,
          contracts: reverse ? registrations.reverse() : registrations,
        }),
      );
      const run = await runEngine(reader(), parsed);
      const decision = run.decisions.find((d) => d.entryKey === instanceKey(A));
      expect(decision?.action).toBe('skip');
      expect(decision?.reason).toMatch(/payer/);
    },
  );
  it('refuses repeated-contract target conflicts instead of choosing the last row', () => {
    const base = config();
    const cfg = {
      ...base,
      contracts: [
        base.contracts[0]!,
        { ...base.contracts[0]!, thresholds: { extendToLedgers: 600000 } },
      ],
    };
    const [decision] = decideBumps(scan(1000), cfg, ceiling);
    expect(decision?.action).toBe('skip');
    expect(decision?.reason).toMatch(/target/);
  });
  it('retains every repeated registration threshold in decision and liveness', async () => {
    const base = config();
    const cfg = {
      ...base,
      defaults: { ...base.defaults, bumpWhenRemainingLedgersBelow: 100 },
      contracts: [
        { id: A, payer: 'payer-a', thresholds: { bumpWhenRemainingLedgersBelow: 2000 } },
        { id: A, payer: 'payer-a', thresholds: { bumpWhenRemainingLedgersBelow: 100 } },
      ],
    };
    const run = await runEngine(reader(), cfg);
    expect(run.decisions.find((d) => d.entryKey === instanceKey(A))?.action).toBe('extend');
    expect(run.liveness.isAlarm).toBe(true);
  });
  it('keeps consistent repeated registrations usable without duplicate decisions', async () => {
    const base = config();
    const run = await runEngine(reader(), {
      ...base,
      contracts: [base.contracts[0]!, base.contracts[0]!],
    });
    const decisions = run.decisions.filter((d) => d.entryKey === instanceKey(A));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]).toMatchObject({
      action: 'extend',
      payer: 'payer-a',
      extendToLedgers: 518400,
    });
  });
  it('does not recommend restoring temporary data that has been deleted', () => {
    const base = scan(-1);
    const key = instanceKey(A);
    const temporary: ScanResult = {
      ...base,
      entries: {
        [key]: {
          ...base.entries[key]!,
          kind: 'temporary',
          endBehavior: 'deleted',
        },
      },
    };
    const decisions = decideBumps(temporary, config(), ceiling);
    expect(decisions[0]?.action).toBe('skip');
    const verdict = assertLiveness({
      scan: temporary,
      thresholds: config().defaults,
      records: [],
      decisions,
    });
    expect(verdict.findings[0]?.remediation).toBe('investigate');
    expect(verdict.findings[0]?.detail).not.toContain('RestoreFootprintOp');
    expect(verdict.findings[0]?.detail).toMatch(/cannot be restored/);
  });
});
