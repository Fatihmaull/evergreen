#!/usr/bin/env node
/**
 * B-D30-01 — verify every assessor-facing link AT SEND TIME.
 *
 * `check:links` checks reciprocal links, not existence; link-existence is parked
 * in B-D31-02. So nothing in the repo answers "does this open for Kenny?".
 *
 * Two classes, because one checker does not fit both:
 *   · external URLs — HTTP, but npmjs.com answers 403 to a real and a fabricated
 *     URL alike, so that host is routed to registry.npmjs.org, which discriminates.
 *   · relative links — local file existence, which is what a GitHub blob link
 *     resolves to.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const FILES = [
  'docs/B-D30-01-HANDOVER.md',
  'docs/SUBMISSION-INDEX.md',
  'docs/SUBMISSION-WALKTHROUGH.md',
];
const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/140.0 Safari/537.36';

const links = new Map(); // url -> Set(file)
for (const f of FILES) {
  const text = readFileSync(f, 'utf8');
  for (const m of text.matchAll(/\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g)) {
    const raw = m[1];
    if (raw.startsWith('#')) continue;
    if (!links.has(raw)) links.set(raw, new Set());
    links.get(raw).add(f);
  }
}

async function head(url) {
  // npmjs.com 403s indiscriminately — a check that answers the same for a real and
  // a bogus URL measures nothing. Route it to the registry, which returns 404.
  let probe = url.replace(
    /^https:\/\/www\.npmjs\.com\/package\/(@[^/]+\/[^/?#]+)(?:\/v\/([0-9.]+))?.*$/,
    (_, pkg, v) => `https://registry.npmjs.org/${pkg}${v ? '/' + v : ''}`,
  );
  // stellar.expert is a single-page app: it serves its shell with 200 for a
  // FABRICATED transaction hash, so a 200 there says nothing about whether the
  // transaction exists. Horizon does discriminate (200 real / 404 fabricated),
  // and these two hashes are Deliverable 2's primary evidence.
  probe = probe.replace(
    /^https:\/\/stellar\.expert\/explorer\/testnet\/tx\/([0-9a-f]{64}).*$/,
    (_, h) => `https://horizon-testnet.stellar.org/transactions/${h}`,
  );
  // RETRY ON TRANSPORT ERRORS ONLY, never on an HTTP response.
  //
  // Measured 2026-10-01: two links that were reachable minutes earlier, and
  // reachable by curl seconds later, came back UND_ERR_CONNECT_TIMEOUT in the
  // same run. A transient timeout and a dead link printed identically — and this
  // script's whole job is to be run immediately before handing the bundle over,
  // where crying wolf is its worst failure.
  //
  // A 404 is an ANSWER and is never retried: retrying one would turn a real
  // broken link into a slow green, which is the opposite of the point.
  const attempts = [];
  for (let i = 0; i < 3; i++) {
    try {
      // `globalThis.fetch`, matching scripts/sync-notion.mjs — the bare global is
      // not declared for .mjs in eslint.config.js and trips no-undef.
      const r = await globalThis.fetch(probe, {
        redirect: 'follow',
        headers: { 'User-Agent': UA },
      });
      return { code: r.status, probe: probe === url ? null : probe, attempts: i + 1 };
    } catch (e) {
      attempts.push(e.cause?.code ?? e.message);
      // `globalThis.setTimeout`, matching the retry backoff in scripts/sync-notion.mjs:188.
      if (i < 2) await new Promise((r) => globalThis.setTimeout(r, 1500 * (i + 1)));
    }
  }
  return {
    code: `ERR ${attempts[attempts.length - 1]}`.slice(0, 28),
    probe: null,
    attempts: 3,
  };
}

const rows = [];
for (const [raw, where] of links) {
  const files = [...where].map((f) => f.split('/').pop().replace('SUBMISSION-', '')).join(',');
  if (/^https?:\/\//.test(raw)) {
    const { code, probe } = await head(raw);
    rows.push({ kind: 'url', target: raw, ok: code === 200, detail: String(code), probe, files });
  } else {
    // relative — resolve against each file that uses it
    let ok = false,
      resolved = '';
    for (const f of where) {
      const p = resolve(join(dirname(f), raw.split('#')[0]));
      resolved = p;
      if (existsSync(p)) {
        ok = true;
        break;
      }
    }
    rows.push({
      kind: 'file',
      target: raw,
      ok,
      detail: ok ? 'exists' : 'MISSING',
      resolved,
      files,
    });
  }
}

// Plain codepoint ordering, NOT localeCompare: this output is a sealed evidence
// record, and a sort that depends on the reader's locale makes the record
// reorder itself on someone else's machine. `check:locale` catches this.
rows.sort(
  (a, b) => Number(a.ok) - Number(b.ok) || (a.target < b.target ? -1 : a.target > b.target ? 1 : 0),
);
const bad = rows.filter((r) => !r.ok);

console.log(`\n  B-D30-01 link verification — ${new Date().toISOString()}`);
console.log(`  ${rows.length} links from ${FILES.join(' + ')}\n`);
for (const r of bad)
  console.log(
    `  ✖ ${r.detail.padEnd(9)} ${r.target}   [${r.files}]${r.resolved ? '\n      → ' + r.resolved : ''}`,
  );
if (!bad.length) console.log('  ✓ every link resolves\n');
const urls = rows.filter((r) => r.kind === 'url'),
  files = rows.filter((r) => r.kind === 'file');
console.log(`  external URLs : ${urls.filter((r) => r.ok).length}/${urls.length} return 200`);
console.log(`  repo files    : ${files.filter((r) => r.ok).length}/${files.length} exist`);
const rerouted = rows.filter((r) => r.probe);
if (rerouted.length) {
  console.log();
  console.log(
    `\n  ${rerouted.length} link(s) verified against a DIFFERENT host than the document names.`,
  );
  console.log('  Each original answers IDENTICALLY for a real and a fabricated target, so a');
  console.log('  200 from it measures nothing. Rerouted to hosts that discriminate:');
  console.log('    npmjs.com       403 real AND bogus  ->  registry.npmjs.org   200 / 404');
  console.log('    stellar.expert  200 real AND bogus  ->  horizon-testnet      200 / 404');
  console.log('');
  for (const r of rerouted) console.log(`    ${r.detail}  ${r.target}\n        → ${r.probe}`);
}
process.exitCode = bad.length ? 1 : 0;
