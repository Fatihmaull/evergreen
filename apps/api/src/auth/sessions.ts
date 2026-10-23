import type { AuthConfig } from './config.js';
import { base64url, randomBytes, sha256Hex } from './crypto.js';

/**
 * Server-side sessions (ADR-008, docs/API.md §3).
 *
 * The cookie carries a random token; the row stores only its SHA-256. A leaked
 * table therefore yields no live cookie. An unkeyed hash is enough here because
 * the token has 256 bits of entropy, unlike a sign-in code.
 */
export const SESSION_COOKIE = '__Host-evergreen_session';

export interface SessionRow {
  readonly tokenHash: string;
  readonly userId: string;
  /** The synchronizer token `GET /me` hands out and `X-Evergreen-CSRF` must echo. */
  readonly csrfToken: string;
  /** Epoch seconds. */
  readonly createdAt: number;
  readonly lastSeenAt: number;
}

export async function hashSessionToken(token: string): Promise<string> {
  return sha256Hex(token);
}

/** A new session for `userId`. Also used to rotate one: issue a new session and delete the old row. */
export async function createSession(
  userId: string,
  now: number,
): Promise<{ readonly token: string; readonly row: SessionRow }> {
  const token = base64url(randomBytes(32));
  return {
    token,
    row: {
      tokenHash: await hashSessionToken(token),
      userId,
      csrfToken: base64url(randomBytes(32)),
      createdAt: now,
      lastSeenAt: now,
    },
  };
}

/**
 * `valid`, or `expired` once either limit is reached: idle since `lastSeenAt`,
 * or absolute since `createdAt`. A missing row is `none`. The caller deletes
 * an expired row; the browser's cookie is never trusted to have expired.
 */
export function sessionState(
  row: SessionRow | undefined,
  now: number,
  config: AuthConfig,
): 'valid' | 'expired' | 'none' {
  if (row === undefined) return 'none';
  if (now - row.lastSeenAt >= config.sessionIdleTimeout) return 'expired';
  if (now - row.createdAt >= config.sessionAbsoluteTimeout) return 'expired';
  return 'valid';
}

export function touchSession(row: SessionRow, now: number): SessionRow {
  return { ...row, lastSeenAt: now };
}

/**
 * `Set-Cookie` for a session. `__Host-` requires `Secure`, `Path=/` and no
 * `Domain`, which pins the cookie to the dashboard's exact host.
 */
export function sessionCookie(token: string, config: AuthConfig): string {
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${config.sessionAbsoluteTimeout}`;
}

export function clearedSessionCookie(): string {
  return `${SESSION_COOKIE}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`;
}

/** The session token from a `Cookie` header, or undefined. */
export function readSessionToken(cookieHeader: string | null): string | undefined {
  if (cookieHeader === null) return undefined;
  for (const part of cookieHeader.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === SESSION_COOKIE) {
      const value = part.slice(eq + 1).trim();
      return /^[A-Za-z0-9_-]{43}$/.test(value) ? value : undefined;
    }
  }
  return undefined;
}
