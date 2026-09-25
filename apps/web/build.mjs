/**
 * Build the twelve-page preview into `apps/dashboard/public`, which is the
 * directory the Cloudflare Pages project already publishes. Building there
 * gives this branch a preview deployment without touching the project's
 * settings, which production shares. Built files are committed on this branch
 * — fine for a prototype that never merges, and one more reason it never
 * merges.
 *
 * Static pages are rendered through the shared shell with data read from
 * committed sources at build time. Anything the build cannot find in the
 * source it names fails the build instead of shipping a stale copy.
 *
 * `node apps/web/build.mjs --commission` proves the write-path guard below can
 * fail, instead of assuming it.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  statSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { shell } from './src/chrome.mjs';
import { siteShell } from './src/site.mjs';
// Node 24 strips the types. The manifest is the dashboard package's own entry.
import { ROUTES, pageFor } from '../dashboard/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const out = join(repo, 'apps/dashboard/public');
const esbuild = createRequire(join(repo, 'packages/cli/package.json'))('esbuild');

/** Core's write path must never reach a read-only page. */
const FORBIDDEN = [
  'extend.ts',
  'extend-rpc.ts',
  'ed25519-signer.ts',
  'engine.ts',
  'engine-execution-plan.ts',
];

/** Measured 2026-09-10 against the live chain; restating it is not observing it. */
const CADENCE = { value: '5.000000 s ± 0.000050' };

function readJson(path) {
  return JSON.parse(readFileSync(join(here, path), 'utf8'));
}

/**
 * Where our own subjects actually ended, from `ops/crossing-schedule.json` —
 * which declares itself the single source of truth for the crossings.
 *
 * The chain cannot supply this: an archived entry reports `liveUntilLedgerSeq`
 * 0, so after expiry the ledger it ended at is unreadable from a scan. These
 * were measured before that happened. Nothing else may be shown as an end
 * ledger, which is why this reads from the schedule rather than a constant.
 */
function readKnownEnds() {
  const schedule = JSON.parse(readFileSync(join(repo, 'ops/crossing-schedule.json'), 'utf8'));
  const ends = {};
  for (const watch of schedule.watches ?? []) {
    const s = watch.subject;
    if (!s?.contractId) continue;
    ends[s.contractId] = {
      ...(typeof s.expiresAtLedger === 'number' ? { instance: s.expiresAtLedger } : {}),
      ...(typeof s.persistentExpiresAtLedger === 'number'
        ? { persistent: s.persistentExpiresAtLedger }
        : {}),
      // Date only. The closing record says the wall-clock crossing time is
      // "derived, and not observed", so no time of day is published here.
      ...(typeof s.expiresAtUtc === 'string' ? { endsOn: s.expiresAtUtc.slice(0, 10) } : {}),
      ...(typeof s.crossesAtUtc === 'string' ? { crossesOn: s.crossesAtUtc.slice(0, 10) } : {}),
      status: watch.status,
    };
  }
  if (Object.keys(ends).length === 0) {
    throw new Error(
      'ops/crossing-schedule.json yielded no subjects; expired entries would lose their end ledger',
    );
  }
  return ends;
}

