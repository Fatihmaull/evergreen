import { describe, expect, it } from 'vitest';
import {
  PROTECTED_ENTRIES,
  SHARED_CODE_ENTRY_KEY,
  SHARED_CODE_UNTIL,
  assertWriteAllowed,
  ProtectedEntryError,
} from '../src/write-guard.js';

/**
 * There must be NO implicit route to the shared `ContractCode` entry.
 *
 * Not "the guard refuses it" — that is already tested. This asks the prior
 * question: can the key reach a write plan at all without someone typing the
 * flag that names it? Guinea-pigs A, B and C are one Wasm, so extending that
 * entry extends all three, and it must not be touched before SHARED_CODE_UNTIL.
 *
 * `planExtension` admits keys by exactly three routes, and each is closed:
 *
 *   1. `instanceKey(contractId)` — DERIVED from the contract, always present.
 *      A contract instance key is structurally a `contractData` key, so this
 *      route cannot produce a `contractCode` key at all.
 *   2. `options.dataKeys` — every supplied key must be `contractData`, must
 *      belong to this contract, and must not be the instance. A code key fails
 *      the first test.
 *   3. `options.includeCode` — the explicit flag, and the guard refuses by key.
 *
 * Route 2 is the one worth a test rather than a reading, because it is the
 * route a user controls with arbitrary bytes.
 */

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';

describe('the shared code entry has no implicit route to a write', () => {
  it('🔴 is refused by LEDGER KEY, whatever the caller says about consumers', () => {
    // Defence in depth for route 2: even if a code key somehow reached the key
    // set, the guard matches on the key itself. It must not depend on the
    // consumer list — a single-contract scan reports ONE consumer, which is how
    // the first version of this guard let `extend A --include-code` through.
    expect(() =>
      assertWriteAllowed({
        contractId: A,
        entryKeys: [SHARED_CODE_ENTRY_KEY],
        scan: { entries: {} },
      }),
    ).toThrow(ProtectedEntryError);
  });

  it('refuses it even when the scan carries no record of that key at all', () => {
    // An empty scan is the weakest possible evidence, and the guard must not
    // read permission out of an absence.
    expect(() =>
      assertWriteAllowed({
        contractId: A,
        entryKeys: [SHARED_CODE_ENTRY_KEY],
        scan: { entries: {} },
      }),
    ).toThrow(/SHARED ContractCode/);
  });

  it('names the date it is protected until, so nobody guesses', () => {
    try {
      assertWriteAllowed({
        contractId: A,
        entryKeys: [SHARED_CODE_ENTRY_KEY],
        scan: { entries: {} },
      });
      throw new Error('should have refused');
    } catch (error) {
      expect((error as Error).message).toContain(SHARED_CODE_UNTIL);
    }
  });

  it('lets an ordinary instance-only write through — the guard is not a blanket no', () => {
    // A suite proving only that everything is refused is what a jammed guard
    // produces. The permitted case has to stay permitted.
    expect(() =>
      assertWriteAllowed({
        contractId: A,
        entryKeys: ['AAAABgAAAAEbSomeInstanceKey'],
        scan: { entries: {} },
      }),
    ).not.toThrow();
  });

  it('🔴 the shared-code key is not the key of any protected CONTRACT', () => {
    // If the code entry were only protected via the contract deny-list, then
    // acknowledging B (legitimate after Sep 20) would also unlock the shared
    // entry, which is protected six days longer.
    for (const subject of PROTECTED_ENTRIES) {
      expect(subject.contractId).not.toBe(SHARED_CODE_ENTRY_KEY);
    }
    expect(() =>
      assertWriteAllowed({
        contractId: A,
        entryKeys: [SHARED_CODE_ENTRY_KEY],
        scan: { entries: {} },
        options: { acknowledgeProtected: PROTECTED_ENTRIES.map((s) => s.contractId) },
      }),
    ).toThrow(ProtectedEntryError);
  });

  it('the shared-code protection outlasts both contract crossings', () => {
    // Sep 26 is after B (Sep 21 expiry) and C (Sep 26 expiry). If this ever
    // inverts, the entry becomes extendable while a proof still depends on it.
    for (const subject of PROTECTED_ENTRIES) {
      expect(SHARED_CODE_UNTIL >= subject.expiresOn).toBe(true);
    }
  });
});
