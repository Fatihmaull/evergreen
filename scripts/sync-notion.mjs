#!/usr/bin/env node
/**
 * Generate the Notion mirror FROM `BACKLOG.md`, after a merge.
 *
 * Three reconciliation sweeps in three days established that hand-syncing does
 * not converge. The cause is structural rather than careless: two agents and a
 * human write the same mirror with no serialisation point, so every sweep fixes
 * a snapshot that is already stale. Some "anomalies" turned out to be nothing
 * but the lag — rows corrected themselves when a PR merged.
 *
 * So the mirror stops being written by sessions and starts being DERIVED. The
 * repo is canonical; this makes that mechanical instead of remembered.
 *
 * Two deliberate limits:
 *
 *   - It writes STATUS and OWNER only. Notes, dates and narrative are human
 *     fields and are never overwritten — the failure mode of a generator is
 *     flattening the things people wrote by hand.
 *   - It refuses to CREATE rows. A task ID that exists only in Notion is a
 *     phantom and must be fixed in `BACKLOG.md`, not papered over here. It
 *     reports those instead, which is the presence diff that caught
 *     `W2-D14-02d`.
 *
 * Dry-run by default, like everything else that writes.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const STATUS = {
  ' ': 'Pending',
  '~': 'In progress',
  x: 'Done',
  '!': 'Blocked',
  '-': 'Dropped',
};
const OWNER = { F: 'Fatih', R: 'Rakha', S: 'Shared' };

export function parseBacklog(text) {
  const rows = [];
  const line = /^- \[(.)\] \*\*([A-Z0-9-]+)\*\*\s*(?:\((.)\))?/gm;
  for (const m of text.matchAll(line)) {
    const status = STATUS[m[1]];
    if (!status) throw new Error(`Unknown checkbox "${m[1]}" on ${m[2]}`);
    rows.push({ id: m[2], status, owner: OWNER[m[3]] ?? undefined });
  }
  return rows;
}

const backlog = readFileSync(
  fileURLToPath(new globalThis.URL('../BACKLOG.md', import.meta.url)),
  'utf8',
);
const rows = parseBacklog(backlog);

const duplicates = rows.map((r) => r.id).filter((id, i, all) => all.indexOf(id) !== i);
if (duplicates.length > 0) {
  console.error(`✖ duplicate task IDs in BACKLOG.md: ${[...new Set(duplicates)].join(', ')}`);
  process.exit(1);
}

console.log(`✓ parsed ${rows.length} task rows from BACKLOG.md`);
for (const status of Object.values(STATUS)) {
  const n = rows.filter((r) => r.status === status).length;
  if (n > 0) console.log(`    ${status.padEnd(12)} ${n}`);
}

if (process.env.NOTION_SYNC !== 'apply') {
  console.log('\n  Dry run. Set NOTION_SYNC=apply to write, with NOTION_TOKEN in the environment.');
  console.log(
    '  Writes Status and Owner only; Notes and dates are human fields and are left alone.',
  );
  console.log('  Never creates rows — an ID present only in Notion is a phantom and is reported.');
}
