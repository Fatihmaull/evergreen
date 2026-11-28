/**
 * The revamped Overview (components.md § "Dashboard revamp"): the rules the
 * spec states, against the watchlist fixtures.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  NOT_YET_AVAILABLE,
  attentionFirst,
  factsHtml,
  listHtml,
  nextHtml,
  panelHtml,
} from '../src/lib/overview-view';
import { rowFor } from '../src/lib/watchlist-view';
import { A, B, item } from './fixtures/watchlist-example';

const NOW = new Date('2026-10-19T12:00:00Z');
const healthy = rowFor(item(A, { label: 'payments-v2' }), NOW);
const archived = rowFor(
  item(B, {
    label: 'legacy',
    lastObservation: { ...item(B).lastObservation!, health: 'critical' },
  }),
  NOW,
);
const pending = rowFor(item('C' + 'Q'.repeat(55), { lastObservation: null }), NOW);

describe('needs attention first', () => {
  test('an at-risk contract beats a healthy one, and archived comes first', () => {
    expect(attentionFirst([healthy, archived, pending])?.row).toBe(archived);
  });
  test('all healthy: the one ending first, figure in ink, labelled "Ends first"', () => {
    const pick = attentionFirst([healthy]);
    expect(pick?.why).toBe('ends-first');
    expect(nextHtml([healthy])).toContain('next-figure ink');
    expect(nextHtml([healthy])).toContain('Ends first');
  });
  test('an undetermined contract is never chosen over a determined one, and has no figure', () => {
    expect(attentionFirst([pending, healthy])?.row).toBe(healthy);
    const html = nextHtml([pending]);
    expect(html).not.toContain('next-figure');
    expect(html).toContain('undetermined');
  });
});

describe('values with no API route are words, never zero', () => {
  test('facts', () => {
    const html = factsHtml([healthy], { kind: 'unread' }, NOW);
    expect(html).toContain(NOT_YET_AVAILABLE);
    expect(html).not.toMatch(/Last 30 days<\/p><p class="v">0/);
  });
  test('the panel draws no Extend now and says the runs are not yet available', () => {
    const html = panelHtml(healthy);
    expect(html).toContain('<button type="button" disabled>Extend now</button>');
    expect(html).toContain('switched off');
    expect(html).not.toContain('data-extend-now');
    expect(html).toContain(NOT_YET_AVAILABLE);
  });
});

test('the list shows at most five rows and links to the rest', () => {
  const many = Array.from({ length: 7 }, (_, i) =>
    rowFor(item(A, { contractId: `C${String(i).repeat(55)}` as never }), NOW),
  );
  const html = listHtml(many);
  expect(html.match(/<tr data-open/g)).toHaveLength(5);
  expect(html).toContain('2 more on');
});

test('the Overview page carries no example contract', () => {
  const page = readFileSync(new URL('../src/pages/overview.mjs', import.meta.url), 'utf8');
  const script = readFileSync(new URL('../src/pages/overview.ts', import.meta.url), 'utf8');
  for (const text of [page, script]) {
    expect(text).not.toMatch(/guinea|OUR_CONTRACTS|snapshot\.json/);
  }
});

describe('Contracts', () => {
  test('filters count by state and archived is not "needs attention"', async () => {
    const { filtersHtml, matchesFilter } = await import('../src/lib/overview-view');
    const all = [healthy, archived, pending];
    expect(all.filter((r) => matchesFilter(r, 'archived'))).toEqual([archived]);
    expect(all.filter((r) => matchesFilter(r, 'at-risk'))).toEqual([]);
    expect(all.filter((r) => matchesFilter(r, 'all', 'payments'))).toEqual([healthy]);
    expect(filtersHtml(all, 'all')).toContain('All <span class="mono">3</span>');
  });
  test('the wide list adds Binds on and Read; an empty figure is the sans em dash', () => {
    const html = listHtml([pending, healthy], undefined, { limit: Infinity, wide: true, now: NOW });
    expect(html).toContain('Binds on');
    expect(html).toContain('<span class="none">—</span>');
  });
  test('the Contracts panel offers Turn off; an undetermined panel offers a rescan', () => {
    const on = rowFor(
      item(A, { autopilot: { enabled: true, payerWallet: 'G'.repeat(56) } as never }),
      NOW,
    );
    expect(panelHtml(on, 'contracts')).toContain('data-autopilot-off');
    expect(panelHtml(on, 'overview')).not.toContain('data-autopilot-off');
    expect(panelHtml(pending, 'contracts')).toContain('Scan again');
  });
});

test('the scanner leads with the binding expiry and offers the CLI command and Add', async () => {
  const { resultHead } = await import('../src/lib/scan-panel');
  const { report } = await import('../src/lib/evergreen');
  const { scanOf } = await import('./fixtures/watchlist-example');
  const scan = scanOf(A);
  const html = resultHead(scan, report(scan), `npx @evergreen-stellar/cli scan ${A}`);
  expect(html).toContain('Binding expiry');
  expect(html).toContain('Copy CLI command');
  expect(html).toContain('id="watch-button"');
});
