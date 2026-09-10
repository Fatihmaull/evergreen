#!/usr/bin/env node
/**
 * Scan the publishable bundle for anything that must not leave the building.
 *
 * The repo forbids secrets in source and the config loader refuses a seed
 * anywhere in a config file. Bundling introduces a **new artifact class**: a
 * tarball strangers download. Nothing inspected it, and a bundler ships
 * whatever the import graph reaches — a fixture read at module scope, a
 * constant baked in during development, a helper pulled through a barrel.
 *
 * The first inspection (2026-09-10) was not clean. It found our own testnet
 * account hardcoded as the `--cost` simulation source: not a secret, but it put
 * our account in every user's traffic and would have broken `--cost` for
 * everyone the day that account went away. Removed — simulation needs no real
 * account at all.
 *
 * This is that inspection turned into a gate, which is the same move as the
 * config loader: a rule that runs beats a rule that is remembered.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const ENTRY = 'packages/cli/src/bin.ts';

const FORBIDDEN = [
  {
    label: 'Stellar SECRET seed',
    pattern: /\bS[A-Z2-7]{55}\b/g,
    why: 'A secret in a published artifact is a secret published to everyone. Rotate it.',
  },
  {
    label: 'Stellar account public key',
    pattern: /\bG[A-Z2-7]{55}\b/g,
    why: 'Baking an account into the artifact puts it in every user’s traffic, and breaks them when it goes away. Pass it at runtime instead.',
  },
  {
    label: 'absolute path from a developer machine',
    pattern: /\/(?:Users|home)\/[A-Za-z0-9._-]+\//g,
    why: 'Leaks a local filesystem layout, and the path will not exist for a user.',
  },
  {
    label: 'inline .env content',
    pattern: /\b(?:RESEND_API_KEY|DATABASE_URL|NEON_[A-Z_]+)\s*[:=]\s*["'][^"']+["']/g,
    why: 'Environment variable NAMES are fine; their VALUES are not.',
  },
];

let bundle;
try {
  const out = join(mkdtempSync(join(tmpdir(), 'evergreen-bundle-')), 'bundle.mjs');
  execFileSync(
    'npx',
    [
      '--yes',
      'esbuild@0.25.0',
      ENTRY,
      '--bundle',
      '--platform=node',
      '--format=esm',
      '--external:@stellar/stellar-sdk',
      `--outfile=${out}`,
    ],
    { stdio: 'pipe' },
  );
  bundle = readFileSync(out, 'utf8');
} catch (error) {
  console.error('✖ could not build the bundle to inspect it:');
  console.error(`  ${error instanceof Error ? error.message.split('\n')[0] : 'unknown'}`);
  // Failing closed: an artifact that cannot be inspected must not be assumed clean.
  process.exit(1);
}

const findings = [];
for (const { label, pattern, why } of FORBIDDEN) {
  const hits = [...new Set(bundle.match(pattern) ?? [])];
  if (hits.length > 0) findings.push({ label, hits, why });
}

if (findings.length > 0) {
  console.error('✖ the publishable bundle contains things that must not ship:\n');
  for (const f of findings) {
    console.error(`  ${f.label} — ${f.hits.length} distinct`);
    for (const hit of f.hits.slice(0, 3)) console.error(`    ${hit.slice(0, 60)}`);
    console.error(`    ${f.why}\n`);
  }
  process.exit(1);
}

console.log(
  `✓ publishable bundle clean (${(bundle.length / 1024).toFixed(1)}kb, ` +
    `${FORBIDDEN.length} forbidden patterns checked)`,
);
