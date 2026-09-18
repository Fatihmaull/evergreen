/**
 * A minimal `Buffer` for the browser. TEMPORARY — delete the day #194 lands.
 *
 * `@evergreen-stellar/core` validates base64 with Node's global `Buffer`
 * (`packages/core/src/scan-contract.ts:27`). Browsers have none, and the
 * `ReferenceError` is caught by core's own validation and reported as bad data:
 * a scan returns zero entries and a rent estimate of "0", with no error at all.
 * Measured 2026-09-17 in headless Chrome; tracked as `W4-D22-11` in #194.
 *
 * This is a second implementation of a validation rule, which is exactly what
 * the web spec forbids. It exists because the prototype needs live scanning
 * today, and it is held to `test/shim-parity.test.mjs` until core is fixed.
 * When #194 lands: delete this file, its test, and the call in `lib/evergreen.ts`.
 *
 * Only the shapes core's read path actually uses are implemented:
 *   Buffer.from(string, 'base64').toString('base64')
 *   Buffer.from(bytes).toString('hex')
 */

/** @typedef {{ toString(encoding?: string): string }} ShimBuffer */

/**
 * @param {string | ArrayLike<number>} value
 * @param {string} [encoding]
 * @returns {ShimBuffer}
 */
export function bufferFrom(value, encoding) {
  const bytes =
    typeof value === 'string'
      ? encoding === 'base64'
        ? decodeBase64(value)
        : new TextEncoder().encode(value)
      : Uint8Array.from(value);
  return {
    toString(to) {
      if (to === 'hex') return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
      if (to === 'base64') return encodeBase64(bytes);
      return new TextDecoder().decode(bytes);
    },
  };
}

/**
 * Install only where there is no native `Buffer`, so Node keeps its own.
 * @returns {'installed' | 'native'}
 */
export function installBufferShim() {
  const scope = /** @type {{ Buffer?: unknown }} */ (globalThis);
  if (typeof scope.Buffer !== 'undefined') return 'native';
  scope.Buffer = { from: bufferFrom };
  return 'installed';
}

/**
 * `atob` throws on characters Node's decoder silently drops. Core treats both
 * as invalid, because it compares the re-encoded string against the input, so
 * the accept/reject outcome matches. The parity test pins that claim.
 * @param {string} text
 * @returns {Uint8Array}
 */
function decodeBase64(text) {
  const binary = atob(text);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) out[i] = binary.charCodeAt(i);
  return out;
}

/**
 * @param {Uint8Array} bytes
 * @returns {string}
 */
function encodeBase64(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
