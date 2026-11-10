/**
 * /docs/account/ says what the account and watchlist do TODAY (K26). Two of its
 * statements are true only until someone ships the thing they say is missing,
 * so each is pinned to the source and fails the day it stops being true:
 *
 *   - no engine observation is written for a watched contract;
 *   - no control on the site turns autopilot on or grants an allowance.
 *
 * A failure here is not a bug in the test. It means the page is now wrong and
 * must be rewritten, with a new date and commit, in the same pull request.
 * Quoted strings are compared with the code that renders them, not retyped.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowFor } from '../src/lib/watchlist-view';
import { A, item, scanOf } from './fixtures/watchlist-example';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const OUT = join(ROOT, 'apps/dashboard/public');
const text = (path: string) => readFileSync(path, 'utf8').replace(/\s+/g, ' ');
const page = text(join(OUT, 'docs/account/index.html'));
const NOW = new Date('2026-11-05T00:00:00Z');

function sources(dir: string, pattern: RegExp): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (name === 'node_modules' || name === 'dist' || name === 'test') return [];
    if (statSync(path).isDirectory()) return sources(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}

describe('/docs/account/', () => {
  test('is built, in the docs sidebar, and linked from /docs/ and the landing page', () => {
    expect(page).toContain('Account and watchlist');
    expect(text(join(OUT, 'docs/index.html'))).toContain('href="/docs/account/"');
    expect(text(join(OUT, 'index.html'))).toContain('href="/docs/account/"');
    expect(text(join(OUT, 'docs/quickstart/index.html'))).toContain('href="/docs/account/"');
  });

  test('quotes the row lines exactly as the watchlist renders them', () => {
    const browserRead = rowFor(item(A, { lastObservation: null }), NOW, scanOf(A));
    const notRead = rowFor(item(A, { lastObservation: null }), NOW);
    expect(browserRead.why).toBeDefined();
    expect(notRead.why).toBeDefined();
    // The page splits the sentence around <em>; compare the words.
    const words = (s: string) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ');
    expect(words(page)).toContain(browserRead.why as string);
    expect(words(page)).toContain(notRead.why as string);
  });

  test('the 50-item cap is the API constant', () => {
    const store = readFileSync(join(ROOT, 'apps/api/src/watchlist/store.ts'), 'utf8');
    const cap = /WATCH_ITEMS_PER_USER_MAX = (\d+)/.exec(store)?.[1];
    expect(cap).toBe('50');
    expect(page).toContain(`<strong>${cap}</strong> contracts per account`);
  });

  test('says Revoke is disabled, and it is', () => {
    const allowance = readFileSync(join(ROOT, 'apps/web/src/pages/allowance.mjs'), 'utf8');
    expect(allowance).toMatch(/id="revoke-button" type="button" disabled>Revoke allowance</);
    expect(page).toContain('Revoke allowance');
    expect(page).toContain('stays disabled');
  });
});

describe('the two statements that go stale', () => {
  test('nothing outside tests writes an engine observation', () => {
    const roots = [
      'apps/api/src',
      'apps/scheduler/src',
      'packages/engine/src',
      'packages/core/src',
    ];
    const writers = roots
      .map((r) => join(ROOT, r))
      .filter(existsSync)
      .flatMap((dir) => sources(dir, /\.(ts|mjs|js|sql)$/))
      .filter((file) =>
        /INSERT\s+INTO\s+(public\.)?observations/i.test(readFileSync(file, 'utf8')),
      );
    expect(writers.map((f) => f.slice(ROOT.length))).toEqual([]);
    expect(page).toContain('nothing in the repository writes an engine observation');
  });

  test('no web code turns autopilot on or grants an allowance', () => {
    const files = [
      ...sources(join(ROOT, 'apps/web/src'), /\.(ts|mjs)$/),
      ...sources(join(ROOT, 'apps/dashboard/src'), /\.(ts|mjs)$/),
    ];
    // PATCH /watchlist is the only route that sets autopilot (docs/API.md §6).
    const setters = files.filter((f) => /method:\s*['"]PATCH['"]/.test(readFileSync(f, 'utf8')));
    expect(setters.map((f) => f.slice(ROOT.length))).toEqual([]);
    // Granting is an `approve` call with a nonzero amount. The only place the site
    // builds one is the revoke path, and it sends zero.
    const approvers = files.filter((f) => /call\(\s*['"]approve['"]/.test(readFileSync(f, 'utf8')));
    expect(approvers.map((f) => f.slice(ROOT.length))).toEqual(['apps/web/src/lib/allowance.ts']);
    expect(readFileSync(join(ROOT, 'apps/web/src/lib/allowance.ts'), 'utf8')).toContain(
      "nativeToScVal(0n, { type: 'i128' })",
    );
    expect(page).toContain('No control on this site turns autopilot on');
  });
});
