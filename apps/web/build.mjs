/**
 * Build the twelve-page preview into `apps/dashboard/public`, which is the
 * directory the Cloudflare Pages project already publishes. Building there
 * gives this branch a preview deployment without touching the project's
 * settings, which production shares. Built files are committed on this branch
 * — fine for a prototype that never merges, and one more reason it never
 * merges.
 *
 * Static pages are rendered through the shared shell with data read from
 * committed sources at build time. Anything the build cannot find in the
 * source it names fails the build instead of shipping a stale copy.
 *
 * `node apps/web/build.mjs --commission` proves the write-path guard below can
 * fail, instead of assuming it.
 */
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  statSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { shell } from './src/chrome.mjs';
import { siteShell } from './src/site.mjs';
import { parseUsage } from './scripts/parse-cli-usage.mjs';
import { DOC_PAGES } from './src/docs/nav.mjs';
import { docsLayout } from './src/docs/shell.mjs';
// Node 24 strips the types. The manifest is the dashboard package's own entry.
import { ROUTES, pageFor } from '../dashboard/src/index.ts';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../..');
/**
 * Where the build writes. Overridable so `scripts/check-published.mjs` can
 * build into a temporary directory and compare, instead of overwriting the
 * directory Cloudflare Pages publishes in order to find out whether it is
 * current.
 */
const out = process.env.EVERGREEN_WEB_OUT ?? join(repo, 'apps/dashboard/public');
const esbuild = createRequire(join(repo, 'packages/cli/package.json'))('esbuild');

/** Core's write path must never reach a read-only page. */
const FORBIDDEN = [
  'extend.ts',
  'extend-rpc.ts',
  'ed25519-signer.ts',
  'engine.ts',
  'engine-execution-plan.ts',
];

/** Measured 2026-09-10 against the live chain; restating it is not observing it. */
const CADENCE = { value: '5.000000 s ± 0.000050' };

function readJson(path) {
  return JSON.parse(readFileSync(join(here, path), 'utf8'));
}

/**
 * Where our own subjects actually ended, from `ops/crossing-schedule.json` —
 * which declares itself the single source of truth for the crossings.
 *
 * The chain cannot supply this: an archived entry reports `liveUntilLedgerSeq`
 * 0, so after expiry the ledger it ended at is unreadable from a scan. These
 * were measured before that happened. Nothing else may be shown as an end
 * ledger, which is why this reads from the schedule rather than a constant.
 */
function readKnownEnds() {
  const schedule = JSON.parse(readFileSync(join(repo, 'ops/crossing-schedule.json'), 'utf8'));
  const ends = {};
  for (const watch of schedule.watches ?? []) {
    const s = watch.subject;
    if (!s?.contractId) continue;
    ends[s.contractId] = {
      ...(typeof s.label === 'string' ? { label: s.label } : {}),
      ...(typeof s.expiresAtLedger === 'number' ? { instance: s.expiresAtLedger } : {}),
      ...(typeof s.persistentExpiresAtLedger === 'number'
        ? { persistent: s.persistentExpiresAtLedger }
        : {}),
      // Date only. The closing record says the wall-clock crossing time is
      // "derived, and not observed", so no time of day is published here.
      ...(typeof s.expiresAtUtc === 'string' ? { endsOn: s.expiresAtUtc.slice(0, 10) } : {}),
      ...(typeof s.crossesAtUtc === 'string' ? { crossesOn: s.crossesAtUtc.slice(0, 10) } : {}),
      status: watch.status,
    };
  }
  if (Object.keys(ends).length === 0) {
    throw new Error(
      'ops/crossing-schedule.json yielded no subjects; expired entries would lose their end ledger',
    );
  }

  // The operational C watch remains open for Shared acceptance. That does not
  // erase the separately assessed expiry observation already committed on main.
  // Read its sealed record for the public chart without changing the schedule
  // or upgrading the collector's frozen v1 verdict.
  const cAssessmentSource = 'docs/evidence/2026-09-26-c-expiry-1202/assessment.json';
  const cAssessmentPath = join(repo, cAssessmentSource);
  if (existsSync(cAssessmentPath)) {
    const c = schedule.watches.find((watch) => watch.subject?.label === 'guinea-pig C');
    const assessment = JSON.parse(readFileSync(cAssessmentPath, 'utf8'));
    if (
      !c ||
      assessment.subject !== 'C' ||
      assessment.phase !== 'expiry-observed' ||
      assessment.recordedVerdict?.phase !== 'unverified' ||
      !Number.isInteger(assessment.ledger) ||
      assessment.ledger <= c.subject.persistentExpiresAtLedger
    ) {
      throw new Error('C expiry assessment does not match the protected subject and end ledgers');
    }
    ends[c.subject.contractId].expiryObserved = {
      ledger: assessment.ledger,
      observedAt: assessment.observedAt,
      source: cAssessmentSource,
    };
  }
  return ends;
}

