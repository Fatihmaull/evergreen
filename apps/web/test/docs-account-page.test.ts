/**
 * /docs/account/ says what the account and watchlist do TODAY (K26). Two of its
 * statements are true only until someone ships the thing they say is missing,
 * so each is pinned to the source and fails the day it stops being true:
 *
 *   - only the scheduler writes an engine observation (PH2-E4-04);
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
    expect(allowance).toMatch(/id="revoke-button"[^>]*disabled>Revoke allowance</);
    expect(page).toContain('Revoke allowance');
    expect(page).toContain('stays disabled until a wallet is connected');
  });
});

describe('the two statements that go stale', () => {
  test('only the scheduler writes an engine observation', () => {
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
    expect(writers.map((f) => f.slice(ROOT.length))).toEqual(['apps/scheduler/src/observe.ts']);
    expect(page).toContain('the scheduler writes an engine observation for every watched');
  });

  test('no web code turns autopilot on or grants an allowance', () => {
    const files = [
      ...sources(join(ROOT, 'apps/web/src'), /\.(ts|mjs)$/),
      ...sources(join(ROOT, 'apps/dashboard/src'), /\.(ts|mjs)$/),
    ];
    // Autopilot is PATCH /watchlist (docs/API.md §6). Three PATCHes exist: alert
    // preferences, a boolean that does not touch autopilot; the watchlist
    // row's Turn off, which only ever sends `enabled: false`; and step D of
    // /allowance/, the one place that sends `enabled: true`.
    const setters = files.filter((f) => /method:\s*['"]PATCH['"]/.test(readFileSync(f, 'utf8')));
    expect(setters.map((f) => f.slice(ROOT.length)).sort()).toEqual([
      'apps/web/src/lib/alert-preferences.ts',
      'apps/web/src/lib/autopilot-on.ts',
      'apps/web/src/lib/watchlist.ts',
    ]);
    const watch = readFileSync(join(ROOT, 'apps/web/src/lib/watchlist.ts'), 'utf8');
    expect(watch).toContain('autopilot: { enabled: false }');
    expect(watch).not.toMatch(/enabled:\s*true/);
    // An object literal that sets it (a type's `enabled: true;` is not one).
    const turnsOn = files.filter((f) => /enabled:\s*true\s*,/.test(readFileSync(f, 'utf8')));
    expect(turnsOn.map((f) => f.slice(ROOT.length))).toEqual(['apps/web/src/lib/autopilot-on.ts']);
    // Only /allowance/ imports it, and only its step D calls it: that step is
    // hidden in the static page and shows after a matching read-back, which
    // needs the engine's spender address.
    const callers = files.filter((f) =>
      /from '\.\.\/lib\/autopilot-on'/.test(readFileSync(f, 'utf8')),
    );
    expect(callers.map((f) => f.slice(ROOT.length))).toEqual(['apps/web/src/pages/allowance.ts']);
    const allowancePage = readFileSync(join(ROOT, 'apps/web/src/pages/allowance.mjs'), 'utf8');
    expect(allowancePage).toMatch(/id="autopilot-step"[^>]*hidden/);
    // `.stack` is display: grid, which beats the UA's [hidden]; the page CSS must restore it (DES, #654).
    const css = readFileSync(join(ROOT, 'apps/web/src/styles.css'), 'utf8');
    expect(css).toMatch(/#autopilot-step\[hidden\]\s*\{\s*display:\s*none;/);
    // After an approve the result replaces the sign button; `.row` is flex (DES, #660).
    expect(allowancePage).toMatch(/id="sign-row"/);
    expect(allowancePage).toMatch(/id="sign-help"/);
    expect(css).toMatch(/#sign-row\[hidden\],\s*#sign-help\[hidden\]\s*\{\s*display:\s*none;/);
    const prefs = readFileSync(join(ROOT, 'apps/web/src/lib/alert-preferences.ts'), 'utf8');
    expect(prefs).toContain("'/me/alert-preferences'");
    expect(prefs).not.toMatch(/\/watchlist/);
    expect(prefs).not.toMatch(/autopilot/);
    expect(prefs).not.toMatch(/dispatchUserAlert|resend\.com/);
    // Granting is an `approve` call with a nonzero amount. The only place the site
    // builds one is the revoke path, and it sends zero.
    const approvers = files.filter((f) => /call\(\s*['"]approve['"]/.test(readFileSync(f, 'utf8')));
    expect(approvers.map((f) => f.slice(ROOT.length))).toEqual(['apps/web/src/lib/allowance.ts']);
    expect(readFileSync(join(ROOT, 'apps/web/src/lib/allowance.ts'), 'utf8')).toContain(
      "nativeToScVal(0n, { type: 'i128' })",
    );
    expect(page).toContain(
      'No control on this site turns autopilot on except the last step of the allowance page',
    );
  });
});
