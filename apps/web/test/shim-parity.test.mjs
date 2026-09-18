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
import { test } from 'node:test';
import assert from 'node:assert/strict';
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
    assert.equal(bufferFrom(key, 'base64').toString('base64'), Buffer.from(key, 'base64').toString('base64'));
  }
});

test('the shim reaches Node\'s verdict on hostile input', () => {
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

test('the test itself can fail: a broken shim is caught', () => {
  const broken = (value, encoding) => ({
    toString: () => (typeof value === 'string' && encoding === 'base64' ? value : 'nonsense'),
  });
  // A shim that echoes its input would accept every hostile string above.
  const disagreements = HOSTILE.filter((t) => verdict(broken, t) !== verdict(Buffer.from, t));
  assert.ok(disagreements.length > 0, 'the comparison would not catch an echoing shim');
});