function readCli() {
  const command = readFileSync(join(repo, 'packages/cli/src/command.ts'), 'utf8');
  /**
   * `parseUsage` lives in its own module so the parsing can be tested on
   * fixtures; the assertions stay here, where the message can say what this
   * build was about to publish. `readCli` exists to fail when `command.ts`
   * moves, and for this class of change it did not fail — it degraded.
   */
  const { usage, segments } = parseUsage(command);
  const helpStart = command.indexOf('const HELP = ');
  const helpEnd = command.indexOf('`;', helpStart);
  if (segments.length === 0 || helpStart < 0 || helpEnd < 0) {
    throw new Error('packages/cli/src/command.ts moved under the web build: USAGE/HELP not found');
  }
  /**
   * Both commands appear in USAGE. This is the assertion the old reader needed
   * and did not have.
   *
   * There is deliberately no "did an escape survive?" check beside it. The
   * literal backslash-n on the page was a symptom of this same root cause, and
   * once `parseUsage` resolves escapes in one pass the only way a backslash-n
   * can reach the page is when `command.ts` legitimately contains an escaped
   * backslash followed by an `n` — so such a check could only ever fire as a
   * false positive. A check that cannot fail correctly is worse than no check.
   */
  for (const command_name of ['evergreen scan', 'evergreen extend']) {
    if (!usage.includes(command_name)) {
      throw new Error(
        `USAGE in command.ts no longer states \`${command_name}\`; the docs page would publish ` +
          `an incomplete usage. Read ${segments.length} segment(s): ${JSON.stringify(usage)}`,
      );
    }
  }
  const help = command
    .slice(helpStart, helpEnd)
    .replace(/^const HELP = `\$\{USAGE\}\n/, usage + '\n');
  for (const flag of [
    '--keys-file',
    '--no-data-keys',
    '--require-declared-scope',
    '--json',
    '--cost',
    '--optimize',
  ]) {
    if (!help.includes(flag))
      throw new Error(
        `CLI help no longer documents ${flag}; the /docs page would disagree with the tool`,
      );
  }
  const scan = readFileSync(join(repo, 'packages/cli/src/scan.ts'), 'utf8');
  const exits = {
    ok: scan.match(/EXIT_OK = (\d)/)?.[1],
    below: scan.match(/EXIT_BELOW_THRESHOLD = (\d)/)?.[1],
    error: scan.match(/EXIT_ERROR = (\d)/)?.[1],
    incomplete: scan.match(/EXIT_INCOMPLETE = (\d)/)?.[1],
  };
  if (exits.ok !== '0' || exits.below !== '1' || exits.error !== '2' || exits.incomplete !== '3') {
    throw new Error(
      'packages/cli/src/scan.ts moved under the web build: exit constants are not 0/1/2/3',
    );
  }
  /**
   * The package name and version the landing prints, read from the manifest
   * that was published rather than typed. A quickstart that names a version
   * nobody shipped is worse than no quickstart.
   */
  const manifest = JSON.parse(readFileSync(join(repo, 'packages/cli/package.json'), 'utf8'));
  if (!manifest.name || !manifest.version) {
    throw new Error('packages/cli/package.json has no name or version; the landing prints both');
  }
  /**
   * The extend command's own help, read from the source for the same reason
   * as scan's: a page that retypes a guard can lose one, and the guards are
   * the reason this command is safe to document at all.
   */
  const extendSrc = readFileSync(join(repo, 'packages/cli/src/extend.ts'), 'utf8');
  const extendStart = extendSrc.indexOf('export const EXTEND_HELP = `');
  const extendEnd = extendSrc.indexOf('`;', extendStart);
  if (extendStart < 0 || extendEnd < 0) {
    throw new Error('packages/cli/src/extend.ts moved under the web build: EXTEND_HELP not found');
  }
  const extendHelp = extendSrc.slice(
    extendStart + 'export const EXTEND_HELP = `'.length,
    extendEnd,
  );
  for (const guard of ['--submit', '--secret-env', '--max-fee-stroops', 'Testnet only']) {
    if (!extendHelp.includes(guard)) {
      throw new Error(
        `extend help no longer documents ${guard}; the /docs page would understate the guards`,
      );
    }
  }
  return { help, extendHelp, exits, packageName: manifest.name, version: manifest.version };
}

/**
 * `/docs/…` page modules, named from their own route so the two cannot drift:
 * `/docs/cli/scan/` is `src/pages/docs/cli-scan.mjs`, and `/docs/` is
 * `overview`. `/docs/archival/` is declared above instead, because it is the
 * one documentation page that reads the chain in the browser.
 */
function docModule(route) {
  const slug = route
    .replace(/^\/docs\/?/, '')
    .replace(/\/$/, '')
    .replace(/\//g, '-');
  return `src/pages/docs/${slug || 'overview'}.mjs`;
}

const CAPTURE = 'docs/evidence/2026-09-12-w2-review/scan-a-human.txt';

const snapshot = readJson('data/snapshot.json');

/**
 * The shared `ContractCode` entry's end, read from the snapshot rather than
 * typed into a page.
 *
 * This entry is the product's headline — one entry built from one Wasm, shared
 * by all three contracts, 98% of the bill, and they stop together. Its end
 * ledger was a literal in two pages (`5290829`, four occurrences). It was
 * extended to 8,297,162 on 2026-10-14 (#296) and the pages went on announcing
 * the old number in the present tense for five days, two of them inside the
 * window the old number named.
 *
 * Exactly one code entry, asserted: the three contracts share one, and that
 * sharing IS the claim. If a snapshot ever carries two, the pages would be
 * picking one of them silently and the sentence beside the number would be
 * false.
 */
function readSharedCodeEnd() {
  const code = Object.values(snapshot.result.entries).filter((e) => e.kind === 'code');
  if (code.length !== 1) {
    throw new Error(
      `the snapshot holds ${code.length} code entries; the pages say the three contracts share one`,
    );
  }
  const [entry] = code;
  if (entry.ttl.status !== 'known' || typeof entry.ttl.endsAtLedger !== 'number') {
    throw new Error(
      'the snapshot has no readable end for the shared code entry; a page would have nothing to show',
    );
  }
  return { ledger: entry.ttl.endsAtLedger, observedAtLedger: entry.observedAtLedger };
}

const sharedCodeEnd = readSharedCodeEnd();
const grades = readJson('data/snapshot-grades.json');
if (grades.capturedAt !== snapshot.capturedAt) {
  throw new Error(
    'data/snapshot-grades.json is not graded from data/snapshot.json — rerun scripts/grade-snapshot.mjs',
  );
}
const decay = readJson('data/decay.json');
const archival = readJson('data/archival.json');
const cli = readCli();
const knownEnds = readKnownEnds();

/**
 * Written rather than injected with esbuild's `define`.
 *
 * A `define` turned out to disable cross-module tree-shaking: the bundle went
 * from 6 core modules to 22 and pulled the entire write path in with it. The
 * write-path guard caught that, which is the whole reason it exists. A plain
 * JSON import tree-shakes normally and is typed.
 */
/**
 * `label` is dropped on the way out: the documentation page that needs it runs
 * at build time, and the browser bundles import this file, so a string no
 * client reads would otherwise ride into three 760 KB bundles.
 */
writeFileSync(
  join(here, 'data/known-ends.json'),
  `${JSON.stringify(
    Object.fromEntries(
      Object.entries(knownEnds).map(([id, end]) => [
        id,
        Object.fromEntries(Object.entries(end).filter(([field]) => field !== 'label')),
      ]),
    ),
    null,
    2,
  )}\n`,
);
const evidence = {
  count: readdirSync(join(repo, 'docs/evidence'), { withFileTypes: true }).filter((d) =>
    d.isDirectory(),
  ).length,
};
if (evidence.count === 0)
  throw new Error('no evidence bundles found; the /evidence count would be a lie');

/**
 * The unretouched scan. Read here rather than pasted into a page so the file
 * under `docs/evidence/` stays the only copy — nobody edits that directory,
 * and a second copy in markup is a copy that can be tidied.
 */
const capture = {
  text: readFileSync(join(repo, CAPTURE), 'utf8').trimEnd(),
  provenance: `Captured on 2026-09-12 and committed at <span class="mono">${CAPTURE}</span>. Its ledger numbers are from that day; the dashboard reads the chain now.`,
};

/**
 * The hero artefact, if one has been dropped in.
 *
 * `apps/web/src/assets/hero.<ext>` plus `hero.txt` beside it — an image or an
 * mp4. Absent, the page renders the reserved slot and nothing else.
 *
 * The description is required rather than defaulted: a generic one on a file
 * nobody here has seen is a caption that is probably wrong, and a wrong one is
 * worse for a screen reader than the honest refusal to guess.
 *
 * A video also wants `hero-poster.jpg`. Without it the slot is the hero's own
 * green until the first frame decodes, and a visitor on a slow connection
 * opens the site on an empty rectangle.
 */
const HERO = /^hero\.(png|jpg|jpeg|webp|avif|svg|mp4)$/i;

function readHeroImage() {
  const dir = join(here, 'src/assets');
  if (!existsSync(dir)) return null;
  const found = readdirSync(dir).filter((name) => HERO.test(name));
  if (found.length === 0) return null;
  if (found.length > 1) {
    throw new Error(
      `apps/web/src/assets holds ${found.length} hero files: ${found.join(', ')} — keep one`,
    );
  }
  const altPath = join(dir, 'hero.txt');
  if (!existsSync(altPath)) {
    throw new Error(
      `${found[0]} has no description. Write one sentence describing it to ` +
        'apps/web/src/assets/hero.txt — the hero is the first thing on the site and it is not shipping undescribed.',
    );
  }
  const alt = readFileSync(altPath, 'utf8').trim();
  if (alt.length < 10) {
    throw new Error('apps/web/src/assets/hero.txt is empty or too short to describe the artefact');
  }
  const video = found[0].toLowerCase().endsWith('.mp4');
  const poster = video && existsSync(join(dir, 'hero-poster.jpg')) ? 'hero-poster.jpg' : null;
  // Optional, and genuinely optional: without it a phone simply downloads the
  // full file, which works and is only heavier.
  const small = video && existsSync(join(dir, 'hero-sm.mp4')) ? 'hero-sm.mp4' : null;
  if (video && !poster) {
    throw new Error(
      'hero.mp4 has no hero-poster.jpg beside it; the slot would be empty until the video decodes',
    );
  }
  /**
   * Cloudflare Pages refuses any single file over 25 MiB, and the whole site is
   * served from the committed build — so a file that is too large does not fail
   * loudly at deploy time, it fails as a hero that never loads.
   */
  const bytes = statSync(join(dir, found[0])).size;
  if (bytes > 20 * 1024 * 1024) {
    throw new Error(
      `${found[0]} is ${(bytes / 1048576).toFixed(1)} MB; Cloudflare Pages refuses files over 25 MiB. Re-encode it smaller.`,
    );
  }
  return {
    file: found[0],
    src: `/assets/${found[0]}`,
    alt,
    video,
    poster: poster ? `/assets/${poster}` : null,
    posterFile: poster,
    small: small ? `/assets/${small}` : null,
    smallFile: small,
    smallBytes: small ? statSync(join(dir, small)).size : 0,
    bytes,
  };
}

/**
 * The shipped example config, with its underscore-prefixed documentation
 * fields removed. Printed rather than retyped: a configuration reference that
 * describes a field the loader does not accept is worse than none.
 */
function readEngineConfig() {
  const raw = JSON.parse(readFileSync(join(repo, 'evergreen.config.example.json'), 'utf8'));
  const strip = (value) =>
    Array.isArray(value)
      ? value.map(strip)
      : value && typeof value === 'object'
        ? Object.fromEntries(
            Object.entries(value)
              .filter(([key]) => !key.startsWith('_'))
              .map(([key, inner]) => [key, strip(inner)]),
          )
        : value;
  const cleaned = strip(raw);
  for (const required of ['network', 'defaults', 'contracts', 'payers', 'mode']) {
    if (!(required in cleaned)) {
      throw new Error(
        `evergreen.config.example.json lost its ${required} block; the docs page documents it`,
      );
    }
  }
  return JSON.stringify(cleaned, null, 2);
}

/**
 * Both tiers, read from the constants the CLI and core actually use. A page
 * that hard-codes 17,280 is a fifth copy site for a number `check:policy`
 * already asserts agreement on across four.
 */
function readThresholds() {
  const health = readFileSync(join(repo, 'packages/core/src/health.ts'), 'utf8');
  const scan = readFileSync(join(repo, 'packages/cli/src/scan.ts'), 'utf8');
  const warn = health.match(/DEFAULT_WARN_LEDGERS = ([\d_]+)/)?.[1];
  const act = scan.match(/DEFAULT_THRESHOLD_LEDGERS = ([\d_]+)/)?.[1];
  if (!warn || !act) {
    throw new Error('threshold constants moved; the docs page prints both tiers');
  }
  return { warn: Number(warn.replaceAll('_', '')), act: Number(act.replaceAll('_', '')) };
}

/**
 * The Action's inputs, parsed from `action.yml`. A hand-written table drifts
 * from the manifest the moment someone adds an input, and the drift is
 * invisible until a user passes something the Action ignores.
 *
 * Deliberately a narrow parser rather than a YAML dependency: it understands
 * exactly the three keys this manifest uses, and it throws when the shape
 * changes instead of quietly returning less.
 */
function readAction() {
  const src = readFileSync(join(repo, 'action.yml'), 'utf8');
  const block = src.slice(src.indexOf('\ninputs:'), src.indexOf('\noutputs:'));
  const inputs = [];
  let current = null;
  let folding = false;
  for (const line of block.split('\n')) {
    const name = /^ {2}([a-z][a-z0-9-]*):\s*$/.exec(line);
    if (name) {
      current = { name: name[1], description: '', required: false, default: '' };
      inputs.push(current);
      folding = false;
      continue;
    }
    if (!current) continue;
    const description = /^ {4}description:\s*(.*)$/.exec(line);
    if (description) {
      folding = description[1].trim() === '>-' || description[1].trim() === '>';
      if (!folding) current.description = description[1].trim();
      continue;
    }
    const required = /^ {4}required:\s*(true|false)\s*$/.exec(line);
    if (required) {
      current.required = required[1] === 'true';
      folding = false;
      continue;
    }
    const fallback = /^ {4}default:\s*'?([^']*)'?\s*$/.exec(line);
    if (fallback) {
      current.default = fallback[1].trim();
      folding = false;
      continue;
    }
    if (folding && line.startsWith('      ')) {
      current.description = `${current.description} ${line.trim()}`.trim();
    }
  }
  const output = /exit-code:\s*\n\s*description:\s*'([^']+)'/.exec(src)?.[1];
  if (inputs.length < 5 || !output) {
    throw new Error(
      `action.yml parsed to ${inputs.length} inputs and ${output ? 'an' : 'no'} output; the docs page documents both`,
    );
  }
  for (const required of ['contracts', 'threshold', 'keys-file', 'no-data-keys']) {
    if (!inputs.some((input) => input.name === required)) {
      throw new Error(
        `action.yml no longer declares ${required}; the CI reference would understate it`,
      );
    }
  }
  return { inputs, output };
}

