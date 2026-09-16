#!/usr/bin/env node
/**
 * The B crossing watch schedule has exactly ONE source: ops/crossing-schedule.json.
 * Every table in docs/ that names a time, an owner or a trigger is generated from it.
 *
 * Why this exists
 * ---------------
 * On 2026-09-16 the schedule was restated in four documents and they gave **three
 * different answers**. Two operational pages — the ones an operator opens on the
 * day — said "Fatih remains primary operator; Rakha is the backup", the inverse of
 * what had actually been agreed in #104.
 *
 * The mechanism is not carelessness. A summary table restating the sections below
 * it is a second source of truth, and whoever edits a section has no reason to
 * scroll up. It had already failed once, inside SEP-20-PREFLIGHT.md itself: a §5b
 * was added saying Rakha, while the handoff table three screens above still said
 * Fatih. Caught by review, on the one document where "who is watching" has a date
 * attached.
 *
 * So the table is no longer written by hand. Prose sections explain *why*; they
 * must not restate who or when.
 *
 * Usage
 * -----
 *   node scripts/render-crossing-schedule.mjs            # rewrite the blocks
 *   node scripts/render-crossing-schedule.mjs --check    # fail if any block is stale
 *
 * ADDING A BLOCK TO A DOCUMENT: paste the marker pair below and run the renderer.
 * Targets are discovered by scanning for the marker, so a new document cannot be
 * forgotten — but equally, a block deleted from a document is simply not rendered.
 *
 *   <!-- BEGIN GENERATED: crossing-schedule (full) -->
 *   <!-- END GENERATED: crossing-schedule -->
 *
 * Commissioned 2026-09-16 — this check was watched failing before it was trusted,
 * because no check script in this repo has a unit test and a silent pass here would
 * restore exactly the drift it exists to prevent:
 *
 *   hand-edit a rendered cell (12:20 -> 13:00 UTC)   -> exit 1, names the doc
 *   change the JSON and skip the re-render           -> exit 1, names 3 stale docs
 *                                                       (the compact block correctly
 *                                                        unaffected — it omits triggers)
 *   delete an END marker                             -> exit 1, names the marker
 *   restore all three                                -> exit 0
 *
 * Variants: `full` (table, trigger rule, pending slots, declined slots) and
 * `compact` (capture times only, for prose that just needs the sequence).
 */

import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const SOURCE = 'ops/crossing-schedule.json';
const ROOTS = ['docs', 'ops'];
const BEGIN = /<!-- BEGIN GENERATED: crossing-schedule \((\w+)\) -->/;
const END = '<!-- END GENERATED: crossing-schedule -->';

const schedule = JSON.parse(readFileSync(SOURCE, 'utf8'));
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const n = (value) => value.toLocaleString('en-US');

/** UTC+7, computed rather than formatted, so no ambient timezone or locale leaks in. */
function wib(utcIso) {
  const at = new Date(utcIso.replace(/Z$/, ':00Z'));
  if (Number.isNaN(at.getTime())) throw Error(`Unparseable checkpoint time: ${utcIso}`);
  const shifted = new Date(at.getTime() + 7 * 3600 * 1000);
  const hh = String(shifted.getUTCHours()).padStart(2, '0');
  return `${DAYS[shifted.getUTCDay()]} ${hh}:${String(shifted.getUTCMinutes()).padStart(2, '0')}`;
}

function utcLabel(utcIso) {
  const at = new Date(utcIso.replace(/Z$/, ':00Z'));
  const hh = String(at.getUTCHours()).padStart(2, '0');
  const mm = String(at.getUTCMinutes()).padStart(2, '0');
  return `${DAYS[at.getUTCDay()]} ${utcIso.slice(0, 10)} ${hh}:${mm}`;
}

function trigger(utcIso) {
  const at = new Date(utcIso.replace(/Z$/, ':00Z'));
  return `${String(at.getUTCHours()).padStart(2, '0')}:${String(schedule.backupTriggerMinutePastHour).padStart(2, '0')} UTC`;
}

function remaining(cp) {
  const left =
    schedule.subject.actionThresholdLedgers - cp.hoursAfterCrossing * schedule.ledgersPerHour;
  if (left < 0) throw Error(`Checkpoint ${cp.utc} is past expiry (${left} ledgers)`);
  return left;
}

