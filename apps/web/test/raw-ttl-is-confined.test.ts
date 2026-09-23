/**
 * Structural guard for the defect class, and the proof that a fourth decay
 * series drops in.
 *
 * Nine separate render sites each reached past core's assessment for a raw
 * `ttl` and printed the arithmetic of a zero. Fixing nine call sites does not
 * stop a tenth being written, so raw TTL now lives in exactly one module and
 * this fails if that stops being true.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validate } from '../src/pages/decay.mjs';
import knownEnds from '../data/known-ends.json';

const SRC = fileURLToPath(new URL('../src', import.meta.url));

/** The only module allowed to turn a raw TTL into something renderable. */
const OWNER = join('lib', 'view.ts');

const RAW_READS = [/\.ttl\.remainingLedgers\b/, /\.ttl\.endsAtLedger\b/, /\bestimateEndsAt\s*\(/];

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.(ts|mjs)$/.test(entry.name) ? [path] : [];
  });
}

describe('raw TTL is read in one place', () => {
  test('no module outside view.ts reads remainingLedgers, endsAtLedger or projects a date', () => {
    const offenders: string[] = [];
    for (const file of sourceFiles(SRC)) {
      const relative = file.slice(SRC.length + 1);
      if (relative === OWNER) continue;
      // `evergreen.ts` re-exports core and filters expired entries out of the
      // rent quote using core's own `hasExpired`; it renders nothing.
      if (relative === join('lib', 'evergreen.ts')) continue;
      const source = readFileSync(file, 'utf8');
      for (const pattern of RAW_READS) {
        if (pattern.test(source)) offenders.push(`${relative} matches ${pattern}`);
      }
    }
    expect(offenders, `raw TTL belongs in lib/view.ts.\n  ${offenders.join('\n  ')}`).toEqual([]);
  });

  test('the guard can fail: a file that reads raw TTL is caught', () => {
    const sample = 'const x = entry.ttl.remainingLedgers;';
    expect(RAW_READS.some((p) => p.test(sample))).toBe(true);
  });
});

/**
 * Guinea-pig C's alert threshold is 25 September and its expiry the 26th. Its
 * readings do not exist yet, so the ingestion path is proven against the shape
 * they will have rather than after they arrive.
 */
describe('a fourth decay series drops in', () => {
  const C = 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL';
  const end = (knownEnds as Record<string, { instance?: number }>)[C]?.instance;

  test('C’s final ledger is already recorded, so no data change is needed at expiry', () => {
    expect(end, 'ops/crossing-schedule.json must carry C’s expiry ledger').toBeTypeOf('number');
  });

  test('a C series shaped like the crossing captures validates', () => {
    // Same shape as B's: readings at a constant endsAt, terminating at expiry.
    const series = [
      {
        id: 'c-instance',
        label: 'guinea-pig C · instance',
        role: 'The backup proof.',
        observations: [17_280, 8_640, 4_320].map((remaining) => ({
          ledger: end! - remaining,
          endsAt: end!,
          source: 'docs/SEP-20-PREFLIGHT.md',
        })),
        steps: [],
        expiryLedger: end!,
        expiryApprox: '2026-09-26',
      },
    ];
    expect(() => validate(series)).not.toThrow();
  });

  test('the validator still refuses a reading taken after expiry', () => {
    // After expiry the chain reports endsAt 0, so a naive capture would carry
    // a negative remaining. That must never reach the chart.
    const series = [
      {
        id: 'c-instance',
        label: 'guinea-pig C · instance',
        role: 'The backup proof.',
        observations: [{ ledger: end! + 50, endsAt: 0, source: 'a post-expiry scan' }],
        steps: [],
        expiryLedger: end!,
        expiryApprox: '2026-09-26',
      },
    ];
    expect(() => validate(series)).toThrow(/already-expired|expired/i);
  });
});
