#!/usr/bin/env node
/**
 * On and after a guinea-pig's crossing, its evidence must be COMMITTED.
 *
 * Sep 20's most important evidence is a REFUSAL: the engine detects guinea-pig
 * B below threshold and the write guard declines. That produces no transaction,
 * no hash, and nothing an explorer will ever show — so
 * `check-evidence-hashes.mjs` is structurally blind to it. The mechanism that
 * enforces same-day indexing covers the routine case and not the one that
 * matters.
 *
 * And the Actions artifact is not evidence. `engine-run-…` is retained 90 days;
 * the grant submission is 2026-10-02 and the record has to outlive any
 * retention policy, GitHub's included. **An artifact is a log; a commit is
 * evidence.**
 *
 * So this is a DATE-TRIGGERED check. From the alert-threshold date onward it
 * fails until a committed run record exists showing the refusal. It cannot be
 * forgotten on the day, because the day is when it starts failing — and unlike
 * a reminder, it keeps failing.
 *
 * It is deliberately not satisfiable by a passing test or a note: it wants a
 * file in `docs/evidence/` containing a guard refusal for that contract.
 */
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { verifyCrossingCapture } from './verify-crossing-capture.mjs';
import process from 'node:process';
import console from 'node:console';

const ROOT = 'docs/evidence';

/**
 * Kept in step with `PROTECTED_ENTRIES` in `packages/core/src/write-guard.ts`.
 * Read from the TypeScript source rather than duplicated, so a date changed
 * there cannot silently diverge from the date enforced here — the same reason
 * the task-ID shape lives in one module.
 */
function protectedSubjects() {
  const src = readFileSync('packages/core/src/write-guard.ts', 'utf8');
  const out = [];
  const re =
    /contractId:\s*'(C[A-Z2-7]{55})',\s*label:\s*'([^']+)',[\s\S]*?alertThresholdOn:\s*'(\d{4}-\d{2}-\d{2})',\s*expiresOn:\s*'(\d{4}-\d{2}-\d{2})'/g;
  for (const m of src.matchAll(re)) {
    out.push({ contractId: m[1], label: m[2], alertThresholdOn: m[3], expiresOn: m[4] });
  }
  return out;
}

function jsonFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...jsonFiles(p));
    else if (name.endsWith('.json') || name.endsWith('.txt') || name.endsWith('.md')) out.push(p);
  }
  return out;
}

/**
 * This gate arms at the CROSSING INSTANT, not at midnight on the crossing date.
 *
 * MEASURED 2026-09-25T01:07Z. Guinea-pig C's `alertThresholdOn` is 2026-09-25
 * and its crossing is 12:00Z. A date-only comparison armed this check at 00:00Z,
 * so for TWELVE HOURS it demanded a capture that could not legitimately exist:
 * its own message says to run the probe *on or after* the crossing, and the
 * filter below rejects any directory dated before the threshold. Meanwhile
 * `check:crossing` sits inside `pnpm check`, which CI runs as the one required
 * status check — so every merge in the repository was blocked for half a day, on
 * the morning the release PR had to land ahead of a recording.
 *
 * This repository already names that failure, in `check-sow-completeness.mjs`:
 * *a guardrail that must be worked around to make progress gets worked around
 * once and then stays off.* Arming on the real event keeps every hour of genuine
 * enforcement and removes only the dead zone.
 *
 * Dates stay in `write-guard.ts` and times stay in `ops/crossing-schedule.json`,
 * which already owns `crossesAtUtc` as its single source of truth. Neither file
 * is written here — only read.
 *
 * FAIL CLOSED: a subject with no readable time falls back to midnight on its
 * threshold date, which is the stricter of the two behaviours, never the laxer.
 */
function crossingInstants() {
  const byContract = new Map();
  try {
    const schedule = JSON.parse(readFileSync('ops/crossing-schedule.json', 'utf8'));
    for (const watch of schedule.watches ?? []) {
      const id = watch.subject?.contractId;
      const at = Date.parse(watch.subject?.crossesAtUtc ?? '');
      if (id && !Number.isNaN(at)) byContract.set(id, at);
    }
  } catch {
    /* unreadable schedule → every subject falls back to midnight arming */
  }
  return byContract;
}
const CROSSINGS = crossingInstants();

/**
 * `EVERGREEN_TODAY` stays supported and keeps its meaning — "pretend it is this
 * day". A bare date is taken as the END of that day, so a subject whose
 * threshold is that date is armed, exactly as it was before this change. Pass a
 * full ISO timestamp to pin a moment inside the day instead.
 */
