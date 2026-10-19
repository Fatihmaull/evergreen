/**
 * A page may not present a ledger that has already passed as a future expiry.
 *
 * On 2026-10-19 `/dashboard/contracts/` and `/dashboard/decay/` told visitors
 * that the shared code entry — the one this product calls 98% of the bill, the
 * entry that binds all three contracts and takes them down together — expires
 * about 20 October 2026 at ledger 5,290,829. It had been extended to 8,297,162
 * on 2026-10-14, and the chain had been saying so for five days. The page said
 * it in the present tense, two days before the date it named.
 *
 * The number was a LITERAL in page source, four times across two files. No
 * reader fetched it, so no reader could refuse when it moved, and the product
 * whose entire thesis is "a contract reported healthy right up until it stops"
 * published a confident, precise, wrong expiry about its own headline entry.
 *
 * `futureEnd` is the class fix: a future end ledger is rendered through it or
 * not at all, and it refuses anything that is not ahead of the snapshot the
 * page was built from.
 */
import { describe, expect, test } from 'vitest';
// @ts-expect-error — a plain .mjs page helper with no declarations.
import { futureEnd } from '../src/pages/_shared.mjs';
import snapshot from '../data/snapshot.json';

describe('futureEnd', () => {
  test('returns a ledger that is ahead of the snapshot', () => {
    expect(futureEnd(8_297_162, 5_271_773)).toBe(8_297_162);
  });

  test('refuses the exact ledger that shipped', () => {
    // 5,290,829 against a snapshot observed at 5,271,773 would have passed;
    // against today's it is in the past, which is precisely the drift.
    expect(() => futureEnd(5_290_829, 5_300_000, 'the shared code entry')).toThrow(
      /the shared code entry: ledger 5290829 is not ahead of the snapshot's 5300000/,
    );
  });

  test('refuses a ledger equal to the snapshot, not only one behind it', () => {
    // Remaining zero is the final LIVE ledger, but a page that says an entry
    // "ends at" the ledger it was read at is reporting the present as a future.
    expect(() => futureEnd(5_000_000, 5_000_000)).toThrow(/not ahead of/);
  });

  test('refuses a missing or non-integer ledger rather than rendering NaN', () => {
    expect(() => futureEnd(undefined, 5_000_000)).toThrow(/expected two ledger numbers/);
    expect(() => futureEnd(5_000_000, undefined)).toThrow(/expected two ledger numbers/);
  });

  test('names the remedy, because the fix is a command and not a thought', () => {
    expect(() => futureEnd(1, 2)).toThrow(/make-snapshot\.mjs/);
  });
});

describe('the committed snapshot', () => {
  const entries = Object.values(
    (
      snapshot as {
        result: {
          entries: Record<
            string,
            {
              kind: string;
              ttl: { status: string; endsAtLedger?: number };
              observedAtLedger: number;
            }
          >;
        };
      }
    ).result.entries,
  );

  test('holds exactly one code entry, because the three contracts share one', () => {
    expect(entries.filter((e) => e.kind === 'code')).toHaveLength(1);
  });

  /**
   * The test that would have caught this on any day of the five. It fails when
   * the snapshot ages past the entry the pages present as live, which is the
   * only way a correct page can quietly become a wrong one.
   */
  test('has not aged past the shared code entry it is used to describe', () => {
    const [code] = entries.filter((e) => e.kind === 'code');
    expect(code.ttl.status).toBe('known');
    expect(futureEnd(code.ttl.endsAtLedger, code.observedAtLedger)).toBeGreaterThan(
      code.observedAtLedger,
    );
  });
});
