/**
 * TTL decay, revamped: one reading per contract until the API keeps
 * observations (DES, 2026-11-24). A dot and a dashed projection to zero;
 * never a solid line; nothing drawn for undetermined; words for archived.
 */
import { readFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import {
  ONE_READING_CAPTION,
  bigChartHtml,
  readingOf,
  selectedRow,
  stripsHtml,
} from '../src/lib/decay-view';
import { rowFor } from '../src/lib/watchlist-view';
import { A, B, item } from './fixtures/watchlist-example';

const NOW = new Date('2026-10-19T12:00:00Z');
const live = rowFor(item(A, { label: 'oracle-feed' }), NOW);
const archived = rowFor(item(B, { label: 'legacy-router' }), NOW);
const unread = rowFor(
  { ...item('CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL'), lastObservation: null },
  NOW,
);

test('a live row is one dot and a dashed projection, with the one-reading caption', () => {
  const html = bigChartHtml(live, NOW);
  expect(html.match(/class="dot"/g)).toHaveLength(1);
  expect(html.match(/class="proj"/g)).toHaveLength(1);
  expect(html).not.toContain('class="line"');
  expect(html).toContain(ONE_READING_CAPTION);
  expect(readingOf(live, NOW)!.left).toBeGreaterThan(0);
});

test('archived and undetermined rows draw nothing', () => {
  expect(bigChartHtml(archived, NOW)).not.toContain('<svg');
  expect(bigChartHtml(archived, NOW)).toContain('archived');
  expect(readingOf(unread, NOW)).toBeUndefined();
  const strips = stripsHtml([live, archived, unread], A, NOW);
  expect(strips.match(/<svg/g)).toHaveLength(1);
  expect(strips).toContain('No expiry to draw');
  expect(strips).not.toContain('class="line"');
  expect(strips).toContain('strip open');
});

test('?c= picks the charted row, else the first that has a reading to draw', () => {
  expect(selectedRow([live, archived], A)?.item.contractId).toBe(A);
  expect(selectedRow([live, archived], B)?.item.contractId).toBe(B);
  expect(selectedRow([live, archived], undefined, NOW)?.item.contractId).toBe(A);
});

test('the page offers no example contracts', () => {
  for (const f of ['src/pages/ttl-decay.ts', 'src/pages/ttl-decay.mjs', 'src/lib/decay-view.ts']) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    expect(src).not.toMatch(/OUR_CONTRACTS|guinea-pig|snapshot\.json/);
  }
});
