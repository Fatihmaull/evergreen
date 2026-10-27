import { describe, expect, it } from 'vitest';
import { checkBudget, isEligible, planTenants, spendKey } from '../src/tenants.js';
import { MemoryTenantStore, planTenantsFromStore } from '../src/tenant-store.js';
import { C, G, U1, U2, row } from './tenant-fixtures.js';

const zero = (...rows: ReturnType<typeof row>[]) =>
  new Map(rows.map((r) => [spendKey(r.userId, r.network, r.contractId), 0n]));

describe('planTenants', () => {
  it('splits the same contract watched by two users with different payers into two groups', () => {
    const a = row({ userId: U1, payerAccount: G('A') });
    const b = row({ userId: U2, payerAccount: G('B') });
    const plan = planTenants([b, a], zero(a, b));
    expect(plan.map((p) => p.payerAccount)).toEqual([G('A'), G('B')]);
    expect(plan.map((p) => p.items.map((i) => i.userId))).toEqual([[U1], [U2]]);
    expect(plan[0]!.network).toBe('testnet');
  });

  it('excludes an item whose payer wallet belongs to another user (ADR-004/ADR-007)', () => {
    const own = row({ userId: U1 });
    const foreign = row({ userId: U2, payerOwnerUserId: U1 });
    const plan = planTenants([foreign, own], zero(own, foreign));
    expect(plan).toHaveLength(1);
    expect(plan[0]!.items.map((i) => i.userId)).toEqual([U1]);
  });

  it('excludes an item whose payer owner is unknown', () => {
    const r = row({ payerOwnerUserId: null });
    expect(planTenants([r], zero(r))).toEqual([]);
  });

  it('the memory store drops items paid from another user’s wallet, like the SQL JOIN', async () => {
    const store = new MemoryTenantStore([row(), row({ userId: U2, payerOwnerUserId: U1 })]);
    expect((await store.listAutopilotItems('testnet')).map((r) => r.userId)).toEqual([U1]);
  });

  it('puts many contracts of one payer in one group, sorted by contract', () => {
    const rows = [
      row({ contractId: C('C') }),
      row({ contractId: C('A') }),
      row({ contractId: C('B') }),
    ];
    const plan = planTenants(rows, zero(...rows));
    expect(plan).toHaveLength(1);
    expect(plan[0]!.items.map((i) => i.contractId)).toEqual([C('A'), C('B'), C('C')]);
  });

  it.each([
    ['removed', { removed: true }],
    ['autopilot off', { autopilotEnabled: false }],
    ['mainnet item', { network: 'mainnet', payerNetwork: 'mainnet' }],
    ['payer on another network', { payerNetwork: 'mainnet' }],
    ['no payer', { payerAccount: null }],
    ['no per-job budget', { budgetPerJobMax: null }],
    ['no 30-day budget', { budgetPer30dMax: null }],
    ['no threshold', { thresholdLedgers: null }],
  ])('excludes a row that is %s', (_, over) => {
    const r = row(over as Partial<ReturnType<typeof row>>);
    expect(planTenants([r], zero(r))).toEqual([]);
  });

  it('refuses to plan mainnet even when asked', () => {
    const r = row({ network: 'mainnet', payerNetwork: 'mainnet' });
    expect(planTenants([r], zero(r), 'mainnet' as 'testnet')).toEqual([]);
  });

  it('computes the 30-day remaining budget per (user, contract) and floors it at 0', () => {
    const a = row({ userId: U1 });
    const b = row({ userId: U2 });
    const spent = new Map([
      [spendKey(U1, 'testnet', C('A')), 120n],
      [spendKey(U2, 'testnet', C('A')), 999n],
    ]);
    const items = planTenants([a, b], spent)[0]!.items;
    expect(items.map((i) => i.budget.per30dRemaining)).toEqual([180n, 0n]);
    expect(items[0]!.budget.perJobMax).toBe(100n);
  });

  it('treats a missing spend as nothing left, never as nothing spent', () => {
    const plan = planTenants([row()], new Map());
    expect(plan[0]!.items[0]!.budget.per30dRemaining).toBe(0n);
  });

  it('does not mutate its input and is deterministic', () => {
    const rows = Object.freeze([row({ userId: U2 }), row({ userId: U1, payerAccount: G('B') })]);
    const before = JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? `${v}` : v));
    const spent = zero(...rows);
    expect(planTenants(rows, spent)).toEqual(planTenants([...rows].reverse(), spent));
    expect(JSON.stringify(rows, (_, v) => (typeof v === 'bigint' ? `${v}` : v))).toBe(before);
  });
});

