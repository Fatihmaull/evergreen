import type { AuthConfig } from './config.js';
import { hmacSha256Hex, randomDigits, timingSafeEqual } from './crypto.js';

/**
 * One-time email sign-in codes (ADR-008, docs/API.md §4).
 *
 * **Stored as an HMAC, never as the code.** A short code hashed without a key
 * is brute-forced offline in seconds, so a plain hash would protect nothing if
 * the table leaked. The key is a secret held only by the API Worker, named by
 * an environment variable (the caller passes its value; this module never
 * reads the environment). The MAC also binds the code to its email address,
 * so a code is worthless for any other account.
 *
 * **One record per address; issuing a new code replaces the old one.** Only
 * the latest code can work, which is what a person asking for "a new code"
 * expects.
 */
export interface SigninCodeRecord {
  /** Normalised address (see `normalizeEmail`). */
  readonly email: string;
  readonly codeMac: string;
  /** Epoch seconds. */
  readonly expiresAt: number;
  readonly failures: number;
  readonly used: boolean;
}

/**
 * Lower-cased and trimmed, or null if it is not shaped like an address.
 * Deliberately loose: the real test of an address is whether the code arrives.
 */
export function normalizeEmail(input: string): string | null {
  const email = input.trim().toLowerCase();
  if (email.length > 254) return null;
  const at = email.indexOf('@');
  if (at < 1 || at !== email.lastIndexOf('@') || at === email.length - 1) return null;
  if (/\s/.test(email)) return null;
  return email;
}

async function mac(pepper: string, email: string, code: string): Promise<string> {
  return hmacSha256Hex(pepper, `${email}\n${code}`);
}

export async function issueSigninCode(args: {
  readonly email: string;
  readonly now: number;
  readonly config: AuthConfig;
  readonly pepper: string;
}): Promise<{ readonly code: string; readonly record: SigninCodeRecord }> {
  const code = randomDigits(args.config.signinCodeDigits);
  return {
    code,
    record: {
      email: args.email,
      codeMac: await mac(args.pepper, args.email, code),
      expiresAt: args.now + args.config.signinCodeTtl,
      failures: 0,
      used: false,
    },
  };
}

/**
 * `ok` exactly once per code; `invalid` for everything else.
 *
 * **Every refusal is the same answer**: no record, a used code, an expired
 * code, a code past its failure limit, a malformed guess and a wrong guess.
 * Telling them apart would tell an attacker which one they hit (docs/API.md
 * §4, and WEBF's §9a copy depends on it).
 *
 * `record` is what the caller must store back. It is absent only when there
 * was nothing to update.
 */
export async function verifySigninCode(args: {
  readonly record: SigninCodeRecord | undefined;
  readonly email: string;
  readonly code: string;
  readonly now: number;
  readonly config: AuthConfig;
  readonly pepper: string;
}): Promise<{ readonly result: 'ok' | 'invalid'; readonly record?: SigninCodeRecord }> {
  const { record } = args;
  // No separate email comparison: the MAC binds the code to its address, so
  // a code checked under another address fails there (tested).
  if (record === undefined) return { result: 'invalid' };
  if (record.used || args.now >= record.expiresAt) return { result: 'invalid', record };
  if (record.failures >= args.config.signinCodeMaxFailures) return { result: 'invalid', record };
  // A malformed guess needs no separate check: it fails the MAC like any
  // other wrong code, and counts as a failure (tested).
  const matches = timingSafeEqual(
    await mac(args.pepper, args.email, args.code.trim()),
    record.codeMac,
  );
  if (!matches) return { result: 'invalid', record: { ...record, failures: record.failures + 1 } };
  return { result: 'ok', record: { ...record, used: true } };
}
