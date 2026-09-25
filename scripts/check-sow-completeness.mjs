#!/usr/bin/env node
/**
 * Does every artifact the SOW asks for actually EXIST?
 *
 * Why this exists
 * ---------------
 * On 2026-09-22, ten days from submission, all seventeen gates in `pnpm check`
 * passed and 884 tests passed while **seven of the thirteen requirements in SOW
 * §6.1 had no artifact at all** — no npm package, no npm links, no alert
 * screenshots, no policy-signer guide, no GitHub Action, no demo video, and a
 * dashboard URL serving a 2,356-byte placeholder.
 *
 * (An audit the same morning put the figure at four absent and three partial.
 * This check is stricter and the stricter number is the honest one: a script
 * that has never been recorded is not a partial demo, and a placeholder is not
 * a partial dashboard. "Partial" is a grade the funder assigns per deliverable,
 * not a state an artifact can be in.)
 *
 * That was not an oversight by any one gate. Every gate in this repository
 * verifies evidence **integrity**: checksums match, links are reciprocal, quoted
 * cadences agree, no secrets leak, a capture is a real crossing. Not one of them
 * verifies **completeness** — that a required kind of evidence exists at all.
 * Every gate here was written in response to a defect, and nobody had yet had a
 * defect shaped like *we ran out of days*.
 *
 * The one instrument that would have shown it — the screenshot index in
 * `docs/EVIDENCE.md` — had six of eight rows blank. It failed by being empty,
 * which is the failure mode a human skims past.
 *
 * How it grades
 * -------------
 * `docs/SOW.md` §6.2 is not an itemised checklist. It is three rows, one per
 * deliverable, each **Evidence Present / Partial / Missing**, assessed by the
 * Ambassador Chapter Lead to a standard §6 states outright: *"easy to review
 * with minimal technical expertise."* So this script reports the way the funder
 * scores, not the way a test suite does — **one missing evidence type pulls a
 * whole deliverable down**, however strong its siblings are.
 *
 * DATE-TRIGGERED, deliberately
 * ----------------------------
 * From `HARD_FAIL_FROM` onward this exits non-zero. Before that it prints the
 * same red status and exits 0.
 *
 * Not softness — the alternative is worse. `pnpm check` gates every merge, so a
 * hard failure today blocks all ten remaining days of work behind the very gaps
 * the work is meant to close, and the only way to land anything would be to
 * disable this check. A guardrail that must be worked around to make progress
 * gets worked around once and then stays off. Same shape as
 * `check-crossing-evidence.mjs`: it starts failing on the day it matters, and
 * unlike a reminder it keeps failing.
 *
 * Commissioned 2026-09-22 by watching it fail before it was trusted — see the
 * PR. A completeness gate that cannot go red is the thing it exists to prevent.
 */
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

/** The day this stops warning and starts blocking. Three clear days before
 *  submission on 2026-10-02 — long enough to fix what it names, short enough
 *  that nothing ships with a silent gap. */
const HARD_FAIL_FROM = '2026-09-29';

const today = process.env.EVERGREEN_TODAY ?? new Date().toISOString().slice(0, 10);

const IMAGE = /\.(png|jpe?g|gif|webp)$/i;

function read(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch {
    return null;
  }
}

/** Images anywhere under a directory tree. */
function images(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) out.push(...images(path));
    else if (IMAGE.test(name)) out.push(path);
  }
  return out;
}

/**
 * The thirteen requirements of SOW §6.1, quoted from `docs/SOW.md`.
 *
 * `find` returns the satisfying artifact (a path, a URL, a count) or null.
 * It must look for the ARTIFACT, never for a promise of one: a task marked
 * done, a row in a table and a sentence saying "captured" are all things this
 * check has to be blind to, or it reports the belief rather than the evidence.
 */
