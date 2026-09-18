/**
 * Freeze one real scan of our three contracts as the dashboard's fallback.
 *
 * Read-only: `getNetwork` and `getLedgerEntries`, nothing signed or submitted.
 * The file records the ledger it was read at, and the dashboard says so rather
 * than presenting it as current.
 */
import { createRequire } from 'node:module';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import console from 'node:console';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const repo = join(web, '../..');
const esbuild = createRequire(join(repo, 'packages/cli/package.json'))('esbuild');

const entry = `
import { connectTestnet, scanContracts } from ${JSON.stringify(join(repo, 'packages/core/src/index'))};
const IDS = [
  'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L',
  'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ',
  'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL',
];
const reader = await connectTestnet('https://soroban-testnet.stellar.org');
const result = await scanContracts(reader, IDS.map((id) => ({ contract: { id } })));
console.log(JSON.stringify({ capturedAt: new Date().toISOString(), result }));
`;

const bundle = join(web, '.snapshot-entry.mjs');
await esbuild.build({
  stdin: { contents: entry, resolveDir: web, loader: 'ts' },
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  nodePaths: [join(repo, 'node_modules')],
  logLevel: 'error',
});

const json = execFileSync('node', [bundle], { encoding: 'utf8', timeout: 120_000 });
const parsed = JSON.parse(json);
const entryCount = Object.keys(parsed.result.entries).length;
if (entryCount === 0) throw new Error('refusing to write an empty snapshot');

mkdirSync(join(web, 'data'), { recursive: true });
writeFileSync(join(web, 'data/snapshot.json'), `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`snapshot written: ${entryCount} entries, captured ${parsed.capturedAt}`);
