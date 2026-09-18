/**
 * Grade the committed snapshot with core's own health rules, so static pages
 * can state health without re-deriving it. Reads data/snapshot.json, writes
 * data/snapshot-grades.json. Fails when the snapshot moves and this does not
 * follow — run it after make-snapshot.mjs.
 */
import { createRequire } from 'node:module';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import console from 'node:console';

const here = dirname(fileURLToPath(import.meta.url));
const web = join(here, '..');
const repo = join(web, '../..');
const esbuild = createRequire(join(repo, 'packages/cli/package.json'))('esbuild');

const entry = `
import { assessEntryWithThresholds, resolveHealthThresholds, worstHealth, DEFAULT_CRITICAL_LEDGERS } from ${JSON.stringify(join(repo, 'packages/core/src/index'))};
import { readFileSync } from 'node:fs';
const snapshot = JSON.parse(readFileSync(${JSON.stringify(join(web, 'data/snapshot.json'))}, 'utf8'));
const thresholds = resolveHealthThresholds({ bumpWhenRemainingLedgersBelow: DEFAULT_CRITICAL_LEDGERS });
const out = {};
for (const contract of snapshot.result.contracts) {
  const entries = Object.entries(snapshot.result.entries).filter(([, e]) => e.contracts.includes(contract.id));
  const assessed = entries.map(([key, e]) => ({ key, health: assessEntryWithThresholds(e, thresholds).health, endsAt: e.ttl.status === 'known' ? e.ttl.endsAtLedger : null, remaining: e.ttl.status === 'known' ? e.ttl.remainingLedgers : null, kind: e.kind }));
  const known = assessed.filter((a) => a.endsAt !== null);
  const binding = known.length > 0 ? known.reduce((a, b) => (a.endsAt <= b.endsAt ? a : b)) : null;
  out[contract.id] = {
    worst: worstHealth(entries.map(([ , e]) => assessEntryWithThresholds(e, thresholds))),
    binding,
    observedAtLedger: Math.max(...entries.map(([ , e]) => e.observedAtLedger)),
  };
}
console.log(JSON.stringify({ capturedAt: snapshot.capturedAt, thresholds: { warnBelowLedgers: thresholds.warnBelowLedgers, criticalBelowLedgers: thresholds.criticalBelowLedgers }, grades: out }));
`;

const bundle = join(web, '.grade-entry.mjs');
await esbuild.build({
  stdin: { contents: entry, resolveDir: web, loader: 'ts' },
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'esm',
  nodePaths: [join(repo, 'node_modules')],
  logLevel: 'error',
});

const json = execFileSync('node', [bundle], { encoding: 'utf8', timeout: 60_000 });
const parsed = JSON.parse(json);
if (Object.keys(parsed.grades).length === 0) throw new Error('refusing to write empty grades');
writeFileSync(join(web, 'data/snapshot-grades.json'), `${JSON.stringify(parsed, null, 2)}\n`);
console.log(`grades written for ${Object.keys(parsed.grades).length} contracts`);