const REQUIREMENTS = [
  {
    id: 'D1.repo',
    deliverable: 1,
    text: 'Public repository',
    find: () =>
      /github\.com\/Fatihmaull\/evergreen/.test(read('README.md') ?? '') ? 'README.md' : null,
  },
  {
    id: 'D1.npm',
    deliverable: 1,
    text: 'published npm package',
    find: () => {
      const m = /https:\/\/www\.npmjs\.com\/package\/(@evergreen-stellar\/[\w-]+)/.exec(
        read('docs/EVIDENCE.md') ?? '',
      );
      return m ? m[1] : null;
    },
    fix: 'W4-D27-02 — `pnpm publish` (never `npm publish`), then record the registry link in docs/EVIDENCE.md.',
  },
  {
    id: 'D1.screenshots',
    deliverable: 1,
    text: 'CLI screenshots showing TTL, archive prediction and cost',
    find: () => {
      const n = images('docs/evidence/2026-09-14-d1-capture').length;
      return n >= 3 ? `${n} images` : null;
    },
  },
  {
    id: 'D1.coverage',
    deliverable: 1,
    text: 'test coverage report',
    find: () => {
      const p = 'docs/evidence/2026-09-10-coverage/coverage-report.txt';
      const t = read(p);
      return t && /\d+(\.\d+)?%/.test(t) ? p : null;
    },
  },

  {
    id: 'D2.hashes',
    deliverable: 2,
    text: 'Testnet `extendTTL` transaction hashes',
    find: () => {
      const n = new Set(
        [...(read('docs/EVIDENCE.md') ?? '').matchAll(/\b([0-9a-f]{64})\b/g)].map((m) => m[1]),
      ).size;
      return n >= 3 ? `${n} distinct hashes` : null;
    },
  },
  {
    id: 'D2.logs',
    deliverable: 2,
    text: 'engine logs / auto-bump execution logs',
    find: () => {
      const p = 'docs/evidence/2026-09-14-scheduled-a-save/attempt.jsonl';
      const t = read(p);
      return t && t.trim().length > 0 ? p : null;
    },
  },
  {
    id: 'D2.alerts',
    deliverable: 2,
    text: 'alert screenshots',
    find: () => {
      // An alert screenshot is an IMAGE of a delivered notification. Receipts,
      // provider responses and inbox-confirmation JSON are proof of sending or
      // receipt, which is a different claim. The SOW asks for actual images.
      const dir = 'docs/evidence/2026-09-22-alert-screenshots';
      const required = [
        join(dir, 'success-alert-inbox.png'),
        join(dir, 'shared-code-refusal-alert-inbox.png'),
      ];
      const found = images(dir).filter(
        (path) => required.includes(path) && statSync(path).size > 0,
      );
      return found.length === required.length ? `${found.length} inbox images` : null;
    },
    fix: 'W3-D17-03 — capture the two confirmed messages in a new dated evidence folder and bind them to the retained Resend IDs; do not rewrite the historical no-screenshot record.',
  },
  {
    id: 'D2.signer-guide',
    deliverable: 2,
    text: 'policy-signer configuration / setup guide',
    find: () => {
      const t = read('docs/POLICY-SIGNER.md');
      if (!t) return null;
      // It declares its own emptiness; believe it.
      if (/Not written yet|placeholder, not a document|🚧/.test(t)) return null;
      return t.length > 2000 ? 'docs/POLICY-SIGNER.md' : null;
    },
    fix: 'W3-D20-03 — blocked on the Stage 2 direction in #183; #191 already carries the truthful guide.',
  },

  {
    id: 'D3.dashboard',
    deliverable: 3,
    text: 'Live testnet dashboard URL',
    find: () => {
      const t = read('apps/dashboard/src/index.ts') ?? '';
      return /PLACEHOLDER/i.test(t) || t.length < 400 ? null : 'apps/dashboard/src';
    },
    fix: 'W4-D22-01 → W4-D24-02. The URL resolves today, but it serves a static placeholder.',
  },
  {
    id: 'D3.action',
    deliverable: 3,
    text: 'published `evergreen-check` GitHub Action',
    find: () => {
      // Existence is not enough: a zero-byte `action.yml` satisfied an earlier
      // draft of this check, which is the exact defect class this file audits
      // elsewhere. An Action needs a name and a `runs:` block to be one.
      for (const p of ['action.yml', 'action.yaml']) {
        const t = read(p);
        if (t && /^name:/m.test(t) && /^runs:/m.test(t)) return p;
      }
      return null;
    },
    fix: 'W4-D25-01/02/03 — no action.yml exists anywhere in the repository.',
  },
  {
    id: 'D3.demo',
    deliverable: 3,
    text: '3–5 minute demo video',
    find: () => {
      const m =
        /https?:\/\/[^\s)]*(?:youtu\.be|youtube\.com|vimeo\.com|drive\.google\.com|loom\.com)[^\s)]*/.exec(
          read('docs/EVIDENCE.md') ?? '',
        );
      return m ? m[0].slice(0, 48) : null;
    },
    fix: 'W4-D28-02 — record, edit, upload, then put the link in docs/EVIDENCE.md. The script exists and was walked and timed at 4m20s on 2026-09-23; what is missing is the recording.',
  },
  {
    id: 'D3.docs',
    deliverable: 3,
    text: 'complete documentation',
    find: () => {
      const t = read('README.md') ?? '';
      return /## Quickstart|60-second|quickstart/i.test(t) ? 'README.md' : null;
    },
  },
  {
    id: 'D3.npm-links',
    deliverable: 3,
    text: 'links to the published npm packages',
    find: () =>
      /npmjs\.com\/package\//.test(read('docs/EVIDENCE.md') ?? '') ? 'docs/EVIDENCE.md' : null,
    fix: 'Free the moment D1.npm lands.',
  },
];

