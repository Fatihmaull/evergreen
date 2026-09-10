import { describe, expect, it } from 'vitest';
import type { LedgerEntryTTL, ScanResult, Stroops } from '@evergreen-stellar/shared-types';
import { estimateRent, stroopsToXlm, type RentQuoter } from '../src/rent.js';

const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
const C = 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL';
const SHARED_CODE = 'AAAAB8flXwrYnvsGALwVBIsVUJn6TZfO4WRm+hJEs9y86Yv7';
const INSTANCE_B = 'AAAABgAAAAEbInstanceB';
const INSTANCE_C = 'AAAABgAAAAEbInstanceC';

function entry(
  contracts: string[],
  remaining = 100_000,
  kind: LedgerEntryTTL['kind'] = 'instance',
) {
  return {
    kind,
    endBehavior: kind === 'temporary' ? 'deleted' : 'archived',
    contracts,
    observedAtLedger: 4_597_573,
    ttl: { status: 'known', endsAtLedger: 4_597_573 + remaining, remainingLedgers: remaining },
  } as LedgerEntryTTL;
}

/** Prices every requested key identically, so the SUM is what is under test. */
function flatQuoter(perEntry: string): RentQuoter {
  return {
    quote: ({ entryKeys }) =>
      Promise.resolve(
        entryKeys.map((entryKey) => ({ entryKey, estimatedRentStroops: perEntry as Stroops })),
      ),
  };
}

/** B and C: two contracts, three entries, ONE shared code entry. The real shape. */
const factoryScan: ScanResult = {
  network: 'testnet',
  contracts: [{ id: B }, { id: C }],
  entries: {
    [INSTANCE_B]: entry([B]),
    [INSTANCE_C]: entry([C]),
    [SHARED_CODE]: entry([B, C], 693_256, 'code'),
  },
  issues: [],
};

describe('estimateRent — sums per UNIQUE ledger key, never per contract', () => {
  it('🔴 charges a shared code entry ONCE across two contracts', async () => {
    // The regression the backlog names, with the fixture it names: B and C
    // share one ContractCode entry. A per-contract sum would price four
    // entry-extends (2 instances + the code entry twice) instead of three.
    const { estimate } = await estimateRent(
      factoryScan,
      { extendToLedgers: 518_400 },
      flatQuoter('100000'),
    );
    expect(Object.keys(estimate.estimatedRentStroopsByEntry)).toHaveLength(3);
    expect(estimate.totalEstimatedRentStroops).toBe('300000');
    // Named explicitly: the per-contract answer would have been 400,000.
    expect(estimate.totalEstimatedRentStroops).not.toBe('400000');
  });

  it('does not grow the total as more contracts share one entry', async () => {
    // The double-count scales with N, so it is worst for exactly the factory
    // deployments most sensitive to cost.
    const many = {
      ...factoryScan,
      entries: { [SHARED_CODE]: entry(['A', 'B', 'C', 'D', 'E', 'F'], 693_256, 'code') },
    };
    const { estimate } = await estimateRent(
      many,
      { extendToLedgers: 518_400 },
      flatQuoter('100000'),
    );
    expect(estimate.totalEstimatedRentStroops).toBe('100000');
  });

  it('asks the network for each unique key exactly once', async () => {
    const asked: string[][] = [];
    const spy: RentQuoter = {
      quote: ({ entryKeys }) => {
        asked.push([...entryKeys]);
        return Promise.resolve(
          entryKeys.map((entryKey) => ({ entryKey, estimatedRentStroops: '1' as Stroops })),
        );
      },
    };
    await estimateRent(factoryScan, { extendToLedgers: 518_400 }, spy);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toHaveLength(3);
    expect(new Set(asked[0]).size).toBe(3);
  });
});

