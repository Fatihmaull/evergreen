/**
 * The shim must reach the same verdict as Node's `Buffer` on every input core
 * feeds it, because core decides whether a ledger key is valid by re-encoding
 * it and comparing (`packages/core/src/scan-contract.ts:27`).
 *
 * "Verdict" is what core sees: either the round trip returns the input
 * (accepted) or it throws or differs (rejected). Byte-for-byte agreement on
 * invalid input is NOT required — refusing it the same way is.
 *
 * Delete with the shim when #194 lands.
 */
import { test } from 'vitest';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { bufferFrom } from '../src/shim/buffer-shim.js';

/** Real ledger keys: guinea-pig A's instance and its two committed data keys. */
const REAL_KEYS = [
  'AAAABgAAAAEblswW+PDBZ8QGOhf7+j8AvTtHrEL+O4eNCZiCZ4RiuwAAABQAAAAB',
  'AAAABgAAAAEblswW+PDBZ8QGOhf7+j8AvTtHrEL+O4eNCZiCZ4RiuwAAABAAAAABAAAAAQAAAA8AAAAKUGVyc2lzdGVudAAAAAAAAQ==',
  'AAAABgAAAAEblswW+PDBZ8QGOhf7+j8AvTtHrEL+O4eNCZiCZ4RiuwAAABAAAAABAAAAAQAAAA8AAAAJVGVtcG9yYXJ5AAAAAAAAAA==',
  'AAAAB8flXwrYnvsGALwVBIsVUJn6TZfO4WRm+hJEs9y86Yv7',
];

const HOSTILE = [
  '', // empty
  'AAAA*AAA', // a character Node's decoder drops and atob rejects
  'AAAA AAAA', // embedded space
  'a-b_cd==', // base64url alphabet, not base64
  'AAA', // length that is not a multiple of 4
  'AAAA=', // misplaced padding
  '====', // padding only
  'QUJD', // valid, decodes to "ABC"
  'QUJD\n', // valid payload with a trailing newline
];

/** What core actually asks: does `from(text,'base64').toString('base64')` return `text`? */
function verdict(from, text) {
  try {
    return from(text, 'base64').toString('base64') === text ? 'accepted' : 'rejected';
  } catch {
    return 'rejected';
  }
}

test('every real ledger key round-trips identically under both', () => {
  for (const key of REAL_KEYS) {
    assert.equal(verdict(Buffer.from, key), 'accepted', `node rejected a real key: ${key}`);
    assert.equal(verdict(bufferFrom, key), 'accepted', `shim rejected a real key: ${key}`);
    assert.equal(
      bufferFrom(key, 'base64').toString('base64'),
      Buffer.from(key, 'base64').toString('base64'),
    );
  }
});

test("the shim reaches Node's verdict on hostile input", () => {
  for (const text of HOSTILE) {
    assert.equal(
      verdict(bufferFrom, text),
      verdict(Buffer.from, text),
      `verdicts differ for ${JSON.stringify(text)}`,
    );
  }
});

test('bytes to hex match Node exactly', () => {
  const vectors = [[], [0], [255], [0, 1, 15, 16, 127, 128, 254, 255], [...Array(32).keys()]];
  for (const bytes of vectors) {
    assert.equal(bufferFrom(bytes).toString('hex'), Buffer.from(bytes).toString('hex'));
  }
});

/**
 * The three tests above compare the shim against Node's `Buffer` on the rule
 * core uses TODAY. They would not notice if core changed that rule — the shim
 * would keep agreeing with `Buffer` about a question core no longer asks.
 *
 * So this pins the rule at its source. It fails in exactly two situations, and
 * both are ones somebody needs to look at:
 *   - core changed how it validates a ledger key, and the shim must be re-checked;
 *   - #194 landed and core no longer reaches for `Buffer`, and the shim, this
 *     file and the `installBufferShim()` call in `lib/evergreen.ts` should go.
 */
test('core still validates ledger keys the way this test models', () => {
  const source = readFileSync(
    fileURLToPath(new URL('../../../packages/core/src/scan-contract.ts', import.meta.url)),
    'utf8',
  );
  assert.ok(
    source.includes("Buffer.from(text, 'base64').toString('base64') !== text"),
    'core/scan-contract.ts no longer validates keys by re-encoding through Buffer. ' +
      'Either the rule changed and this parity test is measuring the wrong thing, ' +
      'or #194 landed and the shim should be deleted. Do not update this assertion ' +
      'without deciding which.',
  );
});

test('the test itself can fail: a broken shim is caught', () => {
  const broken = (value, encoding) => ({
    toString: () => (typeof value === 'string' && encoding === 'base64' ? value : 'nonsense'),
  });
  // A shim that echoes its input would accept every hostile string above.
  const disagreements = HOSTILE.filter((t) => verdict(broken, t) !== verdict(Buffer.from, t));
  assert.ok(disagreements.length > 0, 'the comparison would not catch an echoing shim');
});
