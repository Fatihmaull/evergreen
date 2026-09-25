/**
 * Both outcomes of guinea-pig C's crossing, built before it happens.
 *
 * C crosses its alert threshold on 2026-09-25 and expires on the 26th. Its four
 * capture slots were still "requested, not assigned" on the 24th, so the page
 * has to be correct whether or not anyone is there. The three states are
 * derived from `ops/crossing-schedule.json` and the date — nothing is flipped
 * by hand on Monday, and nothing is written under a deadline.
 *
 *   observed   — the watch completed and the event was captured.
 *   upcoming   — the date has not arrived.
 *   unobserved — the date passed and nothing captured it.
 *
 * The third is the one that matters. A series that simply stops reads as a
 * chart that ran out of data; SOW §6.2 is graded by one person with minimal
 * technical expertise, and to that reader unfinished and unexplained look the
 * same. A series that says why it stops is a different artefact.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { render } from '../src/pages/decay.mjs';

const read = (path: string): unknown =>
  JSON.parse(readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8'));

const decay = read('../data/decay.json') as { series: { id: string; contract: string }[] };
const knownEnds = read('../data/known-ends.json') as Record<string, { status?: string }>;

const C = 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL';

/** The panel for one series, from the rendered page. */
function panelFor(html: string, label: string): string {
  const parts = html.split('<article');
  const found = parts.find((part) => part.includes(label));
  if (found === undefined) throw new Error(`no panel for ${label}`);
  return found;
}

function renderAt(now: Date, ends: typeof knownEnds): string {
  return render({ decay, knownEnds: ends }, now) as string;
}

/** The schedule with C's watch marked complete, as it would be after a capture. */
const captured = {
  ...knownEnds,
  [C]: { ...knownEnds[C], status: 'complete' },
};

describe('guinea-pig C, before its crossing', () => {
  const html = renderAt(new Date('2026-09-24T12:00:00Z'), knownEnds);
  const panel = panelFor(html, 'guinea-pig C');

  test('says the expiry has not happened yet', () => {
    expect(panel).toContain('not yet');
    expect(panel).not.toContain('not observed');
  });

  test('marks the dashed segment as a projection rather than a reading', () => {
    expect(panel).toContain('projection to a known expiry ledger, not a reading');
  });
});

describe('guinea-pig C, if the capture happens', () => {
  const html = renderAt(new Date('2026-09-27T12:00:00Z'), captured);
  const panel = panelFor(html, 'guinea-pig C');

  test('reads as an expiry that occurred, in the past tense', () => {
    expect(panel).toContain('expired 2026-09-26');
    expect(panel).not.toContain('not observed');
    expect(panel).not.toContain('not yet');
  });
});

describe('guinea-pig C, if the capture does not happen', () => {
  const html = renderAt(new Date('2026-09-27T12:00:00Z'), knownEnds);
  const panel = panelFor(html, 'guinea-pig C');

  test('says the expiry was not observed, without apologising for it', () => {
    expect(panel).toContain('The expiry was not observed');
    expect(panel).toContain('ends at its last recorded reading');
    // States what happened and what was not seen. No "unfortunately", no
    // "we were unable to", no missing-data placeholder.
    expect(panel).not.toMatch(/unfortunately|sorry|failed to|unable to|TBC|TODO/i);
  });

  test('still names the expiry ledger, which is known even unobserved', () => {
    expect(panel).toContain('4,880,097');
    expect(panel).toContain('projection rather than a measurement');
  });

  test('does not claim a reading it does not have', () => {
    // The series ends at its last recorded observation; nothing is drawn past it.
    expect(panel).not.toContain('not yet');
  });
});

describe('guinea-pig B is unaffected by any of this', () => {
  test('stays observed, because its watch completed', () => {
    const html = renderAt(new Date('2026-09-27T12:00:00Z'), knownEnds);
    const panel = panelFor(html, 'guinea-pig B');
    expect(panel).toContain('expired 2026-09-21');
    expect(panel).not.toContain('not observed');
  });
});