/**
 * The ScanResult declaration, printed rather than paraphrased. A paraphrase of
 * a type is a second type that nothing checks.
 */
function readScanResultType() {
  const src = readFileSync(join(repo, 'packages/shared-types/src/index.ts'), 'utf8');
  const start = src.indexOf('export interface ScanResult');
  if (start < 0)
    throw new Error('shared-types no longer exports ScanResult; /docs/reference/json documents it');
  const end = src.indexOf('\n}', start);
  if (end < 0) throw new Error('ScanResult declaration is not closed where the docs build expects');
  return src.slice(start, end + 2);
}

const heroImage = readHeroImage();

const ctx = {
  snapshot,
  snapshotLedger: Math.max(
    ...Object.values(snapshot.result.entries).map((e) => e.observedAtLedger),
  ),
  snapshotCapturedAt: snapshot.capturedAt,
  sharedCodeEnd,
  grades,
  decay,
  archival,
  cli,
  evidence,
  knownEnds,
  capture,
  heroImage,
  engineConfig: readEngineConfig(),
  action: readAction(),
  scanResultType: readScanResultType(),
  thresholds: readThresholds(),
};

const PAGES = [
  { module: 'src/pages/landing.mjs', to: 'index.html' },
  {
    module: 'src/pages/overview.mjs',
    entry: 'src/pages/overview.ts',
    js: 'assets/overview.js',
    to: 'dashboard/index.html',
  },
  {
    module: 'src/pages/scanner.mjs',
    entry: 'src/pages/scanner.ts',
    js: 'assets/scanner.js',
    to: 'dashboard/scanner/index.html',
  },
  {
    module: 'src/pages/blast-radius.mjs',
    entry: 'src/pages/blast-radius.ts',
    js: 'assets/blast-radius.js',
    to: 'dashboard/blast-radius/index.html',
  },
  { module: 'src/pages/decay.mjs', to: 'dashboard/decay/index.html' },
  { module: 'src/pages/contracts.mjs', to: 'dashboard/contracts/index.html' },
  { module: 'src/pages/engine.mjs', to: 'dashboard/engine/index.html' },
  { module: 'src/pages/history.mjs', to: 'dashboard/history/index.html' },
  {
    module: 'src/pages/archival.mjs',
    entry: 'src/pages/archival.ts',
    js: 'assets/archival.js',
    to: 'docs/archival/index.html',
    doc: '/docs/archival/',
  },
  { module: 'src/pages/about.mjs', to: 'about/index.html' },
];

