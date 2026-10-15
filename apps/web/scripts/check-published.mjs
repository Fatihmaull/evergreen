/**
 * Is the published site the site this repository builds?
 *
 * `apps/dashboard/public/` is committed build output, and the Cloudflare Pages
 * project publishes that directory from `main`. Nothing in CI builds it. So
 * the live site is whatever was last committed, and a merge that changes a
 * source the pages read leaves production wrong until somebody remembers.
 *
 * That is not hypothetical. On 2026-10-15 the published `/docs/evidence/` read
 * "74 committed bundles" under a caption saying "counted at build time — not a
 * remembered number". `docs/evidence/` held 77. Three bundles had landed in
 * three separate pull requests, every one of them green, and the number on the
 * page was three releases old. The mechanism was honest and the figure was
 * not, which is the worst version of this failure: the page tells the reader
 * why it can be trusted.
 *
 * The sources that reach a page are not only `apps/web/` — the build reads the
 * CLI's own help text, the shipped engine config, the Action manifest, the
 * `ScanResult` declaration and the evidence directory. A pull request in
 * another track can therefore stale this directory without touching a single
 * file in `apps/`, which is exactly why a human rule ("rebuild before you
 * merge") was never going to hold.
 *
 *   node apps/web/scripts/check-published.mjs
 *   node apps/web/scripts/check-published.mjs --commission
 *
 * Exits non-zero when a rebuild would change what is published. The fix is
 * always the same: run `node apps/web/build.mjs` and commit the result.
 *
 * NOT IN CI YET. `.github/workflows/` belongs to the CLI/engine track, so this
 * is written to be wired in rather than wired in here.
 */
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const repo = join(web, '../..');
const published = join(repo, 'apps/dashboard/public');

/** Every file under `dir`, keyed by its path relative to `dir`. */
function inventory(dir) {
  const files = new Map();
  const walk = (current) => {
    for (const entry of readdirSync(current, { withFileTypes: true })) {
      const path = join(current, entry.name);
      if (entry.isDirectory()) walk(path);
      else files.set(relative(dir, path), readFileSync(path));
    }
  };
  walk(dir);
  return files;
}

/**
 * The comparison, as a function of two directories so that `--commission` can
 * hand it a copy it has deliberately staled. Returns the differences; it does
 * not print or exit, because a checker that can only be run one way cannot be
 * proven to fail.
 */
export function differences(builtDir, publishedDir) {
  const built = inventory(builtDir);
  const live = inventory(publishedDir);
  const out = [];
  for (const [path, bytes] of built) {
    if (!live.has(path)) out.push(`${path}: built, but not published`);
    else if (!bytes.equals(live.get(path))) {
      const was = live.get(path).length;
      /**
       * Report equal lengths as equal lengths. The drift this check was
       * written for changed "74" to "77" — same byte count, different page —
       * and a message reading "12761 → 12761 bytes" reads like a broken
       * check rather than a stale file.
       */
      out.push(
        was === bytes.length
          ? `${path}: published copy differs in content, same length (${was} bytes)`
          : `${path}: published copy differs (${was} → ${bytes.length} bytes)`,
      );
    }
  }
  for (const path of live.keys()) {
    if (!built.has(path)) out.push(`${path}: published, but this build does not produce it`);
  }
  return out.sort();
}

function build(into) {
  execFileSync('node', [join(web, 'build.mjs')], {
    cwd: repo,
    env: { ...process.env, EVERGREEN_WEB_OUT: into },
    stdio: 'pipe',
  });
}

/**
 * Guarded so that importing this file for `differences` does not build the
 * site. `apps/web/test/published-output-is-current.test.ts` imports it, and an
 * unguarded top level would run a full build on every `pnpm test`.
 */
function main() {
  const scratch = mkdtempSync(join(tmpdir(), 'evergreen-published-'));
  try {
    const fresh = join(scratch, 'built');
    build(fresh);

    const drift = differences(fresh, published);

    if (process.argv.includes('--commission')) {
      /**
       * Three mutations, because a checker that only ever reports "no drift" is
       * indistinguishable from one that cannot read. Each is planted on a COPY;
       * the published directory is never written to.
       */
      const cases = [
        [
          'a stale page is caught',
          (dir) => {
            const page = join(dir, 'docs/evidence/index.html');
            writeFileSync(
              page,
              readFileSync(page, 'utf8').replace(/<\/body>/, '<p>stale</p></body>'),
            );
          },
          'docs/evidence/index.html',
        ],
        [
          'a file the build no longer produces is caught',
          (dir) => writeFileSync(join(dir, 'assets/left-behind.js'), '// orphan\n'),
          'left-behind.js',
        ],
        [
          'a file missing from the published copy is caught',
          (dir) => rmSync(join(dir, 'assets/styles.css')),
          'styles.css',
        ],
      ];
      let proven = 0;
      for (const [label, mutate, fragment] of cases) {
        const copy = join(scratch, `copy-${proven}`);
        cpSync(published, copy, { recursive: true });
        mutate(copy);
        const found = differences(fresh, copy);
        const hit = found.some((line) => line.includes(fragment));
        if (hit) {
          console.log(`✓ ${label}`);
          proven += 1;
        } else {
          console.error(`✗ ${label}: nothing was reported about ${fragment}`);
          process.exitCode = 1;
        }
      }
      /**
       * And the direction that matters just as much: an unmutated copy must be
       * reported as clean. Without this, a checker that reports every file as
       * different would pass all three cases above.
       */
      const untouched = join(scratch, 'copy-clean');
      cpSync(published, untouched, { recursive: true });
      const noise = differences(fresh, untouched);
      if (noise.length === 0) console.log('✓ an untouched copy is reported clean');
      else {
        console.error(
          `✗ an untouched copy was reported as drifted, so the three cases above prove nothing:\n  ${noise.join('\n  ')}`,
        );
        process.exitCode = 1;
      }
    }

    if (drift.length > 0) {
      console.error(
        `apps/dashboard/public is not what this repository builds.\n  ${drift.join('\n  ')}\n\n` +
          'Run `node apps/web/build.mjs` and commit the result.',
      );
      process.exitCode = 1;
    } else {
      console.log(`✓ apps/dashboard/public matches a fresh build (${inventory(fresh).size} files)`);
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

if (import.meta.main) main();
