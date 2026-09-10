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

const copies = {
  thresholdLedgers: pick(
    drift,
    'THRESHOLD_LEDGERS',
    'scripts/check-decay-drift.py',
    /^THRESHOLD_LEDGERS = ([\d_]+)/m,
  ),
  secondsPerLedger: pick(
    drift,
    'SECONDS_PER_LEDGER',
    'scripts/check-decay-drift.py',
    /^SECONDS_PER_LEDGER = ([\d_.]+)/m,
  ),
};

const problems = [...missing];
for (const [name, { value, owner }] of Object.entries(owners)) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    problems.push(`${name}: could not read the owning value from ${owner}`);
    continue;
  }
  if (copies[name] !== value) {
    problems.push(
      `${name}: scripts/check-decay-drift.py has ${copies[name]}, but ${owner} says ${value}`,
    );
  }
}

if (problems.length > 0) {
  console.error('✖ policy constants have diverged across the language boundary:\n');
  for (const p of problems) console.error(`  ${p}`);
  console.error(
    '\n  The Python drift check copies values it does not own. Update the copy to' +
      '\n  match its owner, or move the owner if the policy genuinely changed.' +
      '\n  See docs/CONVENTIONS.md § One home for a policy.',
  );
  process.exit(1);
}

console.log(
  `✓ policy constants agree across TS/JSON/Python ` +
    `(threshold ${owners.thresholdLedgers.value}, cadence ${owners.secondsPerLedger.value}s)`,
);