for (const page of DOC_PAGES) {
  if (PAGES.some((existing) => existing.doc === page.route)) continue;
  PAGES.push({
    module: docModule(page.route),
    to: `${page.route.replace(/^\/|\/$/g, '')}/index.html`,
    doc: page.route,
  });
}

function guardBundle(metafile, label) {
  const included = Object.entries(metafile.outputs)
    .flatMap(([, o]) => Object.entries(o.inputs))
    .filter(([path, info]) => info.bytesInOutput > 0 && path.includes('packages/core/src/'))
    .map(([path]) => path.split('packages/core/src/')[1]);
  const breaches = included.filter((f) => FORBIDDEN.includes(f));
  if (breaches.length > 0) {
    throw new Error(
      `${label}: core's write path reached a read-only bundle: ${breaches.join(', ')}`,
    );
  }
  return included;
}

/**
 * What is actually in a browser bundle, by input bytes, largest first.
 *
 * Reported every build because the alternative is a remembered number, and a
 * remembered number here was wrong for weeks. The backlog said these bundles
 * were large "because core is embedded separately in each", and the planning
 * that followed was aimed at deduplicating core. Measured on 2026-10-15:
 *
 *   @stellar/stellar-sdk    664 KB   87–91%
 *   @evergreen-stellar/core  13–18 KB   1.8–2.3%
 *
 * Deduplicating core would save about 17 KB a page. The SDK is the bundle.
 *
 * And the SDK is not reachable by import surgery, which is the obvious next
 * idea. It publishes subpath exports, and they all land in the same place
 * because `xdr` is 506 KB of generated definitions and `rpc.Server` needs it:
 *
 *   { Networks, rpc } from the root barrel      630 KB   (what we import)
 *   * as rpc from './rpc' + Networks './base'   630 KB   no saving at all
 *   { Server } from './rpc'                     629 KB
 *   { xdr } from './base'                       506 KB   the floor
 *   { Networks } from './base'                    0 KB
 *
 * So ~165 KB gzipped per live page is the price of a browser that reads the
 * chain with no server in between, and that is the trust property the product
 * argues for: anyone can check a contract without trusting us. Fatih decided
 * on 2026-10-15 to pay it and keep public scanning client-side. The watchlist
 * and the autopilot go through the API because they need a server anyway.
 */
