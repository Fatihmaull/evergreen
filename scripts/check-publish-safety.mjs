#!/usr/bin/env node
/**
 * Guard the publishing decision so it cannot be undone by someone tired.
 *
 * Three defects in two days all came from workspace packages reaching a
 * published artifact:
 *
 *   Sep 9   `shared-types` declared at runtime, never published  -> E404
 *   Sep 10  `npm pack` left `workspace:*` literal                -> EUNSUPPORTEDPROTOCOL
 *   Sep 10  the rehearsal itself supplied `core` from a sibling  -> a false pass
 *
 * The decision that removes the class: **bundle, and publish exactly one
 * package.** `core` and `shared-types` are inlined into the CLI, stay
 * `private: true` permanently, and are build dependencies rather than runtime
 * ones. This asserts all of that, because a decision in a document is a
 * decision someone can undo without noticing.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const read = (p) =>
  JSON.parse(readFileSync(fileURLToPath(new globalThis.URL(`../${p}`, import.meta.url)), 'utf8'));
const problems = [];

for (const name of ['core', 'shared-types']) {
  const pkg = read(`packages/${name}/package.json`);
  if (pkg.private !== true) {
    problems.push(
      `packages/${name} has private:${pkg.private}. It must stay private — it is bundled into ` +
        'the CLI, not published. A stray `pnpm publish -r` would otherwise ship it.',
    );
  }
  if (pkg.publishConfig !== undefined) {
    problems.push(
      `packages/${name} declares publishConfig, which only matters for a package that publishes.`,
    );
  }
}

const cli = read('packages/cli/package.json');
if (cli.private !== false) {
  problems.push(
    'packages/cli must be publishable (private:false) — it is the one package that ships.',
  );
}
if (cli.main !== undefined || cli.types !== undefined || cli.exports !== undefined) {
  problems.push(
    'packages/cli exposes a library entry point, but only its evergreen binary is bundled. ' +
      'Publishing tsc library output would import the private core/shared-types packages at runtime.',
  );
}
const expectedBin = './dist/evergreen.mjs';
if (cli.bin?.evergreen !== expectedBin || Object.keys(cli.bin ?? {}).length !== 1) {
  problems.push(`packages/cli must expose exactly one binary: evergreen -> ${expectedBin}.`);
}
const expectedFiles = ['dist/evergreen.mjs', 'dist/evergreen.mjs.map'];
if (
  !Array.isArray(cli.files) ||
  cli.files.length !== expectedFiles.length ||
  expectedFiles.some((file, index) => cli.files[index] !== file)
) {
  problems.push(
    `packages/cli files must be exactly ${JSON.stringify(expectedFiles)} so unbundled tsc output ` +
      'cannot become an accidental public runtime surface.',
  );
}
for (const dep of Object.keys(cli.dependencies ?? {})) {
  if (dep.startsWith('@evergreen-stellar/')) {
    problems.push(
      `packages/cli declares ${dep} as a RUNTIME dependency. It is bundled, so this must live in ` +
        'devDependencies — a runtime declaration is what produced E404 and EUNSUPPORTEDPROTOCOL.',
    );
  }
}
for (const [dep, range] of Object.entries(cli.dependencies ?? {})) {
  if (/^[\^~]/.test(range)) {
    problems.push(
      `packages/cli pins ${dep} loosely ("${range}"). It is now the only thing between the CLI and ` +
        "the outside world; a loose range lets someone else's release break installs of a version " +
        'of ours that worked yesterday.',
    );
  }
}

if (problems.length > 0) {
  console.error('✖ publishing safety:\n');
  for (const p of problems) console.error(`  ${p}\n`);
  console.error('  See docs/CONVENTIONS.md § publish exactly one package.');
  process.exit(1);
}

console.log(
  '✓ publishing safety: one binary-only package, workspace deps bundled, runtime deps pinned',
);
