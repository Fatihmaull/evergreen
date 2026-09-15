#!/usr/bin/env node
/**
 * Operational pages must reference each other in BOTH directions.
 *
 * Why this exists
 * ---------------
 * Twice in two days a new operational document referenced an older one, and the
 * older one gained no link back:
 *
 *   2026-09-14  W3-D18-03-CAPTURE.md  ->  SEP-20-PREFLIGHT.md    (no return link)
 *   2026-09-15  W3-SEP18-READINESS.md ->  SEP-20-PREFLIGHT.md    (no return link)
 *
 * It is structural, not careless. **The new page's author knows the old page
 * exists; the old page's author did not know the new one would be written.** So
 * the link that gets written is the one nobody needs, and the operator opens the
 * older page — the one that has been referenced longest — which by then describes
 * a tool that is no longer primary.
 *
 * The rule was written into prose on 2026-09-14 and a fresh instance appeared
 * within a day, from a different author, in the same document. That is this
 * project's most-repeated finding: **a lesson written as prose cannot prevent its
 * own recurrence.** Hence a checker.
 *
 * Scope is deliberately narrow. Only pages someone opens *on a day* are listed:
 * requiring reciprocity everywhere would demand that SETUP.md link back to every
 * narrative page that cites it, which is noise. STATUS.md and CONVENTIONS.md
 * reference everything by design and are not operational pages.
 *
 * ADDING AN OPERATIONAL DOC: add it below. If it references a page already here,
 * that page must link back — which is the whole point, and is the edit nobody
 * makes unless something asks for it.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const DOCS = 'docs';
const OPERATIONAL = [
  'SEP-20-PREFLIGHT.md',
  'W3-D18-03-CAPTURE.md',
  'W3-SEP18-READINESS.md',
  'W3-D17-05-RUNBOOK.md',
];

const present = OPERATIONAL.filter((f) => existsSync(join(DOCS, f)));
const text = Object.fromEntries(present.map((f) => [f, readFileSync(join(DOCS, f), 'utf8')]));

const failures = [];
for (const from of present)
  for (const to of present) {
    if (from === to) continue;
    if (text[from].includes(to) && !text[to].includes(from)) failures.push({ from, to });
  }

if (failures.length > 0) {
  console.error(`\n✖ ${failures.length} one-way link(s) between operational pages:\n`);
  for (const f of failures) console.error(`  ${f.from}  →  ${f.to}   (no link back)`);
  console.error(
    '\n  The page an operator opens is the one that has been referenced longest,\n' +
      '  and it is the one that never gains outbound links. Add the return\n' +
      '  reference to the page named on the right, saying what the other page is\n' +
      '  for — not just that it exists.\n',
  );
  process.exit(1);
}
console.log(`✓ operational docs reference each other both ways (${present.length} pages)`);
