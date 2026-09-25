#!/usr/bin/env node
/**
 * `W3-D21-01b` / `B-D29-03` — the fresh-machine run, made repeatable.
 *
 * `docs/READY.md` names four things a stranger must be able to do. This runs
 * them against whatever exists today, from a directory that has never seen this
 * repository, and writes down what broke.
 *
 * **IT DOES NOT FIX ANYTHING, AND IT MUST NOT.** The backlog row is explicit:
 * *record what broke, without fixing it in the same sitting.* A run that pauses
 * to fix stops being a measurement — you end up reporting the state of the
 * repository after you helped it, which is the one state no stranger will ever
 * see. Fix on a later commit, then re-run and watch the row change.
 *
 * **IT IS EXPECTED TO FAIL from its first run (2026-09-23) until the last gaps
 * close.** That is the whole point of moving it earlier. `B-D29-03` originally put the first and only attempt on Thu Oct 1,
 * one day before submission, where a failure has nowhere to go.
 *
 * What it can and cannot decide
 * -----------------------------
 * Outcomes 1–3 are mechanical: pack, install, scan, fetch, look for a file. It
 * runs those and reports a verdict with the evidence attached.
 *
 * **Outcome 4 is deliberately NOT automated.** It asks whether a competent
 * stranger can stand up the engine *by following the documentation*. A script
 * that stands it up for them measures the script, not the documentation — so
 * this prints the documented path and the pass criterion and leaves the call to
 * the operator. Same shape as the `#140` inbox test: prepare the command and
 * the criterion, and let the human supply the one observation only they can.
 *
 * Usage
 * -----
 *   node scripts/ready-fresh-machine.mjs              # run, print, write evidence
 *   node scripts/ready-fresh-machine.mjs --no-write   # run and print only
 *
 * Exit code is 0 whatever it finds. This is an instrument, not a gate: a
 * non-zero exit here would read as "the run failed" when the run succeeding and
 * the product failing are exactly the two things it exists to tell apart.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

/**
 * The site has two pages and outcome 2 needs both.
 *
 * `ENTRY` is where a stranger arrives — it is the URL in the README and the one
 * a person types. Since 2026-09-23 it is a landing page, by the web track's
 * design, and the scanner moved to `SCANNER`. So a check that fetches `ENTRY`
 * and looks for an input now reports a failure that is not one.
 */
const ENTRY = 'https://evergreen-stellar.pages.dev';
const SCANNER = `${ENTRY}/dashboard/`;
/** Guinea-pig A. Public, live, and NOT a decay subject — scanning is read-only. */
const SCAN_TARGET = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';

const today = process.env.EVERGREEN_TODAY ?? new Date().toISOString().slice(0, 10);
const write = !process.argv.includes('--no-write');

const results = [];
const record = (n, outcome, verdict, detail, evidence) => {
  results.push({ n, outcome, verdict, detail, evidence });
  const mark = { PASS: '✓', FAIL: '✖', BLOCKED: '⊘', HUMAN: '?' }[verdict];
  console.log(`\n  ${mark} ${n}. ${outcome}\n      ${verdict} — ${detail}`);
};

function sh(cmd, args, opts = {}) {
  try {
    return {
      ok: true,
      out: execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', ...opts }).trim(),
    };
  } catch (error) {
    return {
      ok: false,
      out: `${error.stdout ?? ''}${error.stderr ?? ''}`.trim(),
      code: error.status,
    };
  }
}

console.log(`\n  READY.md fresh-machine run — ${today}`);
console.log('  Measuring only. Nothing here is fixed in this sitting.\n');
console.log('  ' + '─'.repeat(72));

