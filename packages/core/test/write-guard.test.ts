import { describe, expect, it } from 'vitest';
import type { LedgerEntryTTL, ScanResult } from '@evergreen-stellar/shared-types';
import {
  PROTECTED_ENTRIES,
  ProtectedEntryError,
  SHARED_CODE_ENTRY_KEY,
  assertWriteAllowed,
} from '../src/write-guard.js';
import { resolveExtendTarget } from '../src/network-config.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
const C = 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL';
const INSTANCE = 'AAAABgAAAAEbInstance';
const SHARED_CODE = 'AAAAB8flXwSharedCode';

function entry(contracts: string[], kind: LedgerEntryTTL['kind'] = 'instance'): LedgerEntryTTL {
  return {
    kind,
    endBehavior: 'archived',
    contracts,
    observedAtLedger: 1_000_000,
    ttl: { status: 'known', endsAtLedger: 1_200_000, remainingLedgers: 200_000 },
  } as LedgerEntryTTL;
}

const scan = (entries: Record<string, LedgerEntryTTL>): Pick<ScanResult, 'entries'> => ({
  entries,
});

describe('assertWriteAllowed — it REFUSES, it does not warn', () => {
  it('🔴 refuses an extend naming guinea-pig B directly', () => {
    // Demonstrated against the real CLI on 2026-09-12: the write path accepted
    // B, prepared a real envelope, and never mentioned it was a decay subject.
    expect(() =>
      assertWriteAllowed({
        contractId: B,
        entryKeys: [INSTANCE],
        scan: scan({ [INSTANCE]: entry([B]) }),
      }),
    ).toThrow(ProtectedEntryError);
  });

  it('names the DATE being spent, not just the rule', () => {
    // "Refused by policy" tells someone to look for the override. Naming the
    // crossing tells them what it costs.
    try {
      assertWriteAllowed({
        contractId: B,
        entryKeys: [INSTANCE],
        scan: scan({ [INSTANCE]: entry([B]) }),
      });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('2026-09-20');
      expect((error as Error).message).toContain('cannot be recreated');
    }
  });

  it('refuses guinea-pig C too, with its own date', () => {
    try {
      assertWriteAllowed({
        contractId: C,
        entryKeys: [INSTANCE],
        scan: scan({ [INSTANCE]: entry([C]) }),
      });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('2026-09-25');
    }
  });
});

describe('assertWriteAllowed — the indirection is the real hazard', () => {
  it('🔴 refuses extending A’s CODE entry, because B and C share it', () => {
    // `extend A --include-code` never mentions B or C. This is the one
    // operation that reaches the protected subjects without naming them, and
    // a deny-list keyed only on the named contract would wave it through.
    expect(() =>
      assertWriteAllowed({
        contractId: A,
        entryKeys: [SHARED_CODE],
        scan: scan({ [SHARED_CODE]: entry([A, B, C], 'code') }),
      }),
    ).toThrow(/SHARED ENTRY/);
  });

  it('says the named contract is not the one at risk', () => {
    try {
      assertWriteAllowed({
        contractId: A,
        entryKeys: [SHARED_CODE],
        scan: scan({ [SHARED_CODE]: entry([A, B, C], 'code') }),
      });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('not the contract you named');
      expect((error as Error).message).toContain('W3-D18-02d');
    }
  });
});

describe('🔴 the shared code entry — the case a consumer list CANNOT see', () => {
  it('refuses it even when the scan reports only ONE consumer', () => {
    // The first version of this guard failed exactly here. A scan of A alone
    // reports its code entry with one consumer, because the chain does not
    // index reverse dependencies from a single contract query. So the guard
    // saw "one contract, not protected" and stayed silent — verified against
    // the real CLI, which produced a prepared envelope for `A --include-code`.
    expect(() =>
      assertWriteAllowed({
        contractId: A,
        entryKeys: [SHARED_CODE_ENTRY_KEY],
        // Deliberately the FALSE view: only A visible, B and C invisible.
        scan: scan({ [SHARED_CODE_ENTRY_KEY]: entry([A], 'code') }),
      }),
    ).toThrow(/SHARED ContractCode/);
  });

  it('explains that a single-contract scan cannot reveal the sharing', () => {
    try {
      assertWriteAllowed({
        contractId: A,
        entryKeys: [SHARED_CODE_ENTRY_KEY],
        scan: scan({ [SHARED_CODE_ENTRY_KEY]: entry([A], 'code') }),
      });
      expect.unreachable();
    } catch (error) {
      expect((error as Error).message).toContain('CANNOT show you this');
      expect((error as Error).message).toContain('2026-09-20');
      expect((error as Error).message).toContain('2026-09-25');
    }
  });

  it('does not refuse a DIFFERENT code entry', () => {
    // Keyed on one specific entry, not on "anything of kind code".
    expect(() =>
      assertWriteAllowed({
        contractId: A,
        entryKeys: ['AAAAB0RpZmZlcmVudENvZGU='],
        scan: scan({ 'AAAAB0RpZmZlcmVudENvZGU=': entry([A], 'code') }),
      }),
    ).not.toThrow();
  });
});

