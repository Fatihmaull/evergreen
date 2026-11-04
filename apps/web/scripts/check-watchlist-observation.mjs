/**
 * PH2-E3-02: the five things to look at once the first engine observation
 * lands (docs/PH2-E3-LOGIN-CHECKLIST.md, "Step 7, second look"), printed as
 * pass / fail / undetermined. Read-only: it reads a file or stdin, takes one
 * testnet scan per observed contract, and does one GET of /api/v1/health.
 * It signs nothing and sends nothing.
 *
 *   1. open https://evergreen-stellar.pages.dev/api/v1/watchlist while signed in
 *   2. select all, copy
 *   3. pbpaste | node apps/web/scripts/check-watchlist-observation.mjs
 *
 * The JSON holds your watch items and contract ids, no session secret. It says
 * what the page WOULD render for that JSON (it runs the page's own `rowFor` and
 * `rowHtml`); it is not a screenshot, and the screenshot with the address bar
 * showing stays the evidence.
 *
 * Exit: 0 every line passes, 1 any line fails, 2 undetermined or nothing to check.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync, rmSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const repo = join(web, '../..');
const esbuild = createRequire(join(repo, 'packages/cli/package.json'))('esbuild');

const HEALTH_URL =
  process.env.EVERGREEN_HEALTH_URL ?? 'https://evergreen-stellar.pages.dev/api/v1/health';

function fail(message) {
  console.log(`INPUT: ${message}`);
  console.log('RESULT: undetermined (nothing was checked)');
  process.exit(2);
}

// --- input -------------------------------------------------------------
const arg = process.argv[2];
const raw = arg ? readFileSync(arg, 'utf8') : readFileSync(0, 'utf8');
if (raw.trim() === '') fail('empty. Copy the page at /api/v1/watchlist first.');
let json;
try {
  json = JSON.parse(raw);
} catch {
  fail(`not JSON (starts "${raw.trim().slice(0, 60)}"). Copy the whole page.`);
}
if (json?.error)
  fail(`the API answered ${json.error.code ?? 'an error'}. Sign in, then copy the page again.`);
const items = Array.isArray(json) ? json : json?.items;
if (!Array.isArray(items)) fail('no "items" array in it. This is not a GET /watchlist answer.');

// --- the page's own code, bundled for Node ------------------------------
const out = mkdtempSync(join(tmpdir(), 'e3-02-'));
const file = join(out, 'capture.mjs');
try {
  const built = await esbuild.build({
    stdin: {
      contents: `
        export { captureItem, verdict, bindingFromScan } from './lib/watchlist-capture';
        export { scanOne } from './lib/evergreen';
      `,
      resolveDir: join(web, 'src'),
      loader: 'ts',
    },
    bundle: true,
    write: false,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    define: { __EVERGREEN_NETWORK__: 'undefined', __EVERGREEN_WEB_RPC_URL__: 'undefined' },
    banner: {
      js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);",
    },
    logLevel: 'silent',
  });
  writeFileSync(file, built.outputFiles[0].text);
  const { captureItem, verdict, bindingFromScan, scanOne } = await import(pathToFileURL(file).href);

  const now = new Date();
  const reports = [];
  for (const item of items) {
    if (item.network !== 'testnet') {
      console.log(`SKIP ${item.contractId}: network ${item.network}, not testnet.`);
      continue;
    }
    let live;
    if (item.lastObservation) {
      try {
        const keys = item.scope && 'dataKeys' in item.scope ? item.scope.dataKeys.map(String) : [];
        live = { binding: bindingFromScan(await scanOne(item.contractId, keys), new Date()) };
      } catch (error) {
        live = { error: error instanceof Error ? error.message : String(error) };
      }
    }
    reports.push(captureItem(item, now, live));
  }

  let health = 'undetermined (the health read did not answer)';
  try {
    const r = await globalThis.fetch(HEALTH_URL);
    const body = await r.json();
    if (typeof body?.commit === 'string') health = body.commit;
  } catch {
    // stays undetermined
  }

  console.log(`CHECKED AT: ${now.toISOString()}`);
  console.log(`API HEALTH COMMIT: ${health}`);
  for (const r of reports) {
    console.log(`\nCONTRACT: ${r.contractId}${r.observed ? '' : '  (no engine observation yet)'}`);
    for (const l of r.lines)
      console.log(`  ${l.n}. [${l.status.toUpperCase()}] ${l.label}: ${l.detail}`);
  }
  const v = verdict(reports);
  const words = {
    'ready-pass':
      'all five pass on every observed row. Take the screenshot (address bar showing) and record the commit above.',
    fail: 'at least one line FAILS. Send this output and the WIB time. Do not close PH2-E3-02.',
    undetermined:
      'no line fails, but at least one is undetermined. Read it before closing PH2-E3-02.',
    'not-time': 'no row has an engine observation yet. Not time to close PH2-E3-02.',
  };
  console.log(`\nRESULT: ${v}: ${words[v]}`);
  process.exitCode = v === 'ready-pass' ? 0 : v === 'fail' ? 1 : 2;
} finally {
  rmSync(out, { recursive: true, force: true });
}
