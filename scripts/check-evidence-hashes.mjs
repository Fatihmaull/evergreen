#!/usr/bin/env node
/**
 * Every transaction hash captured in the evidence tree must also appear in
 * `docs/EVIDENCE.md` (`W3-D16-03`).
 *
 * The requirement is "the tx hash into docs/EVIDENCE.md the same day". That is
 * a procedure, and a procedure kept in prose does not fire — this repo has paid
 * four times for exactly that. So it is a check instead.
 *
 * Why the index matters more than the bundle: `EVIDENCE.md` is what a reviewer
 * reads. A hash that exists only inside a capture directory is recorded but not
 * findable, and Stellar Testnet is periodically reset — the moment an explorer
 * link dies, the index is the only thing that still tells a reviewer what to
 * look for and what it proved.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const ROOT = 'docs/evidence';
const INDEX = 'docs/EVIDENCE.md';
/** 64 lowercase hex. Matches a Stellar transaction hash and little else. */
const HASH = /\b[0-9a-f]{64}\b/g;

/**
 * A hash only counts when the record says it was SENT.
 *
 * The first version of this check flagged 20 hashes and was wrong about most of
 * them. Two false-positive classes, both instructive:
 *
 *   - a PREPARED hash from a dry run was never submitted. `extend.ts` prints it
 *     as "Prepared hash (not yet sent)" precisely because it is not a
 *     transaction. Indexing one in EVIDENCE.md would assert a chain record that
 *     does not exist — the opposite of what the index is for.
 *   - W1 hashes are indexed in a LINKED table rather than inline, so they are
 *     findable; the check was reading one file and calling the rest missing.
 *
 * A check that cries wolf is one people stop reading, which disarms it quietly.
 * So: only records carrying a submission outcome are considered, and only the
 * hash on that same record.
 */
const SENT = new Set(['succeeded', 'submitted', 'failed']);

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (name.endsWith('.json')) out.push(p);
  }
  return out;
}

function hashesIn(value) {
  if (Array.isArray(value)) return value.flatMap(hashesIn);
  if (!value || typeof value !== 'object') return [];
  const out = Object.values(value).flatMap(hashesIn);
  // The hash and the outcome must be on the SAME object. A sibling record being
  // `succeeded` says nothing about this one.
  if (SENT.has(value.outcome) && typeof value.transactionHash === 'string') {
    const m = value.transactionHash.match(HASH);
    if (m) out.push(...m);
  }
  return out;
}

const index = readFileSync(INDEX, 'utf8');
const found = new Map();
for (const file of walk(ROOT)) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    continue; // A malformed capture is a different problem; check-conflict-markers owns it.
  }
  for (const h of hashesIn(parsed)) {
    if (!found.has(h)) found.set(h, file);
  }
}

const missing = [...found].filter(([h]) => !index.includes(h));
if (missing.length > 0) {
  console.error(`✖ ${missing.length} transaction hash(es) captured but absent from ${INDEX}:`);
  for (const [h, file] of missing) console.error(`  ${h}\n    first seen in ${file}`);
  console.error(
    '\n  A hash inside a bundle is recorded but not findable. Testnet is periodically\n' +
      '  reset, and when the explorer link dies the index is the only thing left that\n' +
      '  tells a reviewer what to look for. Add it the same day it is captured.',
  );
  process.exit(1);
}
console.log(`✓ all ${found.size} captured transaction hash(es) are indexed in ${INDEX}`);
