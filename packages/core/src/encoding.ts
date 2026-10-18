/**
 * Byte and base64 helpers that need no Node global (#194, #311).
 *
 * `core` runs on Node, in browsers and on Cloudflare Workers. Node's global
 * `Buffer` exists only in the first. The scan path stopped using it in #229;
 * the extend path used it until #311, where a dry-run extend on a Worker with
 * no `Buffer` threw a ReferenceError that was reported as SIMULATION_FAILED.
 * The Stellar SDK carries its own `Buffer`, so only code reaching for the
 * global can fail; these helpers keep core from doing so.
 */

/**
 * Strict canonical base64: decoding and re-encoding must reproduce the input
 * exactly. A lenient decoder silently "repairs" invalid characters or missing
 * padding, and a repaired key is a different key.
 */
export function isCanonicalBase64(text: string): boolean {
  try {
    return btoa(atob(text)) === text;
  } catch {
    return false;
  }
}

/** Lower-case hex of a byte array, as `Buffer.toString('hex')` produced. */
export function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const byte of bytes) hex += byte.toString(16).padStart(2, '0');
  return hex;
}
