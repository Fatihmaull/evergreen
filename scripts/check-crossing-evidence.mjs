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
import { join } from 'node:path';
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

const today = process.env.EVERGREEN_TODAY ?? new Date().toISOString().slice(0, 10);
const subjects = protectedSubjects();
if (subjects.length === 0) {
  console.error('✖ could not read protected subjects from write-guard.ts — the pattern moved.');
  process.exit(1);
}

const files = jsonFiles(ROOT);
const failures = [];
for (const s of subjects) {
  if (today < s.alertThresholdOn) continue;
  const evidence = files.filter((f) => {
    const text = readFileSync(f, 'utf8');
    return text.includes(s.contractId) && /REFUSED BY WRITE GUARD/.test(text);
  });
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
      '  Download the engine-cron run record from the crossing and COMMIT it under\n' +
      '  docs/evidence/, including the "REFUSED BY WRITE GUARD" line and the\n' +
      '  contract ID. This check stays red until that file exists.',
  );
  process.exit(1);
}
console.log(
  `✓ crossing evidence: nothing due yet, or committed for all ${subjects.length} protected subject(s)`,
);
