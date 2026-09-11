#!/usr/bin/env node
/**
 * Fail if any doc references a task ID that is not registered in BACKLOG.md.
 *
 * Why this exists
 * ---------------
 * Restructuring Week 3 reused task IDs for different work, and separately
 * invented `W3-D18-02c` in EVIDENCE.md with no task behind it. Both went
 * unnoticed because everything *looked* fine.
 *
 * What this catches and what it does NOT:
 *   ✅ a referenced ID that does not exist   (dangling)
 *   ❌ an ID that exists but now means something else  (repurposed)
 *
 * The second is the more dangerous one and nothing cheap detects it — which is
 * why `docs/CONVENTIONS.md` says to RETIRE an ID rather than repurpose it, and
 * why the ADR template requires a downstream sweep. This check is the floor,
 * not the ceiling.
 *
 * A first version of this check matched only backtick-delimited IDs and missed
 * `**W3-D18-02c**` entirely. The delimiter set below is deliberately broad.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';
import { ID } from './task-id.mjs';

const BACKLOG = 'BACKLOG.md';
const ROOTS = ['docs', 'README.md', 'AGENTS.md', 'CLAUDE.md'];
const SKIP = ['archive', 'node_modules'];

// A registered task is one with a checkbox in BACKLOG...
// ─────────────────────────────────────────────────────────────────────────────
// ⚠️ TRIGGER REACHED 2026-09-10 — read before adding another pattern here.
//
// Fatih's rule: "if the checker grows a THIRD rule that pattern-matches
// formatting, replace all three with a machine-readable marker." That count was
// reached and passed in one sitting. This file encoded meaning in presentation
// four separate times:
//
//   1. registered   = has a checkbox        (broke when W1-D4-09 became recurring)
//   2. retired      = wrapped in ~~ ~~      (its own hardcoded id pattern)
//   3. ID  suffixes = [0-9a-c]              (W3-D21-01d/e silently untracked)
//   4. REF suffixes = [a-c]?                (a SECOND copy of 3, widened separately,
//                                            which left `...01z` undetected)
//
// 3 and 4 are the instructive pair: one concept, two hand-kept regexes, and
// fixing one made the checker *look* fixed while the other still let a dangling
// id through. All three patterns now derive from `ID` below — one source.
//
// NEXT CHANGE TO THIS FILE: do not add a fifth pattern. Move the metadata out of
// the prose — a `retired-ids` list or frontmatter the checker reads as DATA —
// so that changing how a document looks stops changing what the checker believes.
// ─────────────────────────────────────────────────────────────────────────────

const backlog = readFileSync(BACKLOG, 'utf8');
// The ID shape now lives in `task-id.mjs`, imported below, because a rule kept
// in a comment gets re-invented: this class was [0-9a-c] until 2026-09-10 (which
// hid W3-D21-01d/e), and on 2026-09-12 sync-notion.mjs independently wrote its
// own narrower class and silently dropped 22 rows. One definition, one import.

// ...or a row in § Recurring obligations. A standing obligation is tracked work
// with a closing condition rather than a weekly checkbox, so it is registered
// even though it will never carry one. Added 2026-09-10 when W1-D4-09 moved out
// of the Week 1 count and this checker correctly called every reference to it
// dangling — the ID was still tracked, just not in the shape the regex knew.
const afterHeading = backlog.split(/^## Recurring obligations$/m)[1] ?? '';
// Up to the next top-level heading, or the rest of the file if it is the last section.
const recurring = afterHeading.split(/^## /m)[0];

const REGISTERED = new Set([
  ...[...backlog.matchAll(new RegExp(String.raw`^- \[.\] \*\*(${ID})\*\*`, 'gm'))].map((m) => m[1]),
  ...[...recurring.matchAll(new RegExp(String.raw`\*\*\`?(${ID})\`?\*\*`, 'g'))].map((m) => m[1]),
]);

// Any delimiter. Trailing guard stops a prefix matching a longer ID.
// Built from the SAME `ID` source as REGISTERED. It used to be a second, hand-kept
// copy of the pattern, which is how W3-D21-01d/e ended up invisible in both
// directions and how widening only one of the two left a dangling `...01z`
// undetected. One concept, one pattern.
const REF = new RegExp(String.raw`\b(${ID})\b(?![-\w])`, 'g');

/**
 * A RETIRED id, quoted deliberately: ~~W3-D18-02~~
 *
 * Documenting a rename necessarily means naming the old id, and that is not a
 * dangling reference — it is the record of why the new one exists. Strikethrough
 * says exactly that and reads correctly to a human too.
 *
 * Use it ONLY for an id that genuinely no longer exists. Reaching for it to
 * silence this check on a live reference would convert a caught bug into a
 * hidden one.
 */
const RETIRED = new RegExp(String.raw`~~\s*(${ID})\s*~~`, 'g');

function walk(p) {
  if (SKIP.some((s) => p.includes(s))) return [];
  if (statSync(p).isDirectory()) return readdirSync(p).flatMap((c) => walk(join(p, c)));
  return p.endsWith('.md') ? [p] : [];
}

const dangling = [];
for (const file of ROOTS.flatMap(walk)) {
  // A session log is an append-only historical record. Quoting an ID that has
  // since been renamed or retired is CORRECT there — rewriting history to keep
  // a checker quiet would destroy the thing the log is for. Stop at it.
  let inSessionLog = false;
  readFileSync(file, 'utf8')
    .split('\n')
    .forEach((line, i) => {
      if (/^## Session log/.test(line)) inSessionLog = true;
      if (inSessionLog) return;
      const retired = new Set([...line.matchAll(RETIRED)].map((m) => m[1]));
      for (const m of line.matchAll(REF)) {
        if (retired.has(m[1])) continue;
        if (!REGISTERED.has(m[1])) dangling.push({ file, line: i + 1, id: m[1] });
      }
    });
}

if (dangling.length > 0) {
  console.error(`\n✖ ${dangling.length} reference(s) to unregistered task IDs:\n`);
  for (const d of dangling) console.error(`  ${d.file}:${d.line}  ${d.id}`);
  console.error(
    '\nEither register the task in BACKLOG.md, or fix the reference. An ID that\n' +
      'appears in a doc but nowhere in the plan is work nobody is tracking.\n',
  );
  process.exit(1);
}

console.log(`✓ every task ID referenced in docs is registered (${REGISTERED.size} tasks)`);