function readGuard() {
  const src = readFileSync(join(repo, 'packages/core/src/write-guard.ts'), 'utf8');
  const alerts = [...src.matchAll(/alertThresholdOn: '(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
  const expiries = [...src.matchAll(/expiresOn: '(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
  const key = src.match(/SHARED_CODE_ENTRY_KEY = '([A-Za-z0-9+/=]+)'/)?.[1];
  if (alerts.length !== 2 || expiries.length !== 2 || !key) {
    throw new Error(
      'write-guard.ts moved under the web build: expected two alert dates, two expiries, one shared key',
    );
  }
  return {
    bAlert: alerts[0],
    bExpires: expiries[0],
    cAlert: alerts[1],
    cExpires: expiries[1],
    sharedKey: key,
  };
}

function readCli() {
  const command = readFileSync(join(repo, 'packages/cli/src/command.ts'), 'utf8');
  const usage = command.match(/const USAGE =\n?\s*'([^']+)'/)?.[1];
  const helpStart = command.indexOf('const HELP = ');
  const helpEnd = command.indexOf('`;', helpStart);
  if (!usage || helpStart < 0 || helpEnd < 0) {
    throw new Error('packages/cli/src/command.ts moved under the web build: USAGE/HELP not found');
  }
  const help = command
    .slice(helpStart, helpEnd)
    .replace(/^const HELP = `\$\{USAGE\}\n/, usage + '\n');
  for (const flag of [
    '--keys-file',
    '--no-data-keys',
    '--require-declared-scope',
    '--json',
    '--cost',
    '--optimize',
  ]) {
    if (!help.includes(flag))
      throw new Error(
        `CLI help no longer documents ${flag}; the /docs page would disagree with the tool`,
      );
  }
  const scan = readFileSync(join(repo, 'packages/cli/src/scan.ts'), 'utf8');
  const exits = {
    ok: scan.match(/EXIT_OK = (\d)/)?.[1],
    below: scan.match(/EXIT_BELOW_THRESHOLD = (\d)/)?.[1],
    error: scan.match(/EXIT_ERROR = (\d)/)?.[1],
    incomplete: scan.match(/EXIT_INCOMPLETE = (\d)/)?.[1],
  };
  if (exits.ok !== '0' || exits.below !== '1' || exits.error !== '2' || exits.incomplete !== '3') {
    throw new Error(
      'packages/cli/src/scan.ts moved under the web build: exit constants are not 0/1/2/3',
    );
  }
  /**
   * The package name and version the landing prints, read from the manifest
   * that was published rather than typed. A quickstart that names a version
   * nobody shipped is worse than no quickstart.
   */
  const manifest = JSON.parse(readFileSync(join(repo, 'packages/cli/package.json'), 'utf8'));
  if (!manifest.name || !manifest.version) {
    throw new Error('packages/cli/package.json has no name or version; the landing prints both');
  }
  return { help, exits, packageName: manifest.name, version: manifest.version };
}

const CAPTURE = 'docs/evidence/2026-09-12-w2-review/scan-a-human.txt';

const snapshot = readJson('data/snapshot.json');
const grades = readJson('data/snapshot-grades.json');
if (grades.capturedAt !== snapshot.capturedAt) {
  throw new Error(
    'data/snapshot-grades.json is not graded from data/snapshot.json — rerun scripts/grade-snapshot.mjs',
  );
}
const decay = readJson('data/decay.json');
const archival = readJson('data/archival.json');
const guard = readGuard();
const cli = readCli();
const knownEnds = readKnownEnds();

/**
 * Written rather than injected with esbuild's `define`.
 *
 * A `define` turned out to disable cross-module tree-shaking: the bundle went
 * from 6 core modules to 22 and pulled the entire write path in with it. The
 * write-path guard caught that, which is the whole reason it exists. A plain
 * JSON import tree-shakes normally and is typed.
 */
writeFileSync(join(here, 'data/known-ends.json'), `${JSON.stringify(knownEnds, null, 2)}\n`);
const evidence = {
  count: readdirSync(join(repo, 'docs/evidence'), { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  ).length,
};
if (evidence.count === 0)
  throw new Error('no evidence bundles found; the /evidence count would be a lie');

/**
 * The unretouched scan. Read here rather than pasted into a page so the file
 * under `docs/evidence/` stays the only copy — nobody edits that directory,
 * and a second copy in markup is a copy that can be tidied.
 */
const capture = {
  text: readFileSync(join(repo, CAPTURE), 'utf8').trimEnd(),
  provenance: `Captured on 2026-09-12 and committed at <span class="mono">${CAPTURE}</span>. Its ledger numbers are from that day; the dashboard reads the chain now.`,
};

/**
 * The hero artefact, if one has been dropped in.
 *
 * `apps/web/src/assets/hero.<ext>` plus `hero.txt` beside it — an image or an
 * mp4. Absent, the page renders the reserved slot and nothing else.
 *
 * The description is required rather than defaulted: a generic one on a file
 * nobody here has seen is a caption that is probably wrong, and a wrong one is
 * worse for a screen reader than the honest refusal to guess.
 *
 * A video also wants `hero-poster.jpg`. Without it the slot is the hero's own
 * green until the first frame decodes, and a visitor on a slow connection
 * opens the site on an empty rectangle.
 */
const HERO = /^hero\.(png|jpg|jpeg|webp|avif|svg|mp4)$/i;

function readHeroImage() {
  const dir = join(here, 'src/assets');
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).filter((name) => HERO.test(name));
  if (found.length === 0) return null;
  if (found.length > 1) {
    throw new Error(
      `apps/web/src/assets holds ${found.length} hero files: ${found.join(', ')} — keep one`,
    );
  }
  const altPath = join(dir, 'hero.txt');
  if (!existsSync(altPath)) {
    throw new Error(
      `${found[0]} has no description. Write one sentence describing it to ` +
        'apps/web/src/assets/hero.txt — the hero is the first thing on the site and it is not shipping undescribed.',
    );
  }
  const alt = readFileSync(altPath, 'utf8').trim();
  if (alt.length < 10) {
    throw new Error('apps/web/src/assets/hero.txt is empty or too short to describe the artefact');
  }
  const video = found[0].toLowerCase().endsWith('.mp4');
  const poster = video && existsSync(join(dir, 'hero-poster.jpg')) ? 'hero-poster.jpg' : null;
  // Optional, and genuinely optional: without it a phone simply downloads the
  // full file, which works and is only heavier.
  const small = video && existsSync(join(dir, 'hero-sm.mp4')) ? 'hero-sm.mp4' : null;
  if (video && !poster) {
    throw new Error(
      'hero.mp4 has no hero-poster.jpg beside it; the slot would be empty until the video decodes',
    );
  }
  /**
   * Cloudflare Pages refuses any single file over 25 MiB, and the whole site is
   * served from the committed build — so a file that is too large does not fail
   * loudly at deploy time, it fails as a hero that never loads.
   */
  const bytes = statSync(join(dir, found[0])).size;
  if (bytes > 20 * 1024 * 1024) {
    throw new Error(
      `${found[0]} is ${(bytes / 1048576).toFixed(1)} MB; Cloudflare Pages refuses files over 25 MiB. Re-encode it smaller.`,
    );
  }
  return {
    file: found[0],
    src: `/assets/${found[0]}`,
    alt,
    video,
    poster: poster ? `/assets/${poster}` : null,
    posterFile: poster,
    small: small ? `/assets/${small}` : null,
    smallFile: small,
    smallBytes: small ? statSync(join(dir, small)).size : 0,
    bytes,
  };
}

const heroImage = readHeroImage();

const ctx = {
  snapshot,
  snapshotLedger: Math.max(
    ...Object.values(snapshot.result.entries).map((e) => e.observedAtLedger),
  ),
  snapshotCapturedAt: snapshot.capturedAt,
  grades,
  decay,
  archival,
  guard,
  cli,
  evidence,
  knownEnds,
  capture,
  heroImage,
};

const PAGES = [
  { module: 'src/pages/landing.mjs', to: 'index.html' },
  {
    module: 'src/pages/overview.mjs',
    entry: 'src/pages/overview.ts',
    js: 'assets/overview.js',
    to: 'dashboard/index.html',
  },
  {
    module: 'src/pages/scanner.mjs',
    entry: 'src/pages/scanner.ts',
    js: 'assets/scanner.js',
    to: 'dashboard/scanner/index.html',
  },
  {
    module: 'src/pages/blast-radius.mjs',
    entry: 'src/pages/blast-radius.ts',
    js: 'assets/blast-radius.js',
    to: 'dashboard/blast-radius/index.html',
  },
  { module: 'src/pages/decay.mjs', to: 'dashboard/decay/index.html' },
  { module: 'src/pages/contracts.mjs', to: 'dashboard/contracts/index.html' },
  { module: 'src/pages/engine.mjs', to: 'dashboard/engine/index.html' },
  { module: 'src/pages/history.mjs', to: 'dashboard/history/index.html' },
  {
    module: 'src/pages/archival.mjs',
    entry: 'src/pages/archival.ts',
    js: 'assets/archival.js',
    to: 'docs/archival/index.html',
  },
  { module: 'src/pages/docs.mjs', to: 'docs/index.html' },
  { module: 'src/pages/evidence.mjs', to: 'evidence/index.html' },
  { module: 'src/pages/about.mjs', to: 'about/index.html' },
];

function guardBundle(metafile, label) {
  const included = Object.entries(metafile.outputs)
    .flatMap(([, o]) => Object.entries(o.inputs))
    .filter(([path, info]) => info.bytesInOutput > 0 && path.includes('packages/core/src/'))
    .map(([path]) => path.split('packages/core/src/')[1]);
  const breaches = included.filter((f) => FORBIDDEN.includes(f));
  if (breaches.length > 0) {
    throw new Error(
      `${label}: core's write path reached a read-only bundle: ${breaches.join(', ')}`,
    );
  }
  return included;
}

async function bundle(entry, js) {
  const result = await esbuild.build({
    entryPoints: [join(here, entry)],
    outfile: join(out, js),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    metafile: true,
    legalComments: 'none',
    nodePaths: [join(repo, 'node_modules')],
    logLevel: 'error',
  });
  return guardBundle(result.metafile, js);
}

async function buildPage(page) {
  const { meta, render } = await import(join(here, page.module));
  let coreModules = 0;
  if (page.entry) {
    const included = await bundle(page.entry, page.js);
    coreModules = included.length;
  }
  const render_shell = meta.layout === 'site' ? siteShell : shell;
  const html = render_shell({
    title: meta.title,
    description: meta.description,
    active: meta.active,
    navTone: meta.navTone,
    eyebrow: meta.eyebrow,
    heading: meta.heading,
    lead: meta.lead,
    body: render(ctx),
    script: page.entry ? `/${page.js}` : (meta.script ?? null),
    cadence: CADENCE,
  });
  const target = join(out, page.to);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
  console.log(
    `  ${page.to.padEnd(32)} ${page.entry ? `script, core modules: ${coreModules}` : 'static, no script'}`,
  );
}

async function commission() {
  const probe = join(here, '.commission-probe.ts');
  writeFileSync(probe, "export { planExtension } from '../../packages/core/src/index';\n");
  const result = await esbuild.build({
    entryPoints: [probe],
    outfile: join(here, '.commission-probe.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    metafile: true,
    write: false,
    nodePaths: [join(repo, 'node_modules')],
    logLevel: 'error',
  });
  try {
    guardBundle(result.metafile, 'probe');
    console.error(
      '✗ the write-path guard passed a bundle that imports planExtension — it guards nothing',
    );
    process.exitCode = 1;
  } catch (error) {
    console.log(`✓ the guard refuses a write-path bundle: ${error.message}`);
  } finally {
    // Throwaway. Left behind, it is linted as source.
    rmSync(probe, { force: true });
  }
}

console.log('building the twelve-page preview into apps/dashboard/public');
/**
 * Start from an empty directory. A previous build's orphan is worse than a
 * missing file: it keeps serving, it is committed, and nothing regenerates it
 * — a stale bundle pointed at an unreachable RPC survived one rebuild here
 * before this line existed.
 */
/**
 * Typecheck before emitting anything.
 *
 * `apps/web` had no tsconfig, so nothing ever typechecked it, and
 * `readStateArchivalSettings` — imported under an alias and then called by its
 * original name — shipped to the deployed preview. Every rent estimate threw a
 * ReferenceError, and the catch told the visitor the NETWORK had declined to
 * simulate. `tsc` names that in under a second.
 */
console.log('typechecking apps/web');
try {
  execFileSync('npx', ['tsc', '-p', join(here, 'tsconfig.json')], {
    cwd: repo,
    stdio: 'inherit',
  });
} catch {
  throw new Error('apps/web does not typecheck; refusing to build');
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const page of PAGES) {
  await buildPage(page);
}

// The shell's live-ledger script. No core, no SDK — one getHealth read.
await bundle('src/chrome-client.ts', 'assets/chrome.js');

mkdirSync(join(out, 'assets'), { recursive: true });
cpSync(join(here, 'src/styles.css'), join(out, 'assets/styles.css'));
cpSync(join(here, 'data/snapshot.json'), join(out, 'assets/snapshot.json'));
cpSync(join(here, 'data/archival.json'), join(out, 'assets/archival.json'));
if (heroImage) {
  for (const file of [heroImage.file, heroImage.posterFile, heroImage.smallFile].filter(Boolean)) {
    cpSync(join(here, 'src/assets', file), join(out, 'assets', file));
  }
  console.log(
    `  hero ${heroImage.video ? 'video' : 'image'}: ${heroImage.file} ` +
      `(${(heroImage.bytes / 1048576).toFixed(2)} MB)${heroImage.posterFile ? ` + ${heroImage.posterFile}` : ''}` +
      `${heroImage.smallFile ? ` + ${heroImage.smallFile} (${(heroImage.smallBytes / 1048576).toFixed(2)} MB)` : ''}`,
  );
}
/**
 * No rendered page may contain the residue of a lookup that did not resolve.
 *
 * `/dashboard/contracts` shipped "as of ledger NaN" and "expires ~NaN undefined
 * NaN" because a page read `grades.observedAtLedger`, which lives on each
 * grade rather than at the top level. Nothing asserted the lookup resolved, so
 * a typo became three rendered figures. This is that assertion.
 */
function guardRenderedPages() {
  const RESIDUE = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]/;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html')) {
        const match = RESIDUE.exec(readFileSync(path, 'utf8'));
        if (match) offenders.push(`${path.slice(out.length + 1)} contains ${match[0]}`);
      }
    }
  };
  walk(out);
  if (offenders.length > 0) {
    throw new Error(`rendered pages carry unresolved values:\n  ${offenders.join('\n  ')}`);
  }
}

