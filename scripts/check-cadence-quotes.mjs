#!/usr/bin/env node
/**
 * Prose may not restate the delivered scheduler cadence. It must name the
 * constant and the recompute command instead.
 *
 * Why this exists
 * ---------------
 * The `W3-D18-01` backlog row was rewritten on 2026-09-14 *for honesty*, to say
 * the engine runs at "~11% of the declared cadence — 136-minute median". Two days
 * later a recomputation gave a 179-minute median and 7.3% delivery. The row a
 * reviewer reads first was wrong again, in the fix that existed because the number
 * mattered. By then the same row carried TWO contradictory measurements —
 * "~132 min median, 294 min worst, 10% of slots" from an earlier pass, sitting
 * beside the newer pair.
 *
 * This is the measurement/floor lesson one level up. `config.ts` already splits
 * WORST_OBSERVED_SCHEDULER_GAP_MINUTES (an observation) from
 * SCHEDULER_GAP_FLOOR_MINUTES (a decision), so the floor does not chase the
 * measurement. But **a document that quotes a measurement inherits its drift, and
 * nothing tells the document when the source moves.** The delivery figure moved
 * 7.1% -> 7.3% during the single session that fixed it.
 *
 * Same reasoning as the generated crossing schedule: the fix is not "remember to
 * update both", it is to stop having a second copy.
 *
 * WHAT TO WRITE INSTEAD
 * ---------------------
 * Name the source, not the value:
 *
 *   "delivered cadence is a fraction of the declared 15-minute cron; see
 *    WORST_OBSERVED_SCHEDULER_GAP_MINUTES and run `pnpm measure:cadence`"
 *
 * The stable facts are safe to state and do not drift: that delivery is far below
 * declared, that the worst gap is bounded by the constant, and that B's 24-hour
 * sub-threshold window absorbs it.
 *
 * ARCHIVAL DIRECTORIES ARE EXEMPT. `docs/evidence/` and `docs/adr/` are dated
 * records — an evidence README *should* state what was measured on its date, and
 * an ADR records the figures a decision was made on. Freezing a value is their
 * purpose. Everywhere else describes the present tense and must not.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

/** Dated records: freezing a measurement is the point of these. */
const ARCHIVAL = ['docs/evidence', 'docs/adr'];

const PATTERNS = [
  { re: /\b\d{2,4}[-\s]min(?:ute)?s?\s+median\b/gi, what: 'a median gap value' },
  {
    re: /\bmedian\s+(?:gap\s+)?(?:of\s+)?\d{2,4}(?:\s*[-–]\s*\d{2,4})?\s*min/gi,
    what: 'a median gap value',
  },
  { re: /\b\d{2,4}[-\s]min(?:ute)?s?\s+worst\b/gi, what: 'a worst-gap value' },
  { re: /\bworst\s+(?:observed\s+)?gap\s+(?:of\s+)?\d{2,4}/gi, what: 'a worst-gap value' },
  {
    re: /~?\s?\d{1,3}(?:\.\d)?%[-\s]?of[-\s](?:a\s|the\s)?declared/gi,
    what: 'a delivery percentage',
  },
  {
    re: /\d{1,3}(?:\.\d)?%\s+of\s+(?:its\s+|a\s+|the\s+)?declared\s+cadence/gi,
    what: 'a delivery percentage',
  },
  { re: /\d{1,3}(?:\.\d)?%\s+of\s+(?:declared\s+)?slots/gi, what: 'a delivery percentage' },
];

function markdownFiles(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (ARCHIVAL.some((a) => path === a || path.startsWith(a + '/'))) continue;
    if (name === 'node_modules' || name === '.git' || name === 'dist') continue;
    if (statSync(path).isDirectory()) markdownFiles(path, out);
    else if (name.endsWith('.md')) out.push(path);
  }
  return out;
}

const files = ['BACKLOG.md', 'README.md', 'AGENTS.md', 'CLAUDE.md'].filter((f) => {
  try {
    statSync(f);
    return true;
  } catch {
    return false;
  }
});
files.push(...markdownFiles('docs'));

const hits = [];
for (const file of files) {
  const text = readFileSync(file, 'utf8');
  text.split('\n').forEach((line, i) => {
    for (const { re, what } of PATTERNS) {
      re.lastIndex = 0;
      // `matchAll`, not `exec`. A line carrying two figures of the same kind
      // reported one — found by asking this file's own audit question of itself:
      // can the output shape represent the failure? It could name the line, so
      // this was an under-count rather than a blind spot, but `check-task-ids.mjs`
      // already had the right shape and there is no reason to have two.
      for (const m of line.matchAll(re)) hits.push({ file, line: i + 1, what, text: m[0].trim() });
    }
  });
}

if (hits.length > 0) {
  console.error(`\n✖ ${hits.length} hard-coded scheduler-cadence figure(s) in prose:\n`);
  for (const h of hits) console.error(`  ${h.file}:${h.line}  ${h.what} — "${h.text}"`);
  console.error(
    '\n  These values move. The W3-D18-01 row was rewritten for honesty on 2026-09-14\n' +
      '  and was wrong again two days later; the delivery figure moved 7.1% -> 7.3%\n' +
      '  inside the session that fixed it.\n\n' +
      '  Name the source instead of the value:\n' +
      '    WORST_OBSERVED_SCHEDULER_GAP_MINUTES / SCHEDULER_GAP_FLOOR_MINUTES,\n' +
      '    and `pnpm measure:cadence` for the live figures.\n\n' +
      '  docs/evidence/ and docs/adr/ are exempt — a dated record SHOULD freeze its\n' +
      '  numbers. If this line is genuinely a dated observation, it belongs there.\n',
  );
  process.exit(1);
}
console.log(`✓ no hard-coded scheduler-cadence figures in prose (${files.length} docs)`);
