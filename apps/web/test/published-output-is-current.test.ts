/**
 * The committed site, checked at `pnpm test` time.
 *
 * `apps/dashboard/public/` is build output that is COMMITTED, and the
 * Cloudflare Pages project publishes it from `main`. No workflow builds it, so
 * the guards inside `apps/web/build.mjs` only run when somebody runs the
 * build. These tests do run in CI, so they assert the two properties that were
 * broken in production on 2026-10-15:
 *
 *   1. a page given a browser bundle actually loads it — `/docs/archival/`
 *      declared `script: '/assets/archival.js'`, `siteShell` dropped the
 *      field, and the page shipped saying "Refreshing live…" with no code to
 *      make it true;
 *   2. nothing is published that no page, bundle or stylesheet reaches —
 *      748,893 bytes of `archival.js` were served with HTTP 200 to nobody.
 *
 * This repeats logic that `build.mjs` also guards, deliberately. The build's
 * copy fails the build; this copy fails CI. Until `.github/workflows/` gains a
 * site build, only the second one runs on a pull request.
 */
import { describe, expect, test } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
// @ts-expect-error — a plain .mjs checker with no declarations, imported for
// its one exported function rather than re-implemented here.
import { differences } from '../scripts/check-published.mjs';

const PUBLISHED = fileURLToPath(new URL('../../dashboard/public/', import.meta.url));

function filesUnder(dir: string, test: RegExp): string[] {
  const out: string[] = [];
  const walk = (current: string): void => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (test.test(entry.name)) out.push(path);
    }
  };
  walk(dir);
  return out;
}

describe('the published site', () => {
  test('every asset is reached by some page, bundle or stylesheet', () => {
    const assets = readdirSync(join(PUBLISHED, 'assets'), { withFileTypes: true })
      .filter((entry) => entry.isFile())
      .map((entry) => entry.name);
    expect(assets.length).toBeGreaterThan(0);

    const readers = filesUnder(PUBLISHED, /\.(html|css|js)$/);
    const orphans = assets.filter((name) => {
      const needle = `/assets/${name}`;
      return !readers.some(
        // A bundle naming itself reaches nothing.
        (path) => !path.endsWith(`assets/${name}`) && readFileSync(path, 'utf8').includes(needle),
      );
    });
    expect(orphans).toEqual([]);
  });

  test('the archival page loads the bundle that makes its live claim true', () => {
    const page = readFileSync(join(PUBLISHED, 'docs/archival/index.html'), 'utf8');
    // The page says the configuration is read live. These two go together or
    // the page is lying: the promise and the code that keeps it.
    expect(page).toContain('read live from testnet when the page loads');
    expect(page).toContain('<script src="/assets/archival.js"></script>');
  });
});

describe('the published-output checker', () => {
  const fixture = (): { a: string; b: string; clean: () => void } => {
    const root = mkdtempSync(join(tmpdir(), 'evergreen-published-test-'));
    for (const name of ['a', 'b']) {
      mkdirSync(join(root, name, 'assets'), { recursive: true });
      writeFileSync(join(root, name, 'index.html'), '<p>same</p>\n');
      writeFileSync(join(root, name, 'assets/styles.css'), 'body{}\n');
    }
    return {
      a: join(root, 'a'),
      b: join(root, 'b'),
      clean: () => rmSync(root, { recursive: true, force: true }),
    };
  };

  test('reports nothing when the two directories match', () => {
    const { a, b, clean } = fixture();
    try {
      expect(differences(a, b)).toEqual([]);
    } finally {
      clean();
    }
  });

  test('reports a file whose content differs at the same length', () => {
    const { a, b, clean } = fixture();
    try {
      // "74" → "77" was the real drift: same byte count, different page.
      writeFileSync(join(a, 'index.html'), '<p>s4me</p>\n');
      expect(differences(a, b)).toEqual([
        'index.html: published copy differs in content, same length (12 bytes)',
      ]);
    } finally {
      clean();
    }
  });

  test('reports a file the build produces that is not published', () => {
    const { a, b, clean } = fixture();
    try {
      writeFileSync(join(a, 'assets/new.js'), '//\n');
      expect(differences(a, b)).toEqual(['assets/new.js: built, but not published']);
    } finally {
      clean();
    }
  });

  test('reports a published file the build no longer produces', () => {
    const { a, b, clean } = fixture();
    try {
      writeFileSync(join(b, 'assets/left-behind.js'), '//\n');
      expect(differences(a, b)).toEqual([
        'assets/left-behind.js: published, but this build does not produce it',
      ]);
    } finally {
      clean();
    }
  });
});
