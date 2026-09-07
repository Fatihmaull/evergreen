#!/usr/bin/env node
/**
 * Fail if any tracked file contains an unresolved git conflict marker.
 *
 * Why this exists
 * ---------------
 * On 2026-09-07 a three-PR reconciliation left conflict markers in
 * `.prettierignore` on `main`, and `pnpm check` passed anyway: Prettier treats
 * an unparseable line as a pattern that matches nothing, so a broken ignore
 * file produced a green check. Rakha found it by reading the file.
 *
 * That is the third failure this sprint that succeeded in the safe-looking
 * direction — after a testnet guard that refused everything, and a local gate
 * weaker than CI. The pattern is consistent enough that the warning belongs in
 * a check rather than in a paragraph: prefer a rule that fails CI over a
 * sentence in a doc (docs/CONVENTIONS.md).
 *
 * Config files are the dangerous case. Source files with markers fail to parse
 * and something screams; `.prettierignore`, `.gitignore` and their kind absorb
 * garbage silently and simply stop meaning what they say.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';

// Anchored at line start, which is where git writes them. `=======` needs the
// exact length: `====` rules are ordinary Markdown and must not trip this.
const MARKERS = [/^<{7} /, /^={7}$/, /^>{7} /];

// This file necessarily contains marker-shaped strings.
const SELF = 'scripts/check-conflict-markers.mjs';

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean);
}

function isProbablyBinary(buf) {
  return buf.includes(0);
}

const findings = [];

for (const file of trackedFiles()) {
  if (file === SELF) continue;
  let buf;
  try {
    buf = readFileSync(file);
  } catch {
    continue; // deleted or unreadable in this checkout
  }
  if (isProbablyBinary(buf)) continue;

  buf
    .toString('utf8')
    .split('\n')
    .forEach((line, i) => {
      if (MARKERS.some((re) => re.test(line))) {
        findings.push({ file, line: i + 1, text: line.slice(0, 60) });
      }
    });
}

if (findings.length > 0) {
  console.error(`\n✖ ${findings.length} unresolved conflict marker(s):\n`);
  for (const f of findings) console.error(`  ${f.file}:${f.line}  ${f.text}`);
  console.error(
    '\nA marker in a config file does not fail loudly — it silently stops the\n' +
      'file meaning what it says. Resolve the merge properly, then re-run.\n',
  );
  process.exit(1);
}

console.log(`✓ no conflict markers in ${trackedFiles().length} tracked files`);
