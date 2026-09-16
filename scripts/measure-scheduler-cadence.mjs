#!/usr/bin/env node
/**
 * Recompute the delivered scheduler cadence from the real run history.
 *
 * Why this is a command
 * --------------------
 * `SEP-20-PREFLIGHT.md` says "worst observed gap is still well under 24h —
 * **recompute, do not assume**". Until now there was no way to recompute except
 * by writing the arithmetic again each time, so in practice nobody did, and the
 * figures were instead COPIED into prose — where they went stale silently.
 *
 * On 2026-09-16 the `W3-D18-01` row read "136-minute median, ~11% of declared"
 * two days after that line was written for honesty. A recomputation over 100
 * runs gave a 179-minute median and 7.1% delivery. The worst gap held at exactly
 * 369, which is the point of the measurement/floor split — but the median had
 * moved 32% and the row a reviewer reads first was wrong again.
 *
 * **A document that quotes a measurement inherits that measurement's drift, and
 * nothing tells it when the source moves.** So prose now names the constant and
 * this command; the live numbers come from here.
 *
 * Usage
 * -----
 *   node scripts/measure-scheduler-cadence.mjs            # engine-cron, 100 runs
 *   node scripts/measure-scheduler-cadence.mjs --json     # machine-readable
 *   LIMIT=200 WORKFLOW=engine-cron.yml node scripts/measure-scheduler-cadence.mjs
 *
 * Reads only. Requires `gh` to be authenticated.
 */

import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import {
  WORST_OBSERVED_SCHEDULER_GAP_MINUTES,
  SCHEDULER_GAP_FLOOR_MINUTES,
} from '../packages/core/dist/index.js';

const WORKFLOW = process.env.WORKFLOW ?? 'engine-cron.yml';
const LIMIT = Number(process.env.LIMIT ?? 100);
const DECLARED_INTERVAL_MINUTES = 15;
/** The review trigger from config.ts: 80% of the floor. Restated nowhere else. */
const REVIEW_TRIGGER_MINUTES = Math.round(SCHEDULER_GAP_FLOOR_MINUTES * 0.8);

export function summarise(createdAtList) {
  const at = createdAtList
    .map((t) => new Date(t).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => a - b);
  if (at.length < 2) throw Error('Need at least two scheduled runs to measure a gap');
  const gaps = [];
  for (let i = 1; i < at.length; i++) gaps.push((at[i] - at[i - 1]) / 60000);
  const sorted = [...gaps].sort((a, b) => a - b);
  const spanMinutes = (at.at(-1) - at[0]) / 60000;
  return {
    runs: at.length,
    from: new Date(at[0]).toISOString(),
    to: new Date(at.at(-1)).toISOString(),
    spanHours: spanMinutes / 60,
    medianGapMinutes: sorted[Math.floor(sorted.length / 2)],
    worstGapMinutes: sorted.at(-1),
    // Delivered slots as a fraction of what the declared cron would have produced.
    deliveredPercent: (at.length / (spanMinutes / DECLARED_INTERVAL_MINUTES)) * 100,
    worstSix: sorted.slice(-6),
  };
}

function fetchScheduledRuns() {
  const raw = execFileSync(
    'gh',
    [
      'run',
      'list',
      '--repo',
      'Fatihmaull/evergreen',
      '--workflow',
      WORKFLOW,
      '--limit',
      String(LIMIT),
      '--json',
      'event,createdAt',
    ],
    { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 },
  );
  return JSON.parse(raw)
    .filter((r) => r.event === 'schedule')
    .map((r) => r.createdAt);
}

if (process.argv[1]?.endsWith('measure-scheduler-cadence.mjs')) {
  const s = summarise(fetchScheduledRuns());
  const n = (v, d = 0) => v.toFixed(d).toLocaleString('en-US');
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...s, workflow: WORKFLOW }, null, 2));
  } else {
    console.log(`# delivered scheduler cadence — ${WORKFLOW}`);
    console.log(`sample:          ${s.runs} scheduled runs, ${s.from} → ${s.to}`);
    console.log(`span:            ${n(s.spanHours, 1)} h`);
    console.log(`median gap:      ${n(s.medianGapMinutes)} min`);
    console.log(`WORST gap:       ${n(s.worstGapMinutes)} min`);
    console.log(
      `delivered:       ${n(s.deliveredPercent, 1)}% of a ${DECLARED_INTERVAL_MINUTES}-min declared cron`,
    );
    console.log(`worst six gaps:  ${s.worstSix.map((g) => n(g)).join(', ')} min\n`);
    console.log(
      `recorded worst   ${WORST_OBSERVED_SCHEDULER_GAP_MINUTES} min  (WORST_OBSERVED_SCHEDULER_GAP_MINUTES)`,
    );
    console.log(`review trigger   ${REVIEW_TRIGGER_MINUTES} min  (80% of the floor)`);
    console.log(
      `floor            ${SCHEDULER_GAP_FLOOR_MINUTES} min  (SCHEDULER_GAP_FLOOR_MINUTES)\n`,
    );
    const verdicts = [
      [
        s.worstGapMinutes > WORST_OBSERVED_SCHEDULER_GAP_MINUTES,
        `🔴 NEW WORST — exceeds the recorded ${WORST_OBSERVED_SCHEDULER_GAP_MINUTES}. Update the constant and its sample.`,
        `✓ at or below the recorded ${WORST_OBSERVED_SCHEDULER_GAP_MINUTES}`,
      ],
      [
        s.worstGapMinutes > REVIEW_TRIGGER_MINUTES,
        `🔴 crossed the ${REVIEW_TRIGGER_MINUTES}-min review trigger — the floor needs a decision`,
        `✓ below the ${REVIEW_TRIGGER_MINUTES}-min review trigger`,
      ],
      [
        s.worstGapMinutes > SCHEDULER_GAP_FLOOR_MINUTES,
        `🔴 EXCEEDS THE ${SCHEDULER_GAP_FLOOR_MINUTES}-MIN FLOOR — the watcher policy is wrong`,
        `✓ below the ${SCHEDULER_GAP_FLOOR_MINUTES}-min floor`,
      ],
    ];
    for (const [bad, red, green] of verdicts) console.log(bad ? red : green);
  }
}