function reportComposition(metafile, js) {
  const output = Object.values(metafile.outputs).find((o) => o.bytes > 0);
  if (!output) return;
  const buckets = new Map();
  for (const [path, info] of Object.entries(output.inputs)) {
    if (info.bytesInOutput === 0) continue;
    const after = path.includes('node_modules/') ? path.split('node_modules/').pop() : null;
    const key = after
      ? after.startsWith('@')
        ? after.split('/').slice(0, 2).join('/')
        : after.split('/')[0]
      : 'our own source';
    buckets.set(key, (buckets.get(key) ?? 0) + info.bytesInOutput);
  }
  const [name, bytes] = [...buckets].sort((a, b) => b[1] - a[1])[0];
  const size = output.bytes < 1024 ? `${output.bytes} B` : `${(output.bytes / 1024).toFixed(0)} KB`;
  console.log(
    `  ${js.padEnd(32)} ${size} minified, ${((bytes / output.bytes) * 100).toFixed(0)}% ${name}`,
  );
}

async function bundle(entry, js) {
  const result = await esbuild.build({
    entryPoints: [join(here, entry)],
    outfile: join(out, js),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    target: 'es2022',
    minify: true,
    metafile: true,
    legalComments: 'none',
    nodePaths: [join(repo, 'node_modules')],
    logLevel: 'error',
  });
  reportComposition(result.metafile, js);
  return guardBundle(result.metafile, js);
}

