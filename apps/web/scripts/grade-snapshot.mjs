/**
 * Grade the committed snapshot with core's own health rules, so static pages
 * can state health without re-deriving it. Reads data/snapshot.json, writes
 * data/snapshot-grades.json. Fails when the snapshot moves and this does not
 * follow — run it after make-snapshot.mjs.
 */
import { createRequire } from 'node:module';
import { writeFileSync, rmSync } from 'node:fs';
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
  // Carry isExpired and core's reason, not just the health word. Without them a
  // static page cannot tell "critical because low" from "critical because it is
  // already archived", and renders the archived entry's endsAt 0 as a date.
  const assessed = entries.map(([key, e]) => { const a = assessEntryWithThresholds(e, thresholds); return { key, health: a.health, isExpired: a.isExpired, reason: a.reason, endBehavior: e.endBehavior, endsAt: a.isExpired || e.ttl.status !== 'known' ? null : e.ttl.endsAtLedger, remaining: a.isExpired || e.ttl.status !== 'known' ? null : e.ttl.remainingLedgers, kind: e.kind, observedAtLedger: e.observedAtLedger }; });
  const expired = assessed.filter((a) => a.isExpired);
  const live = assessed.filter((a) => !a.isExpired && a.endsAt !== null);
  // Expired binds absolutely; among live, the earliest.
  const binding = expired.length > 0 ? expired[0] : live.length > 0 ? live.reduce((a, b) => (a.endsAt <= b.endsAt ? a : b)) : null;
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

// The bundle is a throwaway. Leaving it behind put a 48,000-line minified file
// in the working tree, where `pnpm lint` read it and reported 132 problems
// about code nobody wrote — and a stray `git add -A` from another branch swept
// it into a pull request.
rmSync(bundle, { force: true });
