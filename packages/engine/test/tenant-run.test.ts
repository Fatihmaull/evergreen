import { describe, expect, it } from 'vitest';
import type { LedgerEntryReader } from '@evergreen-stellar/core';
import type { BumpDecision, EvergreenConfig } from '@evergreen-stellar/shared-types';
import { planTenants } from '../src/tenants.js';
import type { TenantPlan } from '../src/tenants.js';
import { MemoryTenantJournal } from '../src/tenant-journal.js';
import type { TenantJournal } from '../src/tenant-journal.js';
import { runTenantPlan, tenantConfigs, TESTNET_PASSPHRASE } from '../src/tenant-run.js';
import type { TenantRunDeps } from '../src/tenant-run.js';
import { C, G, U1, U2, row } from './tenant-fixtures.js';

const reader: LedgerEntryReader = {
  read: async () => ({ latestLedger: 1, entries: [] }),
};

const plans = (): TenantPlan[] =>
  planTenants(
    [
      row({ payerAccount: G('A') }),
      row({ payerAccount: G('B'), contractId: C('B'), userId: U2 }),
      row({ payerAccount: G('C'), contractId: C('C') }),
    ],
    new Map(),
  );

type Engine = NonNullable<TenantRunDeps['engine']>;
const decision = (contract: string): BumpDecision => ({
  entryKey: `k-${contract}`,
  contracts: [contract],
  reason: 'test',
  action: 'skip',
});
const okEngine: Engine = async (_r, config) =>
  ({ decisions: config.contracts.map((c) => decision(c.id)) }) as unknown as Awaited<
    ReturnType<Engine>
  >;

function deps(over: Partial<TenantRunDeps> = {}): TenantRunDeps {
  return { reader, runId: 'r1', engine: okEngine, ...over };
}

describe('tenantConfigs', () => {
  it('is testnet, dry-run, one policy payer with no secret, only this tenant’s contracts', () => {
    const [a] = plans();
    const configs = tenantConfigs(a!);
    expect(configs).toHaveLength(1);
    const cfg = configs[0]!;
    expect(cfg.network.networkPassphrase).toBe(TESTNET_PASSPHRASE);
    expect(cfg.network.networkPassphrase).toBe('Test SDF Network ; September 2015');
    expect(cfg.mode).toBe('dry-run');
    expect(Object.keys(cfg.payers)).toEqual(['tenant']);
    expect(cfg.payers.tenant).toEqual({ signer: 'policy', signerRef: `hosted:${G('A')}` });
    expect(JSON.stringify(cfg)).not.toMatch(/secret/i);
    expect(cfg.contracts.map((c) => c.id)).toEqual([C('A')]);
    expect(cfg.contracts[0]).toMatchObject({
      payer: 'tenant',
      noDataKeys: true,
      thresholds: { bumpWhenRemainingLedgersBelow: 1000, extendToLedgers: 5000 },
    });
  });

  it('splits the same contract from two users of one payer into separate configs', () => {
    const [p] = planTenants(
      [row(), row({ userId: U2, thresholdLedgers: 2000n, extendToLedgers: 9000n })],
      new Map(),
    );
    const configs = tenantConfigs(p!);
    expect(configs).toHaveLength(2);
    expect(
      configs.map((c) => c.contracts[0]!.thresholds!.bumpWhenRemainingLedgersBelow).sort(),
    ).toEqual([1000, 2000]);
  });

  it('maps dataKeys scope and rejects an unknown scope', () => {
    const [p] = planTenants([row({ scope: { dataKeys: ['AAAA'] } })], new Map());
    expect(tenantConfigs(p!)[0]!.contracts[0]).toMatchObject({ dataKeys: ['AAAA'] });
    const [bad] = planTenants([row({ scope: { what: 1 } })], new Map());
    expect(() => tenantConfigs(bad!)).toThrow('TENANT_CONFIG_INVALID');
  });
});