async function buildPage(page) {
  const { meta, render } = await import(join(here, page.module));
  let coreModules = 0;
  if (page.entry) {
    const included = await bundle(page.entry, page.js);
    coreModules = included.length;
  }
  const isDoc = typeof page.doc === 'string';
  const render_shell = isDoc || meta.layout === 'site' ? siteShell : shell;
  /**
   * A documentation page's heading lives in its own meta and its title lives
   * in the sitemap; if they disagree the sidebar promises one page and the
   * reader arrives at another.
   */
  if (isDoc) {
    const entry = DOC_PAGES.find((candidate) => candidate.route === page.doc);
    if (!entry)
      throw new Error(`${page.to} is built as a doc but ${page.doc} is not in the sitemap`);
    if (meta.heading !== entry.title) {
      throw new Error(
        `${page.doc}: the sitemap calls this "${entry.title}" and the page calls itself "${meta.heading}"`,
      );
    }
  }
  const body = isDoc
    ? docsLayout({
        route: page.doc,
        heading: meta.heading,
        lead: meta.lead,
        body: render(ctx),
      })
    : render(ctx);
  const html = render_shell({
    title: meta.title,
    description: meta.description,
    active: isDoc ? '/docs/' : meta.active,
    navTone: meta.navTone,
    eyebrow: isDoc ? undefined : meta.eyebrow,
    heading: isDoc ? undefined : meta.heading,
    lead: isDoc ? undefined : meta.lead,
    body,
    script: page.entry ? `/${page.js}` : (meta.script ?? null),
    cadence: CADENCE,
  });
  const target = join(out, page.to);
  mkdirSync(dirname(target), { recursive: true });
  /**
   * Strip trailing whitespace from every line before writing.
   *
   * A template literal that interpolates a conditional leaves the indentation
   * behind when the condition is false, so an empty `${…}` becomes a line of
   * spaces. `git diff --check` reports each one, and chasing them template by
   * template fixes today's and not tomorrow's — this is the whole class, at
   * the one place every page is written.
   */
  writeFileSync(target, html.replace(/[ \t]+$/gm, ''));
  /**
   * Report the HTML, not the intention.
   *
   * This line used to read `page.entry ? 'script, core modules: N' : ...`, so
   * it printed "script" for `/docs/archival/` on every build while the shell
   * silently dropped the field and emitted none. A log derived from the input
   * cannot witness the output. The assertion below is the same thought with
   * teeth: a page that was given a bundle must point at it.
   */
  const emitted = [...html.matchAll(/<script src="([^"]+)"><\/script>/g)].map(([, src]) => src);
  if (page.entry && !emitted.includes(`/${page.js}`)) {
    throw new Error(
      `${page.to} was bundled to /${page.js} but the rendered HTML does not load it` +
        `${emitted.length > 0 ? ` (it loads ${emitted.join(', ')})` : ' (it loads nothing)'}`,
    );
  }
  console.log(
    `  ${page.to.padEnd(32)} ${
      page.entry
        ? `loads /${page.js}, core modules: ${coreModules}`
        : emitted.length > 0
          ? `loads ${emitted.join(', ')}`
          : 'static, no script'
    }`,
  );
}

async function commission() {
  const probe = join(here, '.commission-probe.ts');
  writeFileSync(probe, "export { planExtension } from '../../packages/core/src/index';\n");
  const result = await esbuild.build({
    entryPoints: [probe],
    outfile: join(here, '.commission-probe.js'),
    bundle: true,
    format: 'iife',
    platform: 'browser',
    metafile: true,
    write: false,
    nodePaths: [join(repo, 'node_modules')],
    logLevel: 'error',
  });
  try {
    guardBundle(result.metafile, 'probe');
    console.error(
      '✗ the write-path guard passed a bundle that imports planExtension — it guards nothing',
    );
    process.exitCode = 1;
  } catch (error) {
    console.log(`✓ the guard refuses a write-path bundle: ${error.message}`);
  } finally {
    // Throwaway. Left behind, it is linted as source.
    rmSync(probe, { force: true });
  }
  commissionAssetGuards();
  await commissionFutureEnd();
}

/**
 * Prove the PAGES are wired to `futureEnd`, not merely that `futureEnd` works.
 *
 * Its unit tests pass whether or not anything calls it. The defect being
 * guarded is a page stating a stale ledger, so the thing worth proving is that
 * the pages refuse one — which means rendering them against a snapshot that
 * has aged past the entry they describe, and watching them throw.
 *
 * `5290829` is the real number: the shared code entry's end before #296
 * extended it, against a snapshot observed after that ledger had passed. This
 * is the exact state the site was in for five days.
 */
async function commissionFutureEnd() {
  const stale = {
    ...ctx,
    sharedCodeEnd: { ledger: 5_290_829, observedAtLedger: 5_300_000 },
  };
  for (const module of ['src/pages/contracts.mjs', 'src/pages/decay.mjs']) {
    const { render } = await import(join(here, module));
    try {
      render(stale);
      console.error(
        `✗ ${module} rendered a shared code entry that had already expired; it is not using futureEnd`,
      );
      process.exitCode = 1;
    } catch (error) {
      if (!String(error.message).includes('not ahead of the snapshot')) {
        console.error(`✗ ${module} failed, but not about a stale end ledger: ${error.message}`);
        process.exitCode = 1;
      } else {
        console.log(`✓ ${module} refuses a shared code entry that has already expired`);
      }
    }
  }
}

/**
 * The two asset guards, proven in both directions on a copy of the output.
 *
 * A copy, not the output itself: these plant real defects, and the directory
 * they would plant them in is the one Cloudflare Pages publishes. The copy is
 * `.commission-probe.out`, which `apps/web/.gitignore` already covers.
 *
 * `expect` is deliberately shaped so that a guard which cannot fail is a
 * FAILURE of this function. A gate nobody has watched fail is a decoration,
 * and `guardPublishedAssets` exists only because the three guards before it
 * all passed while a 748 KB orphan served to nobody.
 */
