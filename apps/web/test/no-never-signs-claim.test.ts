/**
 * No published page says the site never signs (Fatih, 2026-10-22).
 *
 * The product now asks a wallet to sign, so "Read-only: these pages never sign
 * or submit anything" and its equivalents are retired everywhere
 * (`claims-and-copy.md` § Obligatory). This reads the built output, which is
 * what a visitor gets.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = fileURLToPath(new URL('../../dashboard/public/', import.meta.url));
const RETIRED =
  /never (?:sign|asks? (?:you )?to sign)|sign or submit|Read-only[.:·]|read-only ·|no web control that signs/i;

/**
 * True statements about OTHER components, which stay: the GitHub Action
 * (`docs/ci`) and the CLI's `extend --help` default, parsed from the CLI's own
 * usage text (CEF's path). They describe that tool, not this site.
 */
const ABOUT_OTHER_TOOLS = [
  /The Action never signs anything/g,
  /Default: simulate, never sign or submit/g,
];

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return files(path);
    return /\.(html|js)$/.test(name) ? [path] : [];
  });
}

describe('the retired "never signs" claim', () => {
  test('appears in no published page or script', () => {
    const hits = files(OUT).filter((path) => {
      let text = readFileSync(path, 'utf8').replace(/\s+/g, ' ');
      for (const allowed of ABOUT_OTHER_TOOLS) text = text.replace(allowed, '');
      return RETIRED.test(text);
    });
    expect(hits.map((p) => p.slice(OUT.length))).toEqual([]);
  });
  test('the footer still says Testnet only', () => {
    expect(readFileSync(join(OUT, 'index.html'), 'utf8')).toContain('Testnet only.');
  });
});