// ── 1 · Install the CLI and scan a real contract ────────────────────────────
// The stranger's real front door. `npx @evergreen-stellar/cli` is what README
// and the demo script both tell them to run, so that is what gets tried first.
const registry = sh('npm', ['view', '@evergreen-stellar/cli', 'version']);
if (registry.ok) {
  const dir = mkdtempSync(join(tmpdir(), 'evergreen-fresh-'));
  const install = sh('npm', ['install', '@evergreen-stellar/cli'], { cwd: dir });
  const scan = install.ok
    ? sh(join(dir, 'node_modules', '.bin', 'evergreen'), ['scan', SCAN_TARGET], { cwd: dir })
    : { ok: false, out: 'install failed' };
  record(
    1,
    'Install the CLI and scan a real contract',
    scan.ok || scan.code === 1 ? 'PASS' : 'FAIL',
    scan.ok || scan.code === 1
      ? `installed @evergreen-stellar/cli@${registry.out} into a clean directory and scanned; exit ${scan.code ?? 0} (1 = below threshold, a successful read)`
      : `installed but the scan failed: ${scan.out.slice(0, 200)}`,
    { registryVersion: registry.out, dir, scanExit: scan.code ?? 0 },
  );
} else {
  record(
    1,
    'Install the CLI and scan a real contract',
    'FAIL',
    'the package is NOT PUBLISHED — `npm view @evergreen-stellar/cli` returns E404, so the install line in README.md and in the demo script does not resolve for anyone. W4-D27-02.',
    { registry: registry.out.slice(0, 200) },
  );
}

