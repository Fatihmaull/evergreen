/**
 * Build the prototype into `apps/dashboard/public`, which is the directory the
 * Cloudflare Pages project already publishes. Building there means a branch gets
 * a preview deployment without touching the project's settings, which production
 * shares. It also means built files are committed on this branch — fine for a
 * prototype that never merges, and one more reason it never merges.
 *
 * `node apps/web/build.mjs --commission` proves the write-path guard below can
 * fail, instead of assuming it.
 */
import { createRequire } from 'node:module';
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
const out = join(repo, 'apps/dashboard/public');
const esbuild = createRequire(join(repo, 'packages/cli/package.json'))('esbuild');

/** Core's write path must never reach a read-only page. */
const FORBIDDEN = ['extend.ts', 'extend-rpc.ts', 'ed25519-signer.ts', 'engine.ts', 'engine-execution-plan.ts'];

const PAGES = [
  { entry: 'src/pages/dashboard.ts', js: 'assets/dashboard.js', html: 'src/pages/dashboard.html', to: 'dashboard/index.html' },
  { entry: 'src/pages/blast-radius.ts', js: 'assets/blast-radius.js', html: 'src/pages/blast-radius.html', to: 'dashboard/blast-radius/index.html' },
  { entry: 'src/pages/landing.ts', js: 'assets/landing.js', html: 'src/pages/landing.html', to: 'index.html', optional: true },
];

function writePage(htmlFrom, to) {
  const target = join(out, to);
  mkdirSync(dirname(target), { recursive: true });
  cpSync(join(here, htmlFrom), target);
}

function guard(metafile, label) {
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

async function buildPage(page) {
  const result = await esbuild.build({
    entryPoints: [join(here, page.entry)],
    outfile: join(out, page.js),
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
  const included = guard(result.metafile, page.js);
  writePage(page.html, page.to);
  const bytes = Object.values(result.metafile.outputs)[0]?.bytes ?? 0;
  console.log(`  ${page.to.padEnd(32)} ${(bytes / 1024).toFixed(0)} KB  · core modules: ${included.length}`);
}

async function commission() {
  // The guard must fail on a bundle that does reach the write path.
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
    guard(result.metafile, 'probe');
    console.error('✗ the write-path guard passed a bundle that imports planExtension — it guards nothing');
    process.exitCode = 1;
  } catch (error) {
    console.log(`✓ the guard refuses a write-path bundle: ${error.message}`);
  }
}

console.log('building the prototype into apps/dashboard/public');
for (const page of PAGES) {
  if (page.optional && !existsSync(join(here, page.entry))) continue;
  await buildPage(page);
}
mkdirSync(join(out, 'assets'), { recursive: true });
cpSync(join(here, 'src/styles.css'), join(out, 'assets/styles.css'));
if (existsSync(join(here, 'data/snapshot.json'))) {
  cpSync(join(here, 'data/snapshot.json'), join(out, 'assets/snapshot.json'));
} else {
  console.log('  (no snapshot yet — run node apps/web/scripts/make-snapshot.mjs)');
}
if (process.argv.includes('--commission')) await commission();
console.log('done');
