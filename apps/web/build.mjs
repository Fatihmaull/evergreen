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
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { shell } from './src/chrome.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const out = join(repo, 'apps/dashboard/public');
const esbuild = createRequire(join(repo, 'packages/cli/package.json'))('esbuild');

const BRANCH = 'feat/W4-D22-02a-full-prototype';

/** Core's write path must never reach a read-only page. */
const FORBIDDEN = ['extend.ts', 'extend-rpc.ts', 'ed25519-signer.ts', 'engine.ts', 'engine-execution-plan.ts'];

/** Measured 2026-09-10 against the live chain; restating it is not observing it. */
const CADENCE = { value: '5.000000 s ± 0.000050' };

function readJson(path) {
  return JSON.parse(readFileSync(join(here, path), 'utf8'));
}

function readGuard() {
  const src = readFileSync(join(repo, 'packages/core/src/write-guard.ts'), 'utf8');
  const alerts = [...src.matchAll(/alertThresholdOn: '(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
  const expiries = [...src.matchAll(/expiresOn: '(\d{4}-\d{2}-\d{2})'/g)].map((m) => m[1]);
  const key = src.match(/SHARED_CODE_ENTRY_KEY = '([A-Za-z0-9+/=]+)'/)?.[1];
  if (alerts.length !== 2 || expiries.length !== 2 || !key) {
    throw new Error('write-guard.ts moved under the web build: expected two alert dates, two expiries, one shared key');
  }
  return { bAlert: alerts[0], bExpires: expiries[0], cAlert: alerts[1], cExpires: expiries[1], sharedKey: key };
}

function readCli() {
  const command = readFileSync(join(repo, 'packages/cli/src/command.ts'), 'utf8');
  const usage = command.match(/const USAGE =\n?\s*'([^']+)'/)?.[1];
  const helpStart = command.indexOf('const HELP = ');
  const helpEnd = command.indexOf('`;', helpStart);
  if (!usage || helpStart < 0 || helpEnd < 0) {
    throw new Error('packages/cli/src/command.ts moved under the web build: USAGE/HELP not found');
  }
  const help = command.slice(helpStart, helpEnd).replace(/^const HELP = `\$\{USAGE\}\n/, usage + '\n');
  for (const flag of ['--keys-file', '--no-data-keys', '--require-declared-scope', '--json', '--cost', '--optimize']) {
    if (!help.includes(flag)) throw new Error(`CLI help no longer documents ${flag}; the /docs page would disagree with the tool`);
  }
  const scan = readFileSync(join(repo, 'packages/cli/src/scan.ts'), 'utf8');
  const exits = {
    ok: scan.match(/EXIT_OK = (\d)/)?.[1],
    below: scan.match(/EXIT_BELOW_THRESHOLD = (\d)/)?.[1],
    error: scan.match(/EXIT_ERROR = (\d)/)?.[1],
    incomplete: scan.match(/EXIT_INCOMPLETE = (\d)/)?.[1],
  };
  if (exits.ok !== '0' || exits.below !== '1' || exits.error !== '2' || exits.incomplete !== '3') {
    throw new Error('packages/cli/src/scan.ts moved under the web build: exit constants are not 0/1/2/3');
  }
  return { help, exits };
}

const snapshot = readJson('data/snapshot.json');
const grades = readJson('data/snapshot-grades.json');
if (grades.capturedAt !== snapshot.capturedAt) {
  throw new Error('data/snapshot-grades.json is not graded from data/snapshot.json — rerun scripts/grade-snapshot.mjs');
}
const decay = readJson('data/decay.json');
const archival = readJson('data/archival.json');
const guard = readGuard();
const cli = readCli();
const evidence = {
  count: readdirSync(join(repo, 'docs/evidence'), { withFileTypes: true }).filter((d) => d.isDirectory()).length,
};
if (evidence.count === 0) throw new Error('no evidence bundles found; the /evidence count would be a lie');

const ctx = {
  snapshot,
  snapshotLedger: Math.max(...Object.values(snapshot.result.entries).map((e) => e.observedAtLedger)),
  snapshotCapturedAt: snapshot.capturedAt,
  grades,
  decay,
  archival,
  guard,
  cli,
  evidence,
};

const PAGES = [
  { module: 'src/pages/overview.mjs', entry: 'src/pages/overview.ts', js: 'assets/overview.js', to: 'dashboard/index.html' },
  { module: 'src/pages/scanner.mjs', entry: 'src/pages/scanner.ts', js: 'assets/scanner.js', to: 'dashboard/scanner/index.html' },
  { module: 'src/pages/blast-radius.mjs', entry: 'src/pages/blast-radius.ts', js: 'assets/blast-radius.js', to: 'dashboard/blast-radius/index.html' },
  { module: 'src/pages/decay.mjs', to: 'dashboard/decay/index.html' },
  { module: 'src/pages/contracts.mjs', to: 'dashboard/contracts/index.html' },
  { module: 'src/pages/engine.mjs', to: 'dashboard/engine/index.html' },
  { module: 'src/pages/history.mjs', to: 'dashboard/history/index.html' },
  { module: 'src/pages/archival.mjs', entry: 'src/pages/archival.ts', js: 'assets/archival.js', to: 'docs/archival/index.html' },
  { module: 'src/pages/docs.mjs', to: 'docs/index.html' },
  { module: 'src/pages/evidence.mjs', to: 'evidence/index.html' },
  { module: 'src/pages/about.mjs', to: 'about/index.html' },
];

const CAPTURE = 'docs/evidence/2026-09-12-w2-review/scan-a-human.txt';

function escapeHtml(text) {
  return text.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c]);
}

function guardBundle(metafile, label) {
  const included = Object.entries(metafile.outputs)
    .flatMap(([, o]) => Object.entries(o.inputs))
    .filter(([path, info]) => info.bytesInOutput > 0 && path.includes('packages/core/src/'))
    .map(([path]) => path.split('packages/core/src/')[1]);
  const breaches = included.filter((f) => FORBIDDEN.includes(f));
  if (breaches.length > 0) {
    throw new Error(`${label}: core's write path reached a read-only bundle: ${breaches.join(', ')}`);
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
  const html = shell({
    title: meta.title,
    description: meta.description,
    active: meta.active,
    eyebrow: meta.eyebrow,
    heading: meta.heading,
    lead: meta.lead,
    body: render(ctx),
    script: page.entry ? `/${page.js}` : meta.script ?? null,
    cadence: CADENCE,
  });
  const target = join(out, page.to);
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, html);
  console.log(`  ${page.to.padEnd(32)} ${page.entry ? `script, core modules: ${coreModules}` : 'static, no script'}`);
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
    console.error('✗ the write-path guard passed a bundle that imports planExtension — it guards nothing');
    process.exitCode = 1;
  } catch (error) {
    console.log(`✓ the guard refuses a write-path bundle: ${error.message}`);
  }
}