describe('assertWriteAllowed — it PERMITS what it should', () => {
  it('allows extending guinea-pig A’s own instance', () => {
    // A guard that refuses everything is the W1-D4-00 testnet guard again.
    expect(() =>
      assertWriteAllowed({
        contractId: A,
        entryKeys: [INSTANCE],
        scan: scan({ [INSTANCE]: entry([A]) }),
      }),
    ).not.toThrow();
  });

  it('allows a protected subject when it is acknowledged BY NAME', () => {
    expect(() =>
      assertWriteAllowed({
        contractId: B,
        entryKeys: [INSTANCE],
        scan: scan({ [INSTANCE]: entry([B]) }),
        options: { acknowledgeProtected: [B] },
      }),
    ).not.toThrow();
  });

  it('🔴 acknowledging B does NOT unlock C — the override is per contract', () => {
    // A blanket "yes I'm sure" would spend both proofs on one keystroke.
    expect(() =>
      assertWriteAllowed({
        contractId: C,
        entryKeys: [INSTANCE],
        scan: scan({ [INSTANCE]: entry([C]) }),
        options: { acknowledgeProtected: [B] },
      }),
    ).toThrow(ProtectedEntryError);
  });

  it('allows an unrelated third-party contract', () => {
    const other = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
    expect(() =>
      assertWriteAllowed({
        contractId: other,
        entryKeys: [INSTANCE],
        scan: scan({ [INSTANCE]: entry([other]) }),
      }),
    ).not.toThrow();
  });
});

describe('the deny-list itself', () => {
  it('lives in code, not config — config can be edited by the person in a hurry', () => {
    expect(PROTECTED_ENTRIES.map((p) => p.contractId)).toEqual([B, C]);
  });

  it('gives every subject a date and a reason', () => {
    for (const subject of PROTECTED_ENTRIES) {
      expect(subject.alertThresholdOn).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(subject.why.length).toBeGreaterThan(20);
    }
  });
});

describe('the protocol ceiling is maxEntryTtl - 1, not maxEntryTtl', () => {
  const MAX = 3_110_400;

  it('🔴 clamps to maxEntryTtl MINUS ONE', () => {
    // Rakha read the stellar-core validator: `extendTo <= maxEntryTTL - 1`,
    // because the setting counts the current ledger. The clamp previously sat
    // at maxEntryTtl exactly, which the protocol rejects at submission.
    const r = resolveExtendTarget({
      currentRemainingLedgers: 3_000_000,
      additionalLedgers: 1_000_000,
      maxEntryTtl: MAX,
    });
    expect(r.extendToLedgers).toBe(MAX - 1);
    expect(r.extendToLedgers).not.toBe(MAX);
    expect(r.wasCapped).toBe(true);
  });

  it('composes with the simulation gap: the old value priced a REJECTED target', () => {
    // simulateTransaction does not validate extendTo against the ceiling, so
    // the pre-fix code would have quoted a fee for a target the protocol then
    // refuses at submission. A wrong number AND a failed transaction, from one
    // off-by-one. Separately each looks like a detail.
    const r = resolveExtendTarget({
      currentRemainingLedgers: MAX - 1,
      additionalLedgers: 1,
      maxEntryTtl: MAX,
    });
    expect(r.extendToLedgers).toBeLessThanOrEqual(MAX - 1);
  });
});
