#!/usr/bin/env node
/**
 * Fail if anything renders a number using the READER'S locale.
 *
 * Why this exists
 * ---------------
 * `toLocaleString()` with no argument formats using the runtime's locale, which
 * comes from the environment of whoever runs it. The same scan prints:
 *
 *   en-US   1,682,587      de-DE   1.682.587      fr-FR   1 682 586
 *
 * The French separator is U+202F, a narrow no-break space — it looks like a
 * space and fails a byte comparison invisibly.
 *
 * On 2026-09-14 exactly two call sites were pinned to 'en-US', in the engine's
 * run output. Nineteen others were not, including every number in `scan` and
 * `--cost` — which is precisely the output a sceptical reviewer re-runs against
 * our committed evidence, and precisely the report we least want questioned.
 *
 * A one-time fix does not hold: the next `toLocaleString()` someone writes is
 * unpinned by default, because that is the shorter thing to type. So this is a
 * gate rather than a convention.
 *
 * Use `formatCount` from `@evergreen-stellar/core`.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import process from 'node:process';
import console from 'node:console';

const ROOTS = ['packages', 'scripts'];
const SKIP = ['node_modules', 'dist', '.evergreen'];
const SELF = 'check-locale-pinning.mjs';
/** The one file allowed to name the unpinned form, because it explains it. */
const HOME = join('core', 'src', 'format.ts');

function walk(p) {
  if (SKIP.some((s) => p.includes(s))) return [];
  if (statSync(p).isDirectory()) return readdirSync(p).flatMap((c) => walk(join(p, c)));
  return /\.(ts|mjs|js)$/.test(p) && !p.endsWith('.d.ts') ? [p] : [];
}

/** Comments explain the hazard; they do not cause it. */
const stripComments = (text) =>
  text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const OFFENDERS = [
  [/\.toLocaleString\(\s*\)/, 'toLocaleString() with no locale'],
  [/\.toLocaleDateString\(\s*\)/, 'toLocaleDateString() with no locale'],
  [/\.toLocaleTimeString\(\s*\)/, 'toLocaleTimeString() with no locale'],
  // `new Intl.X().resolvedOptions()` QUERIES the ambient locale rather than
  // formatting with it. `capture-crossing-probe.mjs` does exactly that, on
  // purpose, to record the capturing machine's locale in the manifest — which is
  // how a verifier can tell a locale mismatch from a data mismatch. Reading the
  // environment is the fix for this hazard, not an instance of it.
  [/new Intl\.[A-Za-z]+\(\s*\)(?!\s*\.resolvedOptions)/, 'Intl formatter with no locale'],
  [/\.localeCompare\(([^,)]*)\)/, 'localeCompare() with no locale'],
];

const findings = [];
for (const file of ROOTS.flatMap(walk)) {
  if (file.endsWith(SELF) || file.endsWith(HOME)) continue;
  stripComments(readFileSync(file, 'utf8'))
    .split('\n')
    .forEach((line, i) => {
      for (const [pattern, what] of OFFENDERS)
        if (pattern.test(line)) findings.push({ file, line: i + 1, what });
    });
}

if (findings.length > 0) {
  console.error(`\n✖ ${findings.length} value(s) would render in the READER'S locale:\n`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.what}`);
  console.error(
    '\n  Use formatCount from @evergreen-stellar/core, or pass an explicit locale.\n' +
      "  Evidence that renders differently on the reviewer's machine reads as\n" +
      "  evidence that does not reproduce — and on B's crossing that is the one\n" +
      '  artifact we least want questioned.\n',
  );
  process.exit(1);
}
console.log('✓ every rendered number is pinned to an explicit locale');