describe('runTenantPlan', () => {
  it('runs every tenant sequentially with its own config', async () => {
    const seen: string[][] = [];
    let active = 0;
    const engine: Engine = async (r, config) => {
      active += 1;
      expect(active).toBe(1);
      seen.push(config.contracts.map((c) => c.id));
      await new Promise((res) => setTimeout(res, 5));
      active -= 1;
      return okEngine(r, config);
    };
    const report = await runTenantPlan(plans(), deps({ engine }));
    expect(seen).toEqual([[C('A')], [C('B')], [C('C')]]);
    expect(report.tenants.map((t) => t.status)).toEqual(['ok', 'ok', 'ok']);
    expect(report.tenants[1]!.decisions.map((d) => d.contracts[0])).toEqual([C('B')]);
  });

  it('isolates a failing tenant and leaks no provider text', async () => {
    const engine: Engine = async (r, config) => {
      if (config.contracts[0]!.id === C('B'))
        throw new Error('boom https://rpc.example/?key=SECRET123');
      return okEngine(r, config);
    };
    const report = await runTenantPlan(plans(), deps({ engine }));
    expect(report.tenants.map((t) => t.status)).toEqual(['ok', 'failed', 'ok']);
    expect(report.tenants[1]!.errorCode).toBe('TENANT_SCAN_FAILED');
    expect(JSON.stringify(report)).not.toMatch(/SECRET123|rpc\.example|boom/);
  });

  it('times out a hung tenant at the per-tenant deadline and continues', async () => {
    const engine: Engine = async (r, config) => {
      if (config.contracts[0]!.id === C('A')) return new Promise(() => undefined);
      return okEngine(r, config);
    };
    const report = await runTenantPlan(plans(), deps({ engine, tenantDeadlineMs: 20 }));
    expect(report.tenants.map((t) => [t.status, t.errorCode])).toEqual([
      ['failed', 'TENANT_TIMEOUT'],
      ['ok', undefined],
      ['ok', undefined],
    ]);
  });

  it('marks a tenant with an invalid config without calling the engine', async () => {
    const [p] = planTenants([row({ scope: null })], new Map());
    let calls = 0;
    const engine: Engine = async (r, c) => {
      calls += 1;
      return okEngine(r, c);
    };
    const report = await runTenantPlan([p!], deps({ engine }));
    expect(calls).toBe(0);
    expect(report.tenants[0]).toMatchObject({
      status: 'failed',
      errorCode: 'TENANT_CONFIG_INVALID',
    });
  });

  it('marks tenants after the run deadline as skipped, not dropped', async () => {
    let t = 0;
    const report = await runTenantPlan(
      plans(),
      deps({
        now: () => t,
        runDeadlineMs: 100,
        engine: async (r, c) => {
          t += 100;
          return okEngine(r, c);
        },
      }),
    );
    expect(report.tenants.map((x) => [x.payerAccount, x.status])).toEqual([
      [G('A'), 'ok'],
      [G('B'), 'skipped'],
      [G('C'), 'skipped'],
    ]);
  });

  it('journals each tenant', async () => {
    const journal = new MemoryTenantJournal();
    await runTenantPlan(plans(), deps({ journal }));
    expect(journal.entries.map((e) => [e.runId, e.payerAccount, e.status])).toEqual([
      ['r1', G('A'), 'ok'],
      ['r1', G('B'), 'ok'],
      ['r1', G('C'), 'ok'],
    ]);
  });

  it('a journal failure becomes a warning and does not abort the run', async () => {
    const journal: TenantJournal = {
      record: async (e) => {
        if (e.payerAccount === G('A')) throw new Error('db down postgres://u:pw@h');
      },
    };
    const report = await runTenantPlan(plans(), deps({ journal }));
    expect(report.tenants).toHaveLength(3);
    expect(report.warnings).toEqual([`TENANT_JOURNAL_FAILED:${G('A')}`]);
    expect(JSON.stringify(report)).not.toContain('pw@');
  });

  it('budget verdict is undetermined without an estimate, computed with one', async () => {
    const plain = await runTenantPlan(plans(), deps());
    expect(plain.tenants[0]!.items).toEqual([
      { userId: U1, contractId: C('A'), budget: 'undetermined' },
    ]);
    const est = await runTenantPlan(plans(), deps({ estimate: () => 150n }));
    expect(est.tenants[0]!.items[0]!.budget).toBe('over-per-job');
  });

  it('with the real core engine and an empty reader, stays dry-run and decides', async () => {
    const [p] = plans();
    const report = await runTenantPlan([p!], { reader, runId: 'r2' });
    expect(report.tenants[0]!.status).toBe('ok');
  });
});

export type { EvergreenConfig };