console.log('building the twelve-page preview into apps/dashboard/public');
for (const page of PAGES) {
  await buildPage(page);
}

// The landing keeps its own layout: no sidebar, no script, works without JavaScript.
{
  let landing = readFileSync(join(here, 'src/pages/landing.html'), 'utf8');
  if (landing.includes('<!--TERMINAL_CAPTURE-->')) {
    const capture = readFileSync(join(repo, CAPTURE), 'utf8').trimEnd();
    landing = landing
      .replace('<!--TERMINAL_CAPTURE-->', escapeHtml(capture))
      .replace(
        '<!--TERMINAL_PROVENANCE-->',
        `Captured on 2026-09-12 and committed at <span class="mono">${CAPTURE}</span>. Its ledger numbers are from that day; the dashboard reads the chain now.`,
      );
  }
  landing = landing.replaceAll('feat/W4-D22-02-prototype', BRANCH);
  writeFileSync(join(out, 'index.html'), landing);
  console.log('  index.html                         static, no script');
}

// The shell's live-ledger script. No core, no SDK — one getHealth read.
await bundle('src/chrome-client.ts', 'assets/chrome.js');

mkdirSync(join(out, 'assets'), { recursive: true });
cpSync(join(here, 'src/styles.css'), join(out, 'assets/styles.css'));
cpSync(join(here, 'data/snapshot.json'), join(out, 'assets/snapshot.json'));
cpSync(join(here, 'data/archival.json'), join(out, 'assets/archival.json'));
if (process.argv.includes('--commission')) await commission();
console.log('done');