guardRenderedPages();

/**
 * Every asset a rendered page points at must exist in the output.
 *
 * `hero-sm.mp4` was announced by this build's own log and never copied: the
 * line that copied it and the line that reported it were edited separately,
 * and only one of them landed. The page then asked a phone for a file that
 * was not there, the video failed with a format error, and NOTHING caught it
 * — not the route manifest, not the residue guard, not the overflow check,
 * because a 404 on a video is invisible to all three. The build log is not
 * evidence that a file was written; this is.
 */
function guardReferencedAssets() {
  const missing = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html')) {
        const html = readFileSync(path, 'utf8');
        for (const [, url] of html.matchAll(/(?:src|href|poster)="(\/assets\/[^"]+)"/g)) {
          if (!existsSync(join(out, url.slice(1)))) {
            missing.push(`${path.slice(out.length + 1)} references ${url}, which was not written`);
          }
        }
      }
    }
  };
  walk(out);
  if (missing.length > 0) {
    throw new Error(
      `rendered pages reference assets that do not exist:\n  ${missing.join('\n  ')}`,
    );
  }
}

guardReferencedAssets();

/**
 * The published routes and the route manifest must agree, in both directions.
 *
 * `apps/dashboard/src/index.ts` is the dashboard package's public surface and
 * the file the SOW completeness gate reads. Letting it drift from the build
 * would make it decoration; this makes it a claim that can be wrong.
 */
function guardRouteManifest() {
  const built = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'index.html') built.add(path.slice(out.length + 1));
    }
  };
  walk(out);
  const claimed = new Set(ROUTES.map((r) => pageFor(r.route)));
  const unclaimed = [...built].filter((p) => !claimed.has(p));
  const unbuilt = [...claimed].filter((p) => !built.has(p));
  if (unclaimed.length > 0 || unbuilt.length > 0) {
    throw new Error(
      'apps/dashboard/src/index.ts disagrees with what was built.' +
        (unbuilt.length > 0 ? `\n  claimed but not built: ${unbuilt.join(', ')}` : '') +
        (unclaimed.length > 0 ? `\n  built but not claimed: ${unclaimed.join(', ')}` : ''),
    );
  }
  console.log(`  routes: ${claimed.size} built and claimed`);
}

guardRouteManifest();

if (process.argv.includes('--commission')) await commission();
console.log('done');