// ── 2 · Open the dashboard and check any contract's TTL ─────────────────────
// Reachability is necessary and nowhere near sufficient: the placeholder also
// returns 200. What decides it is whether the page can scan anything.
//
// TWO conditions, because the stranger's path has two steps and either one can
// break on its own:
//
//   a. the scanner page serves a real scan affordance — the placeholder test;
//   b. the entry page ROUTES there. Checking only (a) would have made this row
//      go green the day the landing page appeared, while a stranger holding the
//      README's URL was stranded on a page with nothing to scan. Repointing a
//      check at the surface that still passes is how a false negative becomes a
//      blind spot, and this row exists to find exactly that class of gap.
const fetchPage = (url) => {
  const r = sh('curl', ['-sS', '-w', '\\n%{http_code}', '--max-time', '20', url]);
  return r.ok
    ? {
        status: r.out.slice(r.out.lastIndexOf('\n') + 1),
        body: r.out.slice(0, r.out.lastIndexOf('\n')),
      }
    : { status: 'unreachable', body: '' };
};
// An AFFORDANCE, not a mention. The first draft of this line also accepted the
// word "contract" anywhere in the page — and passed, because the placeholder's
// own prose says "contract". A predicate that a static holding page satisfies
// cannot report a static holding page, which is the failure it exists to find.
//
// MEASURED 2026-09-24, so the next reader knows which legs carry weight: of the
// four alternates, only `<input` and `<form` match. The app's JS is an external
// bundle, so neither page's served HTML contains `fetch(` or `addEventListener(`
// — those two legs have never fired here and must not be mistaken for cover.
const scans = (body) => /<input\b|<form\b|fetch\(|addEventListener\(/i.test(body);
const scanner = fetchPage(SCANNER);
const entry = fetchPage(ENTRY);
const canScan = scanner.status === '200' && scans(scanner.body);
const routed = /href="[^"]*\/dashboard\/?"/i.test(entry.body);
record(
  2,
  "Open the dashboard and check any contract's TTL",
  canScan && routed ? 'PASS' : 'FAIL',
  scanner.status !== '200'
    ? `${SCANNER} returned ${scanner.status}`
    : !canScan
      ? `${SCANNER} returns 200 but serves no scan affordance (${scanner.body.length} bytes, no input and no form) — a stranger cannot check any contract's TTL. W4-D22-01 → W4-D24-02.`
      : !routed
        ? `${SCANNER} scans, but ${ENTRY} — the URL a stranger is given — does not link to it, so they never reach it.`
        : `${SCANNER} accepts a contract (${scanner.body.length} bytes) and ${ENTRY} links to it`,
  {
    scanner: { url: SCANNER, status: scanner.status, bytes: scanner.body.length, scans: canScan },
    entry: { url: ENTRY, status: entry.status, bytes: entry.body.length, routes: routed },
  },
);

// ── 3 · Add `evergreen-check` to their own repo's CI ────────────────────────
const action = ['action.yml', 'action.yaml'].find((p) => {
  const t = existsSync(p) ? readFileSync(p, 'utf8') : '';
  return /^name:/m.test(t) && /^runs:/m.test(t);
});
record(
  3,
  "Add `evergreen-check` to their own repo's CI, and see it pass AND fail",
  action ? 'HUMAN' : 'FAIL',
  action
    ? `${action} exists — the remaining half is human: add it to a scratch repo and confirm BOTH a green run and a red one. Guinea-pig D is the intended failure fixture (W4-D25-01b).`
    : 'no `action.yml` exists anywhere in the repository, so there is nothing a stranger could add. W4-D25-01/02/03.',
  { action: action ?? null },
);

// ── 4 · Self-host the engine — deliberately a human call ────────────────────
record(
  4,
  'Self-host the engine against their own contract',
  'HUMAN',
  'not automated on purpose — see the block printed below. Automating it would measure this script rather than the documentation.',
  {},
);

console.log('\n  ' + '─'.repeat(72));
console.log(`
  OUTCOME 4 — your part, and it is the only one that needs a person

  READY.md is explicit that the engine is self-hosted BY DESIGN (ADR-004: the
  user pays their own extend fees), so the bar is NOT one click. It is:

      "deployable by someone competent following the guide"

  The question is therefore about the GUIDE, not about the engine. Read the
  documentation as a stranger would and answer one thing:

      Could a competent stranger, with no access to us, get the engine
      running against a contract of their own — using only what is written?

  Answer YES or NO and name the first place you had to already know something
  the documentation did not tell you. That sentence is the finding.

  🔴 Do NOT stand the engine up against guinea-pig B or C, and do not add
     either to any engine config. Use a contract of your own or none at all.
`);

// ── Summary, in the shape STATUS.md wants ───────────────────────────────────
const tally = results.reduce((a, r) => ({ ...a, [r.verdict]: (a[r.verdict] ?? 0) + 1 }), {});
console.log('  ' + '─'.repeat(72));
console.log(
  `\n  ${tally.PASS ?? 0} pass · ${tally.FAIL ?? 0} fail · ${tally.HUMAN ?? 0} awaiting a human call\n`,
);

const block = [
  `### READY.md fresh-machine run — ${today} (\`W3-D21-01b\`)`,
  '',
  'Run from a directory that had never seen this repository. **Nothing was fixed in this sitting** — the row requires that, so each failure below is a finding to act on separately.',
  '',
  '| # | A stranger can… | Verdict | What happened |',
  '|---|---|---|---|',
  ...results.map((r) => `| ${r.n} | ${r.outcome} | **${r.verdict}** | ${r.detail} |`),
  '',
  // `today`, not a literal. This sentence used to hardcode 2026-09-23, so every
  // later run asserted "the expected shape" for a date that had already passed —
  // and it would have said it loudest on Oct 1, when a failure has nowhere to go.
  `Outcome 4 is recorded as a human call by design: automating it would measure the harness rather than the documentation. ${(tally.FAIL ?? 0) === 1 ? '1 of the four is' : `${tally.FAIL ?? 0} of the four are`} failing as of ${today} — failing now is information, failing on Oct 1 is a crisis, and that gap is why this was moved earlier.`,
].join('\n');

if (write) {
  const dir = join('docs/evidence', `${today}-ready-fresh-machine`);
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'results.json'), JSON.stringify({ today, results }, null, 2) + '\n');
  writeFileSync(join(dir, 'STATUS-block.md'), block + '\n');
  console.log(`  Wrote ${dir}/results.json and STATUS-block.md`);
  console.log('  Paste STATUS-block.md into docs/STATUS.md and commit the directory.\n');
} else {
  console.log(block + '\n');
}