const results = REQUIREMENTS.map((r) => {
  let got;
  try {
    got = r.find();
  } catch {
    // An unreadable artifact is an absent one — never a crash, and never a pass.
    got = null;
  }
  return { ...r, got };
});

/** SOW §6.2's three states, applied per deliverable. */
function grade(rows) {
  const met = rows.filter((r) => r.got).length;
  if (met === rows.length) return 'PRESENT';
  if (met === 0) return 'MISSING';
  return 'PARTIAL';
}

const TITLES = {
  1: 'Core CLI',
  2: 'Auto-Bump Engine',
  3: 'Dashboard + CI Check + Docs / Demo',
};
const MARK = { PRESENT: '✓', PARTIAL: '~', MISSING: '✖' };

const absent = results.filter((r) => !r.got);
const grades = [1, 2, 3].map((d) => ({
  d,
  rows: results.filter((r) => r.deliverable === d),
  grade: grade(results.filter((r) => r.deliverable === d)),
}));

const out = absent.length > 0 ? console.error : console.log;

out('');
out('  SOW §6.2 — how the Ambassador Chapter Lead grades this, one row per deliverable');
out('');
for (const g of grades) {
  const met = g.rows.filter((r) => r.got).length;
  out(`  ${MARK[g.grade]} Deliverable ${g.d} — ${TITLES[g.d]}`);
  out(`      ${g.grade}  (${met} of ${g.rows.length} evidence items)`);
  for (const r of g.rows)
    out(`      ${r.got ? '·' : '✖'} ${r.text}${r.got ? `  → ${r.got}` : '  → ABSENT'}`);
  out('');
}

if (absent.length === 0) {
  console.log(`✓ SOW completeness: all ${results.length} §6.1 evidence items exist`);
  process.exit(0);
}

console.error(`  ${absent.length} of ${results.length} required evidence items DO NOT EXIST:`);
console.error('');
for (const r of absent) {
  console.error(`    ✖ [${r.id}] ${r.text}`);
  if (r.fix) console.error(`        ${r.fix}`);
}
console.error('');
console.error('  One missing evidence TYPE pulls a whole deliverable to Partial, however');
console.error('  strong its siblings are — §6.2 has no itemised pass/fail. So breadth beats');
console.error('  depth in what remains: ship an evidence type thin rather than not at all.');
console.error('');

if (today < HARD_FAIL_FROM) {
  console.error(
    `  ⚠ Not failing the build yet — this starts blocking on ${HARD_FAIL_FROM}, and it is\n` +
      `    ${Math.round((Date.parse(HARD_FAIL_FROM) - Date.parse(today)) / 86400000)} day(s) away. Every other gate here checks that evidence is INTACT;\n` +
      '    this is the only one that checks it EXISTS. Do not silence it — fix a row.\n',
  );
  process.exit(0);
}

console.error(
  `✖ SOW completeness: ${absent.length} required evidence item(s) missing on ${today}.`,
);
console.error('  Submission is 2026-10-02. This gate is blocking deliberately.\n');
process.exit(1);
