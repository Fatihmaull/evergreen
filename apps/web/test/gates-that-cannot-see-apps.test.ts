/**
 * Two repository gates structurally cannot see `apps/`, so the web enforces
 * their rules on itself here until they can.
 *
 * Proven by planting failures on 2026-09-23, not by reading the scripts:
 *
 *   - `scripts/check-locale-pinning.mjs` walks `ROOTS = ['packages','scripts']`.
 *     An unpinned `toLocaleString()` added under `apps/web/` left it printing
 *     "✓ every rendered number is pinned to an explicit locale".
 *   - `scripts/check-cadence-quotes.mjs` walks `docs/` plus four named files.
 *     A frozen delivery percentage and worst-gap added under `apps/web/` left
 *     it printing "✓ no hard-coded scheduler-cadence figures in prose".
 *
 * Both live in `scripts/`, which belongs to the CLI/engine track (#196). A gate
 * that cannot reach its subject is indistinguishable from one that passes, and
 * this project has paid for that more than once — so these run on the web's own
 * files rather than waiting.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const WEB = fileURLToPath(new URL('../', import.meta.url));

function sources(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) sources(path, out);
    else if (/\.(ts|mjs|js)$/.test(entry.name)) out.push(path);
  }
  return out;
}

const FILES = [...sources(join(WEB, 'src')), ...sources(join(WEB, 'scripts'))];

/**
 * Comments are prose about the code, not the code. The first version of this
 * flagged `format.ts` for the sentence explaining why unpinned formatting is a
 * hazard — a detector that cannot tell a warning from the thing it warns about.
 */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1 ');
}

describe('locale pinning, which check:locale cannot see here', () => {
  test('every toLocaleString names its locale', () => {
    const unpinned: string[] = [];
    for (const file of FILES) {
      const source = code(readFileSync(file, 'utf8'));
      for (const [match] of source.matchAll(/toLocaleString\(\s*([^)]*)\)/g)) {
        // An empty argument list, or one that starts with an options object,
        // takes the machine's locale. 120,909 becomes 120.909 in German.
        const args = match.slice('toLocaleString('.length, -1).trim();
        if (args === '' || args.startsWith('{'))
          unpinned.push(`${file.slice(WEB.length)}: ${match}`);
      }
    }
    expect(unpinned, `unpinned number formatting:\n  ${unpinned.join('\n  ')}`).toEqual([]);
  });
});

describe('cadence figures, which check:cadence cannot see here', () => {
  /** The same shapes the repository gate looks for. */
  const FIGURES = [
    /\b\d{1,2}\.\d%\s*(of\s*)?(declared|cadence)/i,
    /worst[- ]observed[- ]gap\D{0,12}\d{2,4}/i,
    /worst\s+observed\s+gap\s+of\s+\d{2,4}/i,
  ];

  test('a file that quotes one also dates it and names its evidence', () => {
    const offenders: string[] = [];
    for (const file of FILES) {
      const raw = readFileSync(file, 'utf8');
      const source = code(raw);
      if (!FIGURES.some((pattern) => pattern.test(source))) continue;
      // The gate exempts docs/evidence and docs/adr because a DATED record
      // should freeze its numbers. The same exemption, earned the same way:
      // say when it was measured and point at the bundle.
      const dated = /\bMeasured on 2026-\d{2}-\d{2}\b/.test(raw);
      const sourced = /docs\/evidence\/\d{4}-\d{2}-\d{2}-scheduler-cadence/.test(raw);
      if (!dated || !sourced) {
        offenders.push(
          `${file.slice(WEB.length)} quotes a cadence figure but ${
            dated ? 'does not cite its bundle' : 'does not say when it was measured'
          }`,
        );
      }
    }
    expect(
      offenders,
      `that delivery rate moved 7.1% → 7.3% inside the session that corrected it:\n  ${offenders.join('\n  ')}`,
    ).toEqual([]);
  });
});
