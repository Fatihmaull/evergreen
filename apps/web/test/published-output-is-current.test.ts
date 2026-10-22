/**
 * The built site, checked at `pnpm test` time.
 *
 * `apps/dashboard/public/` is build output. Since PH2-BL-08 it is NOT
 * committed: Cloudflare Pages builds it on deploy, and CI runs
 * `node apps/web/build.mjs` before `pnpm check`, so these tests read a fresh
 * build. Locally, build first. They assert the two properties that were
 * broken in production on 2026-10-15:
 *
 *   1. a page given a browser bundle actually loads it — `/docs/archival/`
 *      declared `script: '/assets/archival.js'`, `siteShell` dropped the
 *      field, and the page shipped saying "Refreshing live…" with no code to
 *      make it true;
 *   2. nothing is published that no page, bundle or stylesheet reaches —
 *      748,893 bytes of `archival.js` were served with HTTP 200 to nobody.
 *
 * This repeats logic that `build.mjs` also guards, deliberately: the build's
 * copy fails the build, this copy fails the test run.
 */
import { describe, expect, test } from 'vitest';
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

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

describe('a verification build does not edit the tree it verifies', () => {
  /**
   * The former `check-published.mjs` (retired in PH2-BL-08) built into a
   * temporary directory and compared. It used to rewrite `apps/web/data/known-ends.json` while doing so — a SOURCE
   * file that the browser bundles import — so the comparison moved one of the
   * inputs of the thing being compared.
   *
   * That is almost certainly the transient same-length mismatch on the four
   * minified bundles, seen three times and never reproducible on demand.
   * esbuild is deterministic across processes: three separate builds of the
   * same source give byte-identical output, measured. So a differing bundle
   * means a differing input, and this was the one input a verification run
   * could move.
   *
   * Since #324 the gate blocks every merge in the repository. A gate that
   * edits the tree it is checking cannot be trusted about it.
   */
  test('a redirected build does not write data/known-ends.json', { timeout: 180_000 }, () => {
    const data = fileURLToPath(new URL('../data/known-ends.json', import.meta.url));
    // mtime, not a planted marker: this file is shared with every other test
    // file vitest runs in parallel, and editing it under them made a sibling
    // build fail. A write changes the timestamp whether or not it changes the
    // bytes, which is the property being asserted.
    const before = statSync(data).mtimeMs;
    const out = mkdtempSync(join(tmpdir(), 'evergreen-redirect-test-'));
    try {
      const result = spawnSync('node', [fileURLToPath(new URL('../build.mjs', import.meta.url))], {
        cwd: fileURLToPath(new URL('../../../', import.meta.url)),
        encoding: 'utf8',
        env: { ...process.env, EVERGREEN_WEB_OUT: out },
      });
      expect(result.status).toBe(0);
      expect(statSync(data).mtimeMs).toBe(before);
    } finally {
      rmSync(out, { recursive: true, force: true });
    }
  });
});
