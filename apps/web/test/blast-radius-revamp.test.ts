/**
 * Blast radius, revamped (components.md § "Dashboard revamp", Blast radius),
 * against the committed three-contract scan: one code entry shared by all
 * three, two of whose instances are archived.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import {
  blastPanelHtml,
  codeHashHex,
  largestSharedHtml,
  layout,
  mapSvg,
  sharedEntries,
  traced,
} from '../src/lib/blast-view';
import { report, type ScanResult } from '../src/lib/evergreen';
import { A, B, C, scanOf } from './fixtures/watchlist-example';

const NOW = new Date('2026-10-19T12:00:00Z');
const all = JSON.parse(readFileSync(new URL('../data/snapshot.json', import.meta.url), 'utf8'))
  .result as ScanResult;
const rep = report(all);
const labels = new Map([
  [A, 'oracle-feed'],
  [B, 'payments-v2'],
]);
const code = rep.entries.find((e) => e.entry.kind === 'code')!;

describe('the largest shared entry', () => {
  test('is the code entry all three run on, named by its Wasm hash', () => {
    expect(sharedEntries(rep, NOW)[0]?.key).toBe(code.key);
    const hex = codeHashHex(code.key)!;
    expect(hex).toMatch(/^[0-9a-f]{64}$/);
    const html = largestSharedHtml(rep, labels, NOW);
    expect(html).toContain('>3<');
    expect(html).toContain(`code ${hex.slice(0, 4)}…${hex.slice(-4)}`);
    expect(html).toContain('all 3 stop at once');
  });

  test('a single contract shares nothing it can see, and says only that', () => {
    const s = scanOf(A);
    const one = report({
      ...s,
      entries: Object.fromEntries(
        Object.entries(s.entries).map(([k, e]) => [k, { ...e, contracts: [A] }]),
      ),
    });
    expect(sharedEntries(one)).toHaveLength(0);
    const html = largestSharedHtml(one, labels, NOW);
    expect(html).toContain('None seen');
    expect(html).toContain('may still share their code');
    expect(html).not.toMatch(/\bunshared\b|\bexclusive\b/);
  });
});

describe('the map', () => {
  test('Code draws only code entries; All entries draws instances too', () => {
    expect(layout(rep, 'code').entries).toHaveLength(1);
    expect(layout(rep, 'all').entries).toHaveLength(4);
  });

  test('a shared entry is centred between its contracts and says they stop together', () => {
    const L = layout(rep, 'code');
    const box = L.ey.get(code.key)!;
    const ys = [A, B, C].map((id) => L.cy.get(id)!);
    expect(box.y + box.h / 2).toBeCloseTo(ys.reduce((a, b) => a + b) / 3);
    expect(mapSvg(rep, labels, 'code', undefined, NOW)).toContain(
      'shared by 3 · they stop together',
    );
  });

  test('selecting an entry lights its contracts; selecting a contract lights its entries', () => {
    expect([...traced(rep, code.key).contracts].sort()).toEqual([A, B, C].sort());
    expect(traced(rep, A).entries.size).toBe(2);
    const svg = mapSvg(rep, labels, 'all', A, NOW);
    expect(svg.match(/class="edge on"/g)).toHaveLength(2);
    expect(svg).toContain('dim-node');
  });

  test('archived instances are drawn as archived, never with a negative count', () => {
    const svg = mapSvg(rep, labels, 'all', undefined, NOW);
    expect(svg).toContain('instance archived');
    expect(svg).not.toMatch(/-\d[\d,]* left/);
  });
});

describe('the side panel', () => {
  test('an entry lists what stops with it and has no invented last extend', () => {
    const html = blastPanelHtml(rep, labels, new Set([A, B]), code.key, NOW);
    expect(html).toContain('If it is archived, these stop');
    expect(html).toContain('oracle-feed');
    expect(html).toContain('added here');
    expect(html).toContain('not yet available');
    expect(html).toContain(`npx @evergreen-stellar/cli scan ${A}`);
  });

  test('a watched contract links to Contracts; an added one does not', () => {
    expect(blastPanelHtml(rep, labels, new Set([A]), A, NOW)).toContain('Open in Contracts');
    expect(blastPanelHtml(rep, labels, new Set([A]), C, NOW)).not.toContain('Open in Contracts');
    expect(blastPanelHtml(rep, labels, new Set(), 'nope', NOW)).toBe('');
  });
});

test('the page offers no example contracts', () => {
  for (const f of [
    'src/pages/blast-radius.ts',
    'src/pages/blast-radius.mjs',
    'src/lib/blast-view.ts',
  ]) {
    const src = readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
    expect(src).not.toMatch(/OUR_CONTRACTS|guinea-pig|Use our three/);
  }
});