describe('estimateRent — totals stay lossless', () => {
  it('sums as BigInt, so a large bill does not drift', async () => {
    // Stroops are decimal text precisely so JSON stays lossless. Summing as
    // JS numbers gives that up at the moment the number gets big enough to care.
    const big = '9007199254740993'; // Number.MAX_SAFE_INTEGER + 2
    const scan: ScanResult = {
      ...factoryScan,
      entries: { [INSTANCE_B]: entry([B]), [INSTANCE_C]: entry([C]) },
    };
    const { estimate } = await estimateRent(scan, { extendToLedgers: 518_400 }, flatQuoter(big));
    expect(estimate.totalEstimatedRentStroops).toBe('18014398509481986');
    // Show the float answer differs, comparing STRINGS. Comparing numbers here
    // cannot fail: the literal 18014398509481986 is itself parsed to
    // ...984, so `Number(x) !== 18014398509481986` is tautologically false.
    // The first version of this assertion did exactly that and proved nothing.
    const floatSum = String(Number(big) + Number(big));
    expect(floatSum).toBe('18014398509481984');
    expect(estimate.totalEstimatedRentStroops).not.toBe(floatSum);
  });

  it('rejects a malformed price rather than folding it into a plausible total', async () => {
    await expect(
      estimateRent(factoryScan, { extendToLedgers: 518_400 }, flatQuoter('1.5')),
    ).rejects.toThrow(/stroops/);
    await expect(
      estimateRent(factoryScan, { extendToLedgers: 518_400 }, flatQuoter('-1')),
    ).rejects.toThrow(/stroops/);
  });
});

describe('estimateRent — what it refuses to price', () => {
  it('excludes an already-expired entry and says why', async () => {
    const scan: ScanResult = {
      ...factoryScan,
      entries: { [INSTANCE_B]: entry([B], -5) },
    };
    const { estimate, excluded } = await estimateRent(
      scan,
      { extendToLedgers: 518_400 },
      flatQuoter('100000'),
    );
    expect(estimate.totalEstimatedRentStroops).toBe('0');
    expect(excluded[0]?.reason).toBe('already-expired');
    expect(excluded[0]?.detail).toContain('RestoreFootprintOp');
  });

  it('🔴 reports a missing quote rather than treating it as zero', async () => {
    // A silent zero understates a bill, which is the direction that matters:
    // a user budgets for less than they owe and the extend fails funded short.
    const partial: RentQuoter = {
      quote: ({ entryKeys }) =>
        Promise.resolve(
          entryKeys
            .slice(0, 1)
            .map((entryKey) => ({ entryKey, estimatedRentStroops: '100000' as Stroops })),
        ),
    };
    const { estimate, excluded } = await estimateRent(
      factoryScan,
      { extendToLedgers: 518_400 },
      partial,
    );
    expect(Object.keys(estimate.estimatedRentStroopsByEntry)).toHaveLength(1);
    expect(excluded.filter((e) => e.reason === 'no-quote-returned')).toHaveLength(2);
  });

  it('rejects an unrequested or duplicated quote', async () => {
    const rogue: RentQuoter = {
      quote: () =>
        Promise.resolve([{ entryKey: 'NOT_ASKED_FOR', estimatedRentStroops: '1' as Stroops }]),
    };
    await expect(estimateRent(factoryScan, { extendToLedgers: 518_400 }, rogue)).rejects.toThrow(
      /unrequested/,
    );
  });

  it('makes no network call at all for an empty scan', async () => {
    let called = false;
    const spy: RentQuoter = {
      quote: () => {
        called = true;
        return Promise.resolve([]);
      },
    };
    const { estimate } = await estimateRent(
      { ...factoryScan, entries: {} },
      { extendToLedgers: 518_400 },
      spy,
    );
    expect(called).toBe(false);
    expect(estimate.totalEstimatedRentStroops).toBe('0');
  });

  it('refuses a nonsensical extend length', async () => {
    await expect(
      estimateRent(factoryScan, { extendToLedgers: 0 }, flatQuoter('1')),
    ).rejects.toThrow(/positive integer/);
  });
});

describe('stroopsToXlm', () => {
  it('converts without floating point', () => {
    expect(stroopsToXlm('318803' as Stroops)).toBe('0.0318803');
    expect(stroopsToXlm('10000000' as Stroops)).toBe('1.0000000');
    expect(stroopsToXlm('1' as Stroops)).toBe('0.0000001');
  });

  it('stays exact past the float boundary', () => {
    expect(stroopsToXlm('90071992547409931' as Stroops)).toBe('9007199254.7409931');
  });
});