function renderFull() {
  const out = [];
  out.push(
    `**${schedule.subject.label} is below its action threshold for ${schedule.checkpoints.at(-1).hoursAfterCrossing} hours** — from ~${schedule.subject.crossesAtUtc.replace('T', ' ').replace('Z', ' UTC')} to ~${schedule.subject.expiresAtUtc.replace('T', ' ').replace('Z', ' UTC')}. Four captures across that window give a decay curve rather than two endpoints.`,
    '',
    '| Time (UTC) | WIB | B remaining | What it is | Primary | Backup — runs it if nothing is committed by |',
    '|---|---|---|---|---|---|',
  );
  for (const cp of schedule.checkpoints) {
    const pending = cp.status === 'requested';
    const mark = pending ? ' ❓' : '';
    const primary = pending ? `**${cp.primary}** — *unconfirmed*` : `**${cp.primary}**`;
    out.push(
      `| **${utcLabel(cp.utc)}**${mark} | ${wib(cp.utc)} | ${n(remaining(cp))} | ${cp.what} | ${primary} | ${cp.backup}, ${trigger(cp.utc)} |`,
    );
  }
  out.push(
    '',
    '### The backup trigger is a wall clock, not a judgement',
    '',
    `> **If no capture for that window is committed by the time in the last column, the backup runs it.** Not *"if it looks like it did not happen."*`,
    '',
    '**Being backup still means being present.** The backup has to look at that time to know whether to act. It reduces the precision required, not the attendance — two people on one task is how a task gets done zero times, and redundancy only works when the roles differ and the handover has a clock on it.',
  );

  const pending = schedule.checkpoints.filter((cp) => cp.status === 'requested');
  if (pending.length > 0) {
    out.push(
      '',
      `### ❓ ${pending.length} slot(s) are REQUESTED, not assigned — this table does not yet claim coverage`,
      '',
      'Assigning someone work they have already declined, through an issue comment, is how it does not get done — and finding that out on the day is finding it out too late. So these were asked as a request, with a yes or a no wanted on **each one separately**:',
      '',
    );
    for (const cp of pending) {
      const fb = cp.ifDeclined;
      out.push(
        `- **${utcLabel(cp.utc)} / ${wib(cp.utc)} WIB** — asked of ${cp.primary} in ${cp.requestedIn}. ${cp.note ?? ''}`,
        `  **If declined:** primary reverts to **${fb.primary}**, with ${fb.backup} as backup at ${trigger(cp.utc)}. Stated up front so a "no" needs no second round trip.`,
      );
    }
  }

  if (schedule.declined?.length > 0) {
    out.push('', '### Deliberately declined', '');
    for (const d of schedule.declined)
      out.push(
        `- **${utcLabel(d.utc)} / ${wib(d.utc)} WIB** — declined ${d.decidedOn}. ${d.reason}`,
      );
    out.push(
      '',
      'Recorded rather than omitted: a slot that is simply missing reads as an oversight, and the next person re-proposes it.',
    );
  }
  return out.join('\n');
}

function renderCompact() {
  const times = schedule.checkpoints.map(
    (cp) => `${utcLabel(cp.utc).slice(4)} (${n(remaining(cp))} left)`,
  );
  return `${schedule.checkpoints.length} captures — ${times.join(' → ')} — each showing ${schedule.subject.label} closer to expiry with the guard refusing every time.`;
}

const VARIANTS = { full: renderFull, compact: renderCompact };

function markdownFiles(dir) {
  const found = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      if (name === 'evidence' || name === 'node_modules') continue;
      found.push(...markdownFiles(path));
    } else if (name.endsWith('.md')) found.push(path);
  }
  return found;
}

const check = process.argv.includes('--check');
const stale = [];
let rendered = 0;
let files = 0;

for (const root of ROOTS)
  for (const file of markdownFiles(root)) {
    const before = readFileSync(file, 'utf8');
    if (!BEGIN.test(before)) continue;
    files += 1;
    let after = before;
    let cursor = 0;
    for (;;) {
      const rest = after.slice(cursor);
      const open = rest.match(BEGIN);
      if (!open) break;
      const variant = open[1];
      if (!VARIANTS[variant]) {
        console.error(`✖ ${file}: unknown crossing-schedule variant "${variant}"`);
        process.exit(1);
      }
      const startsAt = cursor + open.index + open[0].length;
      const endsAt = after.indexOf(END, startsAt);
      if (endsAt === -1) {
        console.error(`✖ ${file}: BEGIN marker for "${variant}" has no matching END marker`);
        process.exit(1);
      }
      const body = `\n\n${VARIANTS[variant]()}\n\n`;
      after = after.slice(0, startsAt) + body + after.slice(endsAt);
      cursor = startsAt + body.length + END.length;
      rendered += 1;
    }
    if (after === before) continue;
    if (check) stale.push(file);
    else writeFileSync(file, after);
  }

if (files === 0) {
  console.error(`✖ no document contains a crossing-schedule marker. The schedule in ${SOURCE}`);
  console.error('  is being maintained and rendered nowhere, which is worse than not having it.');
  process.exit(1);
}

if (check && stale.length > 0) {
  console.error(`\n✖ ${stale.length} generated crossing-schedule block(s) are stale:\n`);
  for (const file of stale) console.error(`  ${file}`);
  console.error(
    `\n  These tables are generated from ${SOURCE}. Do not edit them by hand —\n` +
      '  run `node scripts/render-crossing-schedule.mjs` and commit the result.\n' +
      '  If the schedule itself changed, change it there and re-render.\n',
  );
  process.exit(1);
}

console.log(
  check
    ? `✓ ${rendered} crossing-schedule block(s) across ${files} doc(s) match ${SOURCE}`
    : `✓ rendered ${rendered} crossing-schedule block(s) across ${files} doc(s)`,
);
