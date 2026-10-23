/**
 * Web Crypto only (`crypto.getRandomValues`, `crypto.subtle`), which Workers
 * and Node 24 both provide as globals. No `Buffer`: see this package's
 * tsconfig.
 */

const encoder = new TextEncoder();

/** `n` cryptographically random bytes. */
export function randomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

/** Unpadded base64url (RFC 4648 §5), safe in a cookie value and a URL. */
export function base64url(bytes: Uint8Array): string {
  let binary = '';
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function hex(buffer: ArrayBuffer): string {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256Hex(text: string): Promise<string> {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
}

/** HMAC-SHA-256 of `text` under `key`, as hex. */
export async function hmacSha256Hex(key: string, text: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    encoder.encode(key),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return hex(await crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(text)));
}

/**
 * Equality that takes the same time wherever the strings differ, so a
 * comparison against a secret leaks nothing through timing. Length is not
 * secret here: every caller compares fixed-length hex or base64url digests.
 */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** A uniformly random string of `digits` decimal digits, without modulo bias. */
export function randomDigits(digits: number): string {
  let out = '';
  while (out.length < digits) {
    // 250 is the largest multiple of 10 below 256; rejecting 250–255 keeps
    // every digit equally likely.
    for (const b of randomBytes(digits)) {
      if (b < 250 && out.length < digits) out += String(b % 10);
    }
  }
  return out;
}