function commissionAssetGuards() {
  const copy = join(here, '.commission-probe.out');
  const expect = (label, mutate, guard, fragment) => {
    rmSync(copy, { recursive: true, force: true });
    cpSync(out, copy, { recursive: true });
    mutate();
    try {
      guard(copy);
    } catch (error) {
      if (!error.message.includes(fragment)) {
        console.error(`✗ ${label}: the guard failed, but not about ${fragment}: ${error.message}`);
        process.exitCode = 1;
        return;
      }
      console.log(`✓ ${label}`);
      return;
    }
    console.error(`✗ ${label}: the guard passed. It guards nothing.`);
    process.exitCode = 1;
  };

  // The defect that actually shipped: a page loses its script, and the bundle
  // it was built for keeps being published.
  expect(
    'an orphaned bundle is refused',
    () => {
      const page = join(copy, 'docs/archival/index.html');
      writeFileSync(
        page,
        readFileSync(page, 'utf8').replace('<script src="/assets/archival.js"></script>', ''),
      );
    },
    guardPublishedAssets,
    'archival.js',
  );

  // Any asset nothing reaches, not only a bundle.
  expect(
    'an asset no reader mentions is refused',
    () => writeFileSync(join(copy, 'assets/planted-orphan.json'), '{}\n'),
    guardPublishedAssets,
    'planted-orphan.json',
  );

  // The other direction, which `guardReferencedAssets` owns.
  expect(
    'a reference to a missing asset is refused',
    () => rmSync(join(copy, 'assets/styles.css')),
    guardReferencedAssets,
    'styles.css',
  );

  /**
   * And what the orphan guard must NOT do: flag an asset that only
   * JavaScript or only CSS reaches. The clean build passing is that proof —
   * but only while those two assets are genuinely absent from every page's
   * HTML. If a page ever names them, the clean pass stops proving anything
   * and this half of the commission goes quiet, so it is asserted rather
   * than assumed.
   */
  const html = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html')) html.push(readFileSync(path, 'utf8'));
    }
  };
  walk(out);
  for (const [name, reader] of [
    ['snapshot.json', 'overview.ts fetches it'],
    ['evergreen-logo-mask.svg', 'styles.css masks with it'],
  ]) {
    if (html.some((page) => page.includes(`/assets/${name}`))) {
      console.error(
        `✗ ${name} is now referenced from HTML, so the clean build no longer proves ` +
          `that the guard consults ${reader === 'overview.ts fetches it' ? 'bundles' : 'stylesheets'}`,
      );
      process.exitCode = 1;
    } else {
      console.log(`✓ ${name} is reached only because ${reader} — and the guard is quiet`);
    }
  }
  rmSync(copy, { recursive: true, force: true });
}

console.log('building the twelve-page preview into apps/dashboard/public');
/**
 * Start from an empty directory. A previous build's orphan is worse than a
 * missing file: it keeps serving, it is committed, and nothing regenerates it
 * — a stale bundle pointed at an unreachable RPC survived one rebuild here
 * before this line existed.
 */
/**
 * Typecheck before emitting anything.
 *
 * `apps/web` had no tsconfig, so nothing ever typechecked it, and
 * `readStateArchivalSettings` — imported under an alias and then called by its
 * original name — shipped to the deployed preview. Every rent estimate threw a
 * ReferenceError, and the catch told the visitor the NETWORK had declined to
 * simulate. `tsc` names that in under a second.
 */
