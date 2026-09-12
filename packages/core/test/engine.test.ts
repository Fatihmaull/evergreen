import { describe, expect, it } from 'vitest';
import type { EvergreenConfig, LedgerEntryTTL, ScanResult } from '@evergreen-stellar/shared-types';
import { decideBumps } from '../src/engine.js';
import { SHARED_CODE_ENTRY_KEY } from '../src/write-guard.js';

/**
 * `W3-D15-03` — the decision logic, against fixtures, no network.
 *
 * The engine is the first thing here that picks targets without a human, so
 * these assert what it REFUSES as hard as what it does.
 */

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';

function entry(contracts: string[], remaining: number | undefined): LedgerEntryTTL {
  return {
    kind: 'instance',
    endBehavior: 'archived',
    contracts,
    observedAtLedger: 1_000_000,
    ttl:
      remaining === undefined
        ? { status: 'unavailable' }
        : { status: 'known', endsAtLedger: 1_000_000 + remaining, remainingLedgers: remaining },
  } as LedgerEntryTTL;
}

const scanOf = (entries: Record<string, LedgerEntryTTL>): ScanResult =>
  ({ network: 'testnet', contracts: [], entries, issues: [] }) as unknown as ScanResult;

const configFor = (ids: string[], below = 17_280): EvergreenConfig =>
  ({
    network: { rpcUrl: 'https://soroban-testnet.stellar.org', networkPassphrase: 'x' },
    defaults: { bumpWhenRemainingLedgersBelow: below, extendToLedgers: 500_000 },
    contracts: ids.map((id) => ({ id, payer: 'dev' })),
    payers: {},
  }) as unknown as EvergreenConfig;

describe('decideBumps — acting', () => {
  it('extends an entry below threshold, resolving a TARGET not a delta', () => {
    const [d] = decideBumps(scanOf({ k1: entry([A], 100) }), configFor([A]));
    expect(d?.action).toBe('extend');
    // current remaining + extendToLedgers, never the bare delta.
    expect(d?.action === 'extend' && d.extendToLedgers).toBe(100 + 500_000);
  });

  it('skips an entry above threshold and says the number', () => {
    const [d] = decideBumps(scanOf({ k1: entry([A], 900_000) }), configFor([A]));
    expect(d?.action).toBe('skip');
    expect(d?.reason).toContain('900,000');
  });

  it('acts at EXACTLY the threshold — the boundary is inclusive', () => {
    // The project's first finding, in the component whose job is deciding.
    const [d] = decideBumps(scanOf({ k1: entry([A], 17_280) }), configFor([A], 17_280));
    expect(d?.action).toBe('extend');
  });

  it('ignores entries belonging to no configured contract', () => {
    expect(decideBumps(scanOf({ k1: entry(['CUNKNOWN'], 10) }), configFor([A]))).toEqual([]);
  });
});

describe('decideBumps — refusing', () => {
  it('🔴 records a guard refusal as a DECISION, and does not throw', () => {
    // The Sep 20 sequence: B crosses, the guard refuses, and the refusal is the
    // evidence. A throw here would take the whole run — and the alert — down.
    const decisions = decideBumps(scanOf({ k1: entry([B], 100) }), configFor([B]));
    expect(decisions).toHaveLength(1);
    expect(decisions[0]?.action).toBe('skip');
    expect(decisions[0]?.reason).toContain('REFUSED BY WRITE GUARD');
  });

  it('🔴 one protected subject does not abort deciding for the others', () => {
    // A crash on B would silence the engine for A in the same run.
    const decisions = decideBumps(
      scanOf({ kA: entry([A], 100), kB: entry([B], 100) }),
      configFor([A, B]),
    );
    expect(decisions.map((d) => d.action).sort()).toEqual(['extend', 'skip']);
  });

  it('🔴 refuses the shared ContractCode entry by key', () => {
    const decisions = decideBumps(
      scanOf({ [SHARED_CODE_ENTRY_KEY]: entry([A], 100) }),
      configFor([A]),
    );
    expect(decisions[0]?.action).toBe('skip');
    expect(decisions[0]?.reason).toContain('REFUSED BY WRITE GUARD');
  });

  it('never extends an entry whose TTL could not be read', () => {
    const [d] = decideBumps(scanOf({ k1: entry([A], undefined) }), configFor([A]));
    expect(d?.action).toBe('skip');
    expect(d?.reason).toContain('Unknown is not healthy');
  });
});
