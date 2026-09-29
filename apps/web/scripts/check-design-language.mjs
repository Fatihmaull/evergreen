/**
 * The design-language reference must describe the stylesheet that ships.
 *
 * `web-reference/design-language/` exists so somebody outside this repository
 * — an agent cutting a video, a designer making a slide — can match the
 * product without access to the running site. A document like that has one
 * failure mode: it is right on the day it is written and quietly wrong a week
 * later, and nobody finds out until the deliverable arrives in the wrong
 * colours.
 *
 * So every token value the reference states is checked against
 * `apps/web/src/styles.css`. The stylesheet is the authority; this fails when
 * the copy of it drifts.
 *
 *   node apps/web/scripts/check-design-language.mjs
 *   node apps/web/scripts/check-design-language.mjs --commission
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
import console from 'node:console';

const here = dirname(fileURLToPath(import.meta.url));
const repo = join(here, '../../..');
const css = readFileSync(join(repo, 'apps/web/src/styles.css'), 'utf8');
const dir = join(repo, 'web-reference/design-language');

/** `| `--token` | `value` | …` rows in any of the reference's tables. */
function documentedTokens(markdown) {
  return [...markdown.matchAll(/^\|\s*`(--[a-z0-9-]+)`\s*\|\s*`([^`]+)`\s*\|/gm)].map(
    ([, token, value]) => ({ token, value: value.trim() }),
  );
}

/**
 * `rgba(15,15,15,.72)` and `rgba(15, 15, 15, 0.72)` are the same colour. The
 * check compares values, not the spelling of them — a reference that reads
 * well in a table should not fail against a stylesheet prettier has formatted.
 */
function normalise(value) {
  return value
    .replace(/\s+/g, '')
    .replace(/([(,])\./g, '$10.')
    .toLowerCase();
}

/** A `--token: value;` declaration anywhere in the stylesheet. */
function declaredIn(token) {
  const match = css.match(new RegExp(`${token}:\\s*([^;]+);`));
  return match ? match[1].trim() : null;
}

function main() {
  const commission = process.argv.includes('--commission');
  const tokensDoc = readFileSync(join(dir, 'tokens.md'), 'utf8');
  const documented = documentedTokens(
    commission ? tokensDoc.replace('#fcf9f8', '#ff00ff') : tokensDoc,
  );

  /**
   * A count is a weak guard — a table can lose its most important row and
   * still have plenty of rows. These are the values a deliverable gets wrong
   * most visibly, so the check refuses a reference that stops stating them.
   */
  const MUST_STATE = ['--surface', '--pine', '--pine-deep', '--ink', '--ink-3', '--rule'];
  const missing = MUST_STATE.filter((token) => !documented.some((row) => row.token === token));
  if (missing.length > 0) {
    console.error(`tokens.md no longer states ${missing.join(', ')}; the table shape changed`);
    process.exitCode = 1;
    return;
  }

  const wrong = [];
  for (const { token, value } of documented) {
    const declared = declaredIn(token);
    if (declared === null) {
      wrong.push(`${token} is documented but not declared in styles.css`);
    } else if (normalise(declared) !== normalise(value)) {
      wrong.push(`${token}: the reference says ${value}, the stylesheet says ${declared}`);
    }
  }

  /**
   * The type scales are stated as a table of sizes rather than as tokens, so
   * they are checked separately — and they are the values most likely to be
   * edited in the stylesheet without anyone remembering this file exists.
   */
  const SCALES = [
    ['--t-figure', '72px'],
    ['--t-head', '28px'],
    ['--t-sub', '20px'],
    ['--t-lead', '16px'],
    ['--t-body', '14px'],
    ['--t-label', '12px'],
    ['--d-figure', '40px'],
    ['--d-h1', '28px'],
    ['--d-h2', '20px'],
    ['--d-lead', '16px'],
    ['--d-body', '14px'],
    ['--d-label', '12px'],
  ];
  for (const [token, expected] of SCALES) {
    const declared = declaredIn(token);
    if (declared !== expected) {
      wrong.push(
        `${token}: the reference's scale table says ${expected}, the stylesheet says ${declared}`,
      );
    }
  }

  if (commission) {
    if (wrong.length === 0) {
      console.error('✗ a token was altered in the reference and the check did not notice');
      process.exitCode = 1;
    } else {
      console.log(`✓ the check refuses a reference that disagrees with the stylesheet:`);
      for (const one of wrong) console.log(`   ${one}`);
    }
    return;
  }

  if (wrong.length > 0) {
    console.error('✖ web-reference/design-language no longer describes the stylesheet:\n');
    for (const one of wrong) console.error(`  ${one}`);
    process.exitCode = 1;
  } else {
    console.log(
      `✓ design language reference matches the stylesheet (${documented.length} tokens, ${SCALES.length} scale steps)`,
    );
  }
}

main();
