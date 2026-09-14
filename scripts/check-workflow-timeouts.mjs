#!/usr/bin/env node
/**
 * A scheduled workflow's `timeout-minutes` must be STRICTLY LESS than its cron
 * interval.
 *
 * `cancel-in-progress: false` is the right setting for anything that submits
 * transactions — cancelling a run mid-submission is how an unresolved hash gets
 * created. But it queues rather than cancelling, and queueing is only safe
 * while runs finish faster than they arrive. Raise a timeout above its interval
 * and this silently becomes an **unbounded queue of transaction-submitting
 * runs**, with no error anywhere.
 *
 * Found on 2026-09-14 while proving the concurrency guarantee, and written down
 * as prose. This project's most repeated finding is that a lesson written as
 * prose cannot prevent its own recurrence — four payments and counting — so it
 * is a check instead.
 *
 * Deliberately naive about cron: it computes the smallest gap between
 * consecutive fire times within an hour, which is what matters. A cron this
 * repo would not write (day-of-month, month, complex step syntax) is REPORTED
 * as unparsed rather than assumed safe.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const DIR = '.github/workflows';

/** Minutes a step or list minute-field fires at, within one hour. */
function minuteFireTimes(field) {
  if (field === '*') return [...Array(60).keys()];
  const step = /^\*\/(\d+)$/.exec(field);
  if (step) {
    const n = Number(step[1]);
    return [...Array(60).keys()].filter((m) => m % n === 0);
  }
  if (/^\d+(,\d+)*$/.test(field))
    return field
      .split(',')
      .map(Number)
      .sort((a, b) => a - b);
  return null; // unparsed — reported, never assumed safe
}

/** Smallest gap in minutes between consecutive fires, wrapping the hour. */
function smallestGap(minutes) {
  if (minutes.length < 2) return 60;
  let min = Infinity;
  for (let i = 0; i < minutes.length; i++) {
    const next = minutes[(i + 1) % minutes.length];
    const gap = i === minutes.length - 1 ? 60 - minutes[i] + next : next - minutes[i];
    if (gap < min) min = gap;
  }
  return min;
}

const problems = [];
const checked = [];
for (const name of readdirSync(DIR).filter((f) => f.endsWith('.yml') || f.endsWith('.yaml'))) {
  const text = readFileSync(join(DIR, name), 'utf8');
  const crons = [...text.matchAll(/^\s*-\s*cron:\s*['"]([^'"]+)['"]/gm)].map((m) => m[1]);
  if (crons.length === 0) continue;
  const timeouts = [...text.matchAll(/^\s*timeout-minutes:\s*(\d+)/gm)].map((m) => Number(m[1]));

  for (const cron of crons) {
    const minuteField = cron.trim().split(/\s+/)[0];
    const fires = minuteFireTimes(minuteField);
    if (fires === null) {
      problems.push(
        `${name}: cron "${cron}" — minute field not understood, so the interval\n` +
          '    cannot be checked. Simplify it, or teach this script the syntax.',
      );
      continue;
    }
    const interval = smallestGap(fires);
    if (timeouts.length === 0) {
      problems.push(
        `${name}: scheduled every ${interval} min with NO timeout-minutes.\n` +
          '    An unbounded run under a cron is an unbounded queue.',
      );
      continue;
    }
    for (const t of timeouts) {
      checked.push(`${name}: timeout ${t} < interval ${interval}`);
      if (t >= interval) {
        problems.push(
          `${name}: timeout-minutes ${t} >= cron interval ${interval} min.\n` +
            '    With cancel-in-progress:false this queues, and a run that can outlast its\n' +
            '    own interval makes that queue unbounded. Lower the timeout or slow the cron.',
        );
      }
    }
  }
}

if (problems.length > 0) {
  console.error(`✖ ${problems.length} scheduled-workflow timing problem(s):\n`);
  for (const p of problems) console.error(`  ${p}\n`);
  process.exit(1);
}
console.log(`✓ scheduled workflows: ${checked.length} timeout(s) under their cron interval`);
for (const c of checked) console.log(`    ${c}`);