console.log('typechecking apps/web');
try {
  execFileSync('npx', ['tsc', '-p', join(here, 'tsconfig.json')], {
    cwd: repo,
    stdio: 'inherit',
  });
} catch {
  throw new Error('apps/web does not typecheck; refusing to build');
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

for (const page of PAGES) {
  await buildPage(page);
}

// The shell's live-ledger script. No core, no SDK — one getHealth read.
await bundle('src/chrome-client.ts', 'assets/chrome.js');

mkdirSync(join(out, 'assets'), { recursive: true });
cpSync(join(here, 'src/styles.css'), join(out, 'assets/styles.css'));
// Preserve the supplied JPEG as the source. Its green pixels become an alpha
// mask, while its near-white background becomes transparent. CSS supplies the
// foreground colour so the same mark works on both light and pine surfaces.
const logoSource = readFileSync(join(here, 'src/assets/evergreen-logo.jpeg')).toString('base64');
writeFileSync(
  join(out, 'assets/evergreen-logo-mask.svg'),
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="300 320 1050 880">
  <defs><filter id="cutout" color-interpolation-filters="sRGB" filterUnits="userSpaceOnUse" x="0" y="0" width="1536" height="1536">
    <feColorMatrix type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  -2 0 0 0 1.9" />
  </filter></defs>
  <image width="1536" height="1536" href="data:image/jpeg;base64,${logoSource}" filter="url(#cutout)" />
</svg>\n`,
);
cpSync(join(here, 'data/snapshot.json'), join(out, 'assets/snapshot.json'));
cpSync(join(here, 'data/archival.json'), join(out, 'assets/archival.json'));
if (heroImage) {
  for (const file of [heroImage.file, heroImage.posterFile, heroImage.smallFile].filter(Boolean)) {
    cpSync(join(here, 'src/assets', file), join(out, 'assets', file));
  }
  console.log(
    `  hero ${heroImage.video ? 'video' : 'image'}: ${heroImage.file} ` +
      `(${(heroImage.bytes / 1048576).toFixed(2)} MB)${heroImage.posterFile ? ` + ${heroImage.posterFile}` : ''}` +
      `${heroImage.smallFile ? ` + ${heroImage.smallFile} (${(heroImage.smallBytes / 1048576).toFixed(2)} MB)` : ''}`,
  );
}
/**
 * No rendered page may contain the residue of a lookup that did not resolve.
 *
 * `/dashboard/contracts` shipped "as of ledger NaN" and "expires ~NaN undefined
 * NaN" because a page read `grades.observedAtLedger`, which lives on each
 * grade rather than at the top level. Nothing asserted the lookup resolved, so
 * a typo became three rendered figures. This is that assertion.
 */
function guardRenderedPages() {
  const RESIDUE = /\bNaN\b|\bundefined\b|\bInfinity\b|\[object Object\]/;
  const offenders = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html')) {
        const match = RESIDUE.exec(readFileSync(path, 'utf8'));
        if (match) offenders.push(`${path.slice(out.length + 1)} contains ${match[0]}`);
      }
    }
  };
  walk(out);
  if (offenders.length > 0) {
    throw new Error(`rendered pages carry unresolved values:\n  ${offenders.join('\n  ')}`);
  }
}

/**
 * Moved pages keep answering at their old address.
 *
 * `/evidence/` became `/docs/evidence/` on 2026-09-26, and the old path kept
 * returning 200 from the host after the file had left the build — an orphan
 * that serves, cannot be regenerated, and drifts from the page that replaced
 * it. A redirect is the version that stays correct: the link a reader saved
 * still works, and it lands on the page that is maintained.
 */
const REDIRECTS = [['/evidence/*', '/docs/evidence/', 301]];

writeFileSync(
  join(out, '_redirects'),
  `${REDIRECTS.map(([from, to, code]) => `${from}  ${to}  ${code}`).join('\n')}\n`,
);
for (const [, to] of REDIRECTS) {
  if (!ROUTES.some((route) => route.route === to)) {
    throw new Error(`_redirects sends ${to}, which is not a route this site publishes`);
  }
}
console.log(`  _redirects: ${REDIRECTS.length} rule(s)`);

guardRenderedPages();

/**
 * Every asset a rendered page points at must exist in the output.
 *
 * `hero-sm.mp4` was announced by this build's own log and never copied: the
 * line that copied it and the line that reported it were edited separately,
 * and only one of them landed. The page then asked a phone for a file that
 * was not there, the video failed with a format error, and NOTHING caught it
 * — not the route manifest, not the residue guard, not the overflow check,
 * because a 404 on a video is invisible to all three. The build log is not
 * evidence that a file was written; this is.
 */
function guardReferencedAssets(root = out) {
  const missing = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name.endsWith('.html')) {
        const html = readFileSync(path, 'utf8');
        for (const [, url] of html.matchAll(/(?:src|href|poster)="(\/assets\/[^"]+)"/g)) {
          if (!existsSync(join(root, url.slice(1)))) {
            missing.push(`${path.slice(root.length + 1)} references ${url}, which was not written`);
          }
        }
      }
    }
  };
  walk(root);
  if (missing.length > 0) {
    throw new Error(
      `rendered pages reference assets that do not exist:\n  ${missing.join('\n  ')}`,
    );
  }
}

guardReferencedAssets();

/**
 * And the other direction: every asset written must be reached by something.
 *
 * `guardReferencedAssets` above proves that what a page points at exists. It
 * cannot see the inverse, and the inverse is what shipped: `/docs/archival/`
 * lost its `<script>` when the page moved into the documentation shell, so
 * `assets/archival.js` — 748,893 bytes of it — was built, published, served
 * with HTTP 200, and fetched by nobody for weeks. The page kept promising a
 * live reading it had no code to perform. A file that serves and is reachable
 * by no one is indistinguishable from a file that was never meant to exist,
 * and neither the route manifest, the residue guard nor the reference guard
 * can tell them apart.
 *
 * A reference from JavaScript or CSS counts, because it is a real reference:
 * `assets/snapshot.json` is fetched only by `overview.ts` and
 * `evergreen-logo-mask.svg` only by a `mask:` in the stylesheet. Searching the
 * published text of every page, bundle and stylesheet is what lets this guard
 * have no exception list — and an exception list is where a guard like this
 * goes to die.
 */
function guardPublishedAssets(root = out) {
  const assets = readdirSync(join(root, 'assets'), { withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name);
  const readers = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (/\.(html|css|js)$/.test(entry.name)) readers.push(path);
    }
  };
  walk(root);
  const orphans = assets.filter((name) => {
    const needle = `/assets/${name}`;
    return !readers.some(
      // Self-reference does not count: a bundle naming itself reaches nothing.
      (path) => !path.endsWith(`assets/${name}`) && readFileSync(path, 'utf8').includes(needle),
    );
  });
  if (orphans.length > 0) {
    throw new Error(
      'assets were published that no page, bundle or stylesheet references:\n  ' +
        orphans
          .map((name) => `${name} (${statSync(join(root, 'assets', name)).size} bytes)`)
          .join('\n  '),
    );
  }
  console.log(`  assets: ${assets.length} published, all referenced`);
}

guardPublishedAssets();

/**
 * The published routes and the route manifest must agree, in both directions.
 *
 * `apps/dashboard/src/index.ts` is the dashboard package's public surface and
 * the file the SOW completeness gate reads. Letting it drift from the build
 * would make it decoration; this makes it a claim that can be wrong.
 */
function guardRouteManifest() {
  const built = new Set();
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const path = join(dir, entry.name);
      if (entry.isDirectory()) walk(path);
      else if (entry.name === 'index.html') built.add(path.slice(out.length + 1));
    }
  };
  walk(out);
  const claimed = new Set(ROUTES.map((r) => pageFor(r.route)));
  const unclaimed = [...built].filter((p) => !claimed.has(p));
  const unbuilt = [...claimed].filter((p) => !built.has(p));
  if (unclaimed.length > 0 || unbuilt.length > 0) {
    throw new Error(
      'apps/dashboard/src/index.ts disagrees with what was built.' +
        (unbuilt.length > 0 ? `\n  claimed but not built: ${unbuilt.join(', ')}` : '') +
        (unclaimed.length > 0 ? `\n  built but not claimed: ${unclaimed.join(', ')}` : ''),
    );
  }
  console.log(`  routes: ${claimed.size} built and claimed`);
}

guardRouteManifest();

if (process.argv.includes('--commission')) await commission();
console.log('done');
