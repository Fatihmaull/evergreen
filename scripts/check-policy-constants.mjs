#!/usr/bin/env node
/**
 * Pin policy constants that are copied ACROSS a language boundary.
 *
 * `eslint.config.js` makes the TTL threshold comparison unwritable outside
 * `packages/core/src/ttl.ts`. That rule cannot reach Python, and
 * `scripts/check-decay-drift.py` restates two values it does not own:
 *
 *   THRESHOLD_LEDGERS   - owned by evergreen.config.example.json
 *   SECONDS_PER_LEDGER  - owned by packages/core/src/ttl.ts
 *
 * A comment saying "matches evergreen.config.example.json" is documented
 * intent, not an enforced link. The drift check is what watches guinea-pigs B
 * and C twice a week — the two contracts carrying the most important evidence
 * in the grant — so a silent divergence there would move the projected
 * crossing dates for the proof itself.
 *
 * Same family as the `exitCodeFor` divergence, one language over. See
 * docs/CONVENTIONS.md § One home for a policy.
 */
import { readFileSync } from 'node:fs';
// Explicit imports rather than ambient globals — matches the other checkers
// and keeps `js.configs.recommended` applicable to scripts without a
// globals carve-out that would also relax real code.
import process from 'node:process';
import console from 'node:console';

const read = (p) => readFileSync(new globalThis.URL(`../${p}`, import.meta.url), 'utf8');

const missing = [];

/**
 * Extract a numeric constant. A RENAMED constant must fail loudly: the check
 * would otherwise stop matching and pass silently, which is the divergent-ID
 * failure — a guard that quietly stops guarding rather than erroring.
 * Collected rather than thrown, so the operator gets a readable report instead
 * of a stack trace.
 */
function pick(source, label, where, pattern) {
  const match = pattern.exec(source);
  if (!match) {
    missing.push(
      `${label} not found in ${where} — renamed? The check cannot verify what it cannot find.`,
    );
    return undefined;
  }
  return Number(match[1].replace(/_/g, ''));
}

const config = JSON.parse(read('evergreen.config.example.json'));
const ttl = read('packages/core/src/ttl.ts');
const drift = read('scripts/check-decay-drift.py');
const health = read('packages/core/src/health.ts');
const cliScan = read('packages/cli/src/scan.ts');

const owners = {
  thresholdLedgers: {
    value: config.defaults?.bumpWhenRemainingLedgersBelow,
    owner: 'evergreen.config.example.json → defaults.bumpWhenRemainingLedgersBelow',
  },
  secondsPerLedger: {
    value: pick(
      ttl,
      'SECONDS_PER_LEDGER',
      'packages/core/src/ttl.ts',
      /export const SECONDS_PER_LEDGER = ([\d_.]+)/,
    ),
    owner: 'packages/core/src/ttl.ts → SECONDS_PER_LEDGER',
  },
};

/**
 * Every place that RESTATES an owned value. One owner may have many copies, so
 * this is a list rather than a map — the original shape allowed exactly one copy
 * per owner, which is why the two TypeScript thresholds below were never covered.
 *
 * 🔴 The TS entries were added 2026-09-17 after measuring the gap. Moving
 * `DEFAULT_CRITICAL_LEDGERS` to 15_000 left this check GREEN, and so did moving
 * `DEFAULT_THRESHOLD_LEDGERS`. `scan.ts` even carried the comment "pinned by
 * scripts/check-policy-constants.mjs" — which was not true, and is exactly the
 * documented-intent-versus-enforced-link failure this file's header warns about.
 *
 * The cost of that gap is already on the record: #154 fixed `scan` reporting
 * HEALTHY for guinea-pig B while the engine reported WARNING, minutes apart, on
 * the same chain state. Two thresholds that must agree, with nothing making them.
 */
const copies = [
  {
    owner: 'thresholdLedgers',
    where: 'scripts/check-decay-drift.py → THRESHOLD_LEDGERS',
    value: pick(
      drift,
      'THRESHOLD_LEDGERS',
      'scripts/check-decay-drift.py',
      /^THRESHOLD_LEDGERS = ([\d_]+)/m,
    ),
  },
  {
    owner: 'secondsPerLedger',
    where: 'scripts/check-decay-drift.py → SECONDS_PER_LEDGER',
    value: pick(
      drift,
      'SECONDS_PER_LEDGER',
      'scripts/check-decay-drift.py',
      /^SECONDS_PER_LEDGER = ([\d_.]+)/m,
    ),
  },
  {
    owner: 'thresholdLedgers',
    where: 'packages/core/src/health.ts → DEFAULT_CRITICAL_LEDGERS',
    value: pick(
      health,
      'DEFAULT_CRITICAL_LEDGERS',
      'packages/core/src/health.ts',
      /export const DEFAULT_CRITICAL_LEDGERS = ([\d_]+)/,
    ),
  },
  {
    owner: 'thresholdLedgers',
    where: 'packages/cli/src/scan.ts → DEFAULT_THRESHOLD_LEDGERS',
    value: pick(
      cliScan,
      'DEFAULT_THRESHOLD_LEDGERS',
      'packages/cli/src/scan.ts',
      /export const DEFAULT_THRESHOLD_LEDGERS = ([\d_]+)/,
    ),
  },
];

const problems = [...missing];
for (const [name, { value, owner }] of Object.entries(owners)) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    problems.push(`${name}: could not read the owning value from ${owner}`);
    continue;
  }
  for (const copy of copies.filter((c) => c.owner === name)) {
    if (copy.value !== value) {
      problems.push(`${name}: ${copy.where} has ${copy.value}, but ${owner} says ${value}`);
    }
  }
}

if (problems.length > 0) {
  console.error('✖ policy constants have diverged across the language boundary:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\n  These sites copy a value they do not own. Update the copy to match its' +
      '\n  owner, or move the owner if the policy genuinely changed — but move it' +
      '\n  everywhere, in one commit.' +
      '\n  See docs/CONVENTIONS.md § One home for a policy.',
  );
  process.exit(1);
}

console.log(
  `✓ policy constants agree across ${copies.length} copy site(s) in TS/JSON/Python ` +
    `(threshold ${owners.thresholdLedgers.value}, cadence ${owners.secondsPerLedger.value}s)`,
);
