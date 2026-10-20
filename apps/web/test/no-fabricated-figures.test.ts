/**
 * The detector for the class that loading pages could not find.
 *
 * An archived entry is still returned by the RPC, with `liveUntilLedgerSeq: 0`.
 * Core reports that faithfully — `ttl.status: 'known'`, `endsAtLedger: 0`,
 * `remainingLedgers: 0 - observed` — and says `isExpired: true` alongside it.
 * Renderers that read the raw numbers printed `-4,810,562 ledgers` and
 * `~Dec 18, 2025`.
 *
 * Nobody saw it until guinea-pig B actually expired, because a defect that only
 * appears when a contract enters a particular state does not show itself on a
 * page you happen to open. So the states are rendered here from a recorded
 * scan instead of waited for. Guinea-pig C expires on 26 September; these tests
 * already cover what its cells will do.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { report, type ScanResult } from '../src/lib/evergreen';
import { contractCard, entryTable, graph, verdict } from '../src/lib/ui';
import { entryView } from '../src/lib/view';
import knownEnds from '../data/known-ends.json';

const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL('../data/snapshot.json', import.meta.url)), 'utf8'),
) as { capturedAt: string; result: ScanResult };

const full = report(snapshot.result);
const OBSERVED = full.observedAtLedger ?? 0;

/** Residue of arithmetic on a zero, or of a lookup that did not resolve. */
const FABRICATED = [
  /\bNaN\b/,
  /\bundefined\b/,
  /\bInfinity\b/,
  /\[object Object\]/,
  /-[\d,]{4,}/, // a negative ledger count
  /\bledger\s+0\b/, // "at ledger 0" — the zero an archived entry reports
];

/**
 * Markup must be stripped before matching. The first version of this checked
 * the raw HTML and missed `ledger <span class="mono">0</span>` entirely,
 * because the tag sat between the two words — a detector with a blind spot
 * exactly where the defect was.
 */
function text(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ');
}

const CAPTURED_AT = Date.parse(snapshot.capturedAt);

/**
 * The only dates that may legitimately sit in the past are the recorded ends of
 * our own subjects — guinea-pig B ended on 21 September and the page says so.
 * Everything else pointing backwards is a projection from `endsAtLedger: 0`.
 */
const RECORDED_ENDS = new Set(
  Object.values(knownEnds as Record<string, { endsOn?: string }>)
    .map((k) => k.endsOn)
    .filter((d): d is string => typeof d === 'string'),
);

/**
 * Calendar date, not a timestamp. `Date.parse('Sep 21, 2026')` is local
 * midnight and `Date.parse('2026-09-21')` is UTC midnight; comparing those two
 * directly made this test fail by seven hours.
 */
function calendarDay(when: Date): string {
  return [
    when.getFullYear(),
    String(when.getMonth() + 1).padStart(2, '0'),
    String(when.getDate()).padStart(2, '0'),
  ].join('-');
}

/**
 * A date projected from `endsAtLedger: 0` lands years in the past. No entry
 * read in this scan can honestly be described as *expiring* before the scan was
 * taken, so a past date that is not a recorded end is fabricated.
 */
function assertNoPastProjection(plain: string, label: string): void {
  for (const [match] of plain.matchAll(/~?\s*(?:\w+ \d{1,2},? \d{4}|\d{1,2} \w+ \d{4})/g)) {
    const when = Date.parse(match.replace(/^~\s*/, ''));
    if (Number.isNaN(when)) continue;
    if (RECORDED_ENDS.has(calendarDay(new Date(when)))) continue;
    expect(
      when >= CAPTURED_AT - 86_400_000,
      `${label} rendered "${match.trim()}", which is before the scan was taken and is not a recorded end`,
    ).toBe(true);
  }
}

function assertClean(html: string, label: string): void {
  const plain = text(html);
  for (const pattern of FABRICATED) {
    expect(pattern.test(plain), `${label} rendered ${pattern} in:\n${plain.slice(0, 400)}`).toBe(
      false,
    );
  }
  assertNoPastProjection(plain, label);
}

function sub(contractId: string) {
  const entries = full.entries.filter((e) => e.entry.contracts.includes(contractId));
  return { ...full, entries, result: { ...full.result, contracts: [{ id: contractId }] } };
}

describe('the recorded snapshot covers the states we must render', () => {
  test('it contains at least one expired entry and one live one', () => {
    const states = full.entries.map((e) => entryView(e).state);
    expect(states, 'the fixture must exercise the expired path').toContain('expired');
    expect(states).toContain('live');
  });
});

describe('no renderer prints a figure derived from an archived entry', () => {
  test('verdict, for every contract in the scan', () => {
    for (const contract of full.result.contracts) {
      assertClean(verdict(sub(contract.id)), `verdict(${contract.id.slice(0, 8)})`);
    }
  });

  test('verdict, for the whole multi-contract scan', () => {
    assertClean(verdict(full), 'verdict(all)');
  });

  test('entry table', () => {
    assertClean(entryTable(full), 'entryTable');
  });

  test('contract cards', () => {
    for (const contract of full.result.contracts) {
      assertClean(contractCard('subject', contract.id, sub(contract.id)), 'contractCard');
    }
  });

  test('dependency graph', () => {
    assertClean(graph(full), 'graph');
  });
});