const override = process.env.EVERGREEN_TODAY;
const nowMs = override
  ? Date.parse(override.includes('T') ? override : `${override}T23:59:59Z`)
  : Date.now();
if (Number.isNaN(nowMs)) {
  console.error(`✖ EVERGREEN_TODAY is not a date or timestamp: ${override}`);
  process.exit(1);
}
const armedAt = (s) => CROSSINGS.get(s.contractId) ?? Date.parse(`${s.alertThresholdOn}T00:00:00Z`);
const subjects = protectedSubjects();
if (subjects.length === 0) {
  console.error('✖ could not read protected subjects from write-guard.ts — the pattern moved.');
  process.exit(1);
}

function captureRoot(file) {
  for (let dir = dirname(file); dir !== ROOT && dir.startsWith(ROOT); dir = dirname(dir)) {
    if (existsSync(join(dir, '.crossing-capture'))) return dir;
    if (existsSync(join(dir, 'manifest.json'))) {
      try {
        if (
          JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8')).captureFormat ===
          'evergreen-crossing-v1'
        )
          return dir;
      } catch {
        /* incomplete marked captures fail closed below */
      }
    }
  }
  return null;
}
const verified = new Map();
const files = jsonFiles(ROOT);
const failures = [];
for (const s of subjects) {
  if (nowMs < armedAt(s)) continue;
  const evidence = [];
  for (const f of files) {
    // The evidence must come FROM the crossing, not from a rehearsal of it.
    //
    // Added 2026-09-14, the same day it was needed: committing a rehearsal that
    // forced the refusal off-date (threshold raised so B became a candidate)
    // silently turned this check GREEN for 2026-09-20 while the real crossing
    // was still six days away. A gate that cannot tell a rehearsal from the
    // event is worse than no gate — it reports success for the one thing in this
    // sprint that cannot be re-run.
    //
    // Evidence directories are `docs/evidence/YYYY-MM-DD-…`, so the capture date
    // is in the path. Anything dated before the alert threshold is, by
    // definition, not a capture of that crossing.
    const dated = /(\d{4}-\d{2}-\d{2})/.exec(f.slice(ROOT.length));
    if (!dated || dated[1] < s.alertThresholdOn) continue;
    const bundle = captureRoot(f);
    if (bundle) {
      if (!verified.has(bundle)) {
        try {
          verified.set(bundle, await verifyCrossingCapture(bundle, { checkRuntime: false }));
        } catch {
          verified.set(bundle, null);
        }
      }
      const result = verified.get(bundle);
      if (
        f === join(bundle, 'manifest.json') &&
        result?.qualifiesCrossing &&
        result.subject === s.label.slice(-1) &&
        dated[1] === result.observedAt.slice(0, 10)
      )
        evidence.push(f);
      continue;
    }
    const text = readFileSync(f, 'utf8');
    if (/RAISED — rehearsal|rehearsal, not the real crossing/.test(text)) continue;
    if (text.includes(s.contractId) && /REFUSED BY WRITE GUARD/.test(text)) evidence.push(f);
  }
  if (evidence.length === 0) failures.push(s);
}

if (failures.length > 0) {
  console.error(`✖ crossing evidence missing for ${failures.length} protected subject(s):\n`);
  for (const s of failures) {
    console.error(`  ${s.label} (${s.contractId.slice(0, 10)}…)`);
    console.error(`    alert threshold ${s.alertThresholdOn} · EXPIRES ${s.expiresOn}`);
  }
  console.error(
    '\n  The engine detecting the crossing and the guard REFUSING is the evidence,\n' +
      '  and a refusal leaves no transaction, no hash and no explorer trace. The\n' +
      '  Actions artifact is a log, not evidence: it expires, and the submission is\n' +
      '  2026-10-02.\n\n' +
      '  Run `node scripts/b-crossing-probe.mjs` ON OR AFTER the crossing and COMMIT\n' +
      '  its output under docs/evidence/<date>/, including the "REFUSED BY WRITE\n' +
      '  GUARD" line and the contract ID. The scheduled cron CANNOT produce this:\n' +
      '  B is in _doNotWatch, which is documentation, so the engine never selects\n' +
      '  it and the guard is never consulted. See docs/SEP-20-PREFLIGHT.md §3.\n\n' +
      '  A directory dated before the alert threshold does not count, and neither\n' +
      '  does a rehearsal that raised the threshold to force candidacy.',
  );
  process.exit(1);
}
console.log(
  `✓ crossing evidence: nothing due yet, or committed for all ${subjects.length} protected subject(s)`,
);