describe('checkBudget', () => {
  const item = planTenants([row()], new Map([[spendKey(U1, 'testnet', C('A')), 220n]]))[0]!
    .items[0]!; // perJobMax 100, remaining 80

  it('allows an estimate exactly at the cap', () => {
    const roomy = planTenants([row()], new Map([[spendKey(U1, 'testnet', C('A')), 0n]]))[0]!
      .items[0]!;
    expect(checkBudget(roomy, 100n)).toBe('ok');
    expect(checkBudget(item, 80n)).toBe('ok');
  });
  it('refuses one stroop over either cap', () => {
    const roomy = planTenants([row()], new Map([[spendKey(U1, 'testnet', C('A')), 0n]]))[0]!
      .items[0]!;
    expect(checkBudget(roomy, 101n)).toBe('over-per-job');
    expect(checkBudget(item, 81n)).toBe('over-30d');
  });
  it.each([undefined, -1n, 5 as unknown as bigint])('answers undetermined for estimate %s', (e) => {
    expect(checkBudget(item, e)).toBe('undetermined');
  });
});

describe('MemoryTenantStore + planTenantsFromStore', () => {
  const now = new Date('2026-10-24T00:00:00Z');
  const day = 24 * 60 * 60 * 1000;

  it('nets refunds, keeps the window to 30 days and scopes spend to (user, contract)', async () => {
    const store = new MemoryTenantStore(
      [
        row({ userId: U1 }),
        row({ userId: U2 }),
        row({ userId: U1, removed: true, contractId: C('Z') }),
      ],
      [
        {
          userId: U1,
          network: 'testnet',
          contractId: C('A'),
          pulledAt: new Date(+now - day),
          pulled: 100n,
          refunded: 40n,
        },
        {
          userId: U1,
          network: 'testnet',
          contractId: C('A'),
          pulledAt: new Date(+now - 31 * day),
          pulled: 100n,
          refunded: 0n,
        },
        {
          userId: U2,
          network: 'testnet',
          contractId: C('A'),
          pulledAt: new Date(+now - day),
          pulled: 250n,
          refunded: 0n,
        },
        {
          userId: U1,
          network: 'testnet',
          contractId: C('B'),
          pulledAt: new Date(+now - day),
          pulled: 300n,
          refunded: 0n,
        },
      ],
      () => now,
    );
    expect(await store.spentLast30d(U1, 'testnet', C('A'))).toBe(60n);
    const plan = await planTenantsFromStore(store);
    expect(plan).toHaveLength(1);
    expect(plan[0]!.items.map((i) => [i.userId, i.budget.per30dRemaining])).toEqual([
      [U1, 240n],
      [U2, 50n],
    ]);
  });
});

describe('missing pull ledger row (fail closed)', () => {
  it('a pulled job without its pull row leaves nothing for that item only', async () => {
    const now = new Date('2026-10-24T00:00:00Z');
    const day = new Date('2026-10-23T00:00:00Z');
    const store = new MemoryTenantStore(
      [row(), row({ contractId: C('B') })],
      [
        {
          userId: U1,
          network: 'testnet',
          contractId: C('A'),
          pulledAt: day,
          pulled: 0n,
          refunded: 0n,
          pullRecorded: false,
        },
        {
          userId: U1,
          network: 'testnet',
          contractId: C('B'),
          pulledAt: day,
          pulled: 50n,
          refunded: 0n,
        },
      ],
      () => now,
    );
    expect(await store.spentLast30d(U1, 'testnet', C('A'))).toBeUndefined();
    const [plan] = await planTenantsFromStore(store);
    expect(plan!.items.map((i) => [i.contractId, i.budget.per30dRemaining])).toEqual([
      [C('A'), 0n],
      [C('B'), 250n],
    ]);
  });
});

describe('isEligible bump window (core isValidBumpWindow)', () => {
  it('accepts a valid window', () => {
    expect(isEligible(row({ thresholdLedgers: 1000n, extendToLedgers: 5000n }), 'testnet')).toBe(
      true,
    );
    expect(isEligible(row({ thresholdLedgers: 1n, extendToLedgers: 2n }), 'testnet')).toBe(true);
  });
  it('rejects threshold 0', () => {
    expect(isEligible(row({ thresholdLedgers: 0n, extendToLedgers: 5000n }), 'testnet')).toBe(
      false,
    );
  });
  it('rejects extend equal to threshold', () => {
    expect(isEligible(row({ thresholdLedgers: 1000n, extendToLedgers: 1000n }), 'testnet')).toBe(
      false,
    );
  });
  it('rejects extend below threshold', () => {
    expect(isEligible(row({ thresholdLedgers: 5000n, extendToLedgers: 1000n }), 'testnet')).toBe(
      false,
    );
  });
  it('drops an invalid window from the plan', () => {
    const r = row({ thresholdLedgers: 0n });
    expect(planTenants([r], new Map([[spendKey(r.userId, r.network, r.contractId), 0n]]))).toEqual(
      [],
    );
  });
});