describe('an expired entry states what it is', () => {
  const expired = full.entries.find((e) => entryView(e).state === 'expired');

  test('it is rendered with core’s own sentence, not a reworded one', () => {
    expect(expired).toBeDefined();
    const view = entryView(expired!);
    if (view.state !== 'expired') throw new Error('expected expired');
    // Verbatim from core's health.ts — the same words the CLI prints.
    expect(view.reason).toMatch(/^Already (archived|deleted)\./);
    const html = contractCard(
      'subject',
      expired!.entry.contracts[0]!,
      sub(expired!.entry.contracts[0]!),
    );
    expect(html).toContain(view.reason);
    expect(html).toMatch(/archived|deleted/);
  });

  test('it shows the ledger it ended at, which the chain can no longer report', () => {
    const view = entryView(expired!);
    if (view.state !== 'expired') throw new Error('expected expired');
    // Our own subjects have a committed measurement; a stranger's would not,
    // and must then say so rather than show a number.
    expect(view.endedAtLedger).toBeTypeOf('number');
    expect(view.endedAtLedger!).toBeGreaterThan(0);
    expect(view.endedAtLedger!).toBeLessThan(OBSERVED);
  });

  test('it never reports a remaining count or a projected date', () => {
    const view = entryView(expired!);
    expect(Object.keys(view)).not.toContain('remainingLedgers');
    expect(Object.keys(view)).not.toContain('endsAt');
  });
});

/**
 * The shape core emits after `PH2-E1-01` (#235), tested before core ships it.
 *
 * Every fixture above carries the OLD shape — `status: 'known'` with a
 * negative `remainingLedgers` — which is precisely why nothing in this suite
 * would have caught the break. The day core starts reporting
 * `status: 'expired'`, `view.ts`'s `status !== 'known'` return catches every
 * archived entry and renders it **unread**: a wrong answer, no error, no type
 * error, and a green suite. `unread` means "we could not read this"; `archived`
 * means "this is gone until someone pays". Giving the first answer when the
 * second is true is the failure this product exists to name.
 *
 * So these assert against what core will emit, not against what it emits now.
 */
describe('the expired TTL status core is adding', () => {
  const base = {
    key: 'AAAABg==',
    entry: {
      kind: 'persistent' as const,
      endBehavior: 'archived' as const,
      contracts: ['CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ'] as const,
      observedAtLedger: 5_200_000,
    },
    assessment: {
      health: 'expired' as const,
      needsAction: false,
      isExpired: true,
      observedContractCount: 1,
      blastRadiusAtLeast: 1,
      sharingStatus: 'exclusive' as const,
      reason: 'Archived. Restoring it is a cost, not a loss.',
    },
  };

  /** `{ status: 'expired' }` — an archived entry, where RPC reports a zero. */
  const archived = {
    ...base,
    entry: { ...base.entry, ttl: { status: 'expired' } },
  } as unknown as Parameters<typeof entryView>[0];

  /** `{ status: 'expired', endedAtLedger }` — RPC reported a real final ledger. */
  const withLedger = {
    ...base,
    entry: { ...base.entry, ttl: { status: 'expired', endedAtLedger: 4_793_688 } },
  } as unknown as Parameters<typeof entryView>[0];

  test('renders as expired, never as unread', () => {
    expect(entryView(archived).state).toBe('expired');
    expect(entryView(withLedger).state).toBe('expired');
  });

  test('keeps archived and deleted as different words', () => {
    const view = entryView(archived);
    expect(view).toMatchObject({ state: 'expired', word: 'archived' });

    const temporary = {
      ...base,
      entry: {
        ...base.entry,
        kind: 'temporary' as const,
        endBehavior: 'deleted' as const,
        ttl: { status: 'expired' },
      },
    } as unknown as Parameters<typeof entryView>[0];
    expect(entryView(temporary)).toMatchObject({ state: 'expired', word: 'deleted' });
  });

  test("prefers core's real final ledger over our recorded schedule", () => {
    // 4,793,688 is guinea-pig B's persistent end in `known-ends.json`, so this
    // asserts the two agree rather than that one silently shadowed the other.
    expect(entryView(withLedger)).toMatchObject({ endedAtLedger: 4_793_688 });
  });

  test('shows no end ledger when core reports none and the schedule has none', () => {
    const unknownSubject = {
      ...base,
      entry: {
        ...base.entry,
        contracts: ['CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L'] as const,
        kind: 'code' as const,
        endBehavior: 'archived' as const,
        ttl: { status: 'expired' },
      },
    } as unknown as Parameters<typeof entryView>[0];
    const view = entryView(unknownSubject);
    expect(view.state).toBe('expired');
    // Nowhere to put a number beats a number that is the arithmetic of a zero.
    expect(view).not.toHaveProperty('endedAtLedger');
  });
});
