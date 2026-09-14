import { describe, expect, it } from 'vitest';
import type { EvergreenConfig, LedgerEntryTTL, ScanResult } from '@evergreen-stellar/shared-types';
import { decideBumps } from '../src/engine.js';

/**
 * `W3-D16-02b` — within a single run, bump each unique LEDGER KEY exactly once.
 *
 * Distinct from the across-run case (`W3-D16-02`) and **not covered by it**: a
 * single run over N contracts built from the same Wasm will otherwise try to
 * bump one `ContractCode` entry N times. Across-run locking would not help,
 * because all N attempts happen inside the same run.
 *
 * A pure in-process property over the scan's ledger-key map — no store, no
 * network, no clock. The unit of work is the KEY, not the contract, and that is
 * the whole reason this holds.
 *
 * The row says "test with B and C". That predates the write guard (#100), which
 * now refuses both unconditionally — so a decision on them is a REFUSAL and the
 * dedupe would never be observable through an extend. These use unprotected
 * contracts so the property under test is the one being measured.
 */

const SHARED_CODE = 'AAAAB8fSharedCodeEntryKey';
const C1 = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA1';
const C2 = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA2';
const C3 = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA3';

function entry(contracts: string[], kind: LedgerEntryTTL['kind']): LedgerEntryTTL {
  return {
    kind,
    endBehavior: 'archived',
    contracts,
    observedAtLedger: 1_000_000,
    ttl: { status: 'known', endsAtLedger: 1_000_100, remainingLedgers: 100 },
  } as LedgerEntryTTL;
}

/** Three contracts, one shared code entry — the exact shape A, B and C have. */
const sharedWasmScan = {
  network: 'testnet',
  contracts: [{ id: C1 }, { id: C2 }, { id: C3 }],
  issues: [],
  entries: {
    AAAABgInstance1: entry([C1], 'instance'),
    AAAABgInstance2: entry([C2], 'instance'),
    AAAABgInstance3: entry([C3], 'instance'),
    [SHARED_CODE]: entry([C1, C2, C3], 'code'),
  },
} as unknown as ScanResult;

const config = {
  network: { rpcUrl: 'x', networkPassphrase: 'y' },
  defaults: { bumpWhenRemainingLedgersBelow: 17_280, extendToLedgers: 600_000 },
  contracts: [C1, C2, C3].map((id) => ({ id, payer: 'p' })),
  payers: { p: { signer: 'ed25519', secretEnvVar: 'UNREAD' } },
} as unknown as EvergreenConfig;

describe('🔴 within-run idempotency — one decision per ledger key', () => {
  it('produces exactly ONE decision for a code entry shared by three contracts', () => {
    // The hazard the row names: three contracts sharing a Wasm, one entry, and
    // a naive per-contract loop would emit three bumps for the same key —
    // paying three times and racing itself inside a single run.
    const decisions = decideBumps(sharedWasmScan, config);
    const forShared = decisions.filter((d) => d.entryKey === SHARED_CODE);
    expect(forShared).toHaveLength(1);
  });

  it('emits one decision per unique key overall, not one per contract', () => {
    const decisions = decideBumps(sharedWasmScan, config);
    // 4 entries, 3 contracts. A per-contract loop would give 6 (3 instances +
    // the shared code counted 3 times).
    expect(decisions).toHaveLength(4);
    expect(new Set(decisions.map((d) => d.entryKey)).size).toBe(decisions.length);
  });

  it('still names every consumer on the shared decision', () => {
    // Deduping the ACTION must not dedupe the BLAST RADIUS. One bump, three
    // contracts depending on it, and the decision has to say so.
    const [shared] = decideBumps(sharedWasmScan, config).filter((d) => d.entryKey === SHARED_CODE);
    expect(shared?.contracts).toHaveLength(3);
  });

  it('holds when the same contract is registered twice in config', () => {
    // A duplicate registration is a config mistake, not a licence to bump
    // twice. `W3-D15-04` made repeated registrations preserve policy; this
    // asserts they do not multiply work.
    const doubled = {
      ...config,
      contracts: [...config.contracts, { id: C1, payer: 'p' }],
    } as unknown as EvergreenConfig;
    const decisions = decideBumps(sharedWasmScan, doubled);
    expect(new Set(decisions.map((d) => d.entryKey)).size).toBe(decisions.length);
  });
});
