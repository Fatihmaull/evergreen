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

/**
 * Rotation (Fatih's option 2, PH2-E2-04). Fixed policy, not tuning knobs:
 *
 * - `SESSION_ROTATE_AFTER_SECONDS` (24 h): a session token older than this is
 *   replaced on its next authenticated request. A login always issues a fresh
 *   token; logout deletes the row.
 * - `SESSION_ROTATION_GRACE_SECONDS` (60 s): after a rotation the old token
 *   still works for this long, so requests already in flight when the new
 *   cookie was set do not fail. It is never rotated again.
 * - The absolute expiry is `SESSION_ABSOLUTE_TIMEOUT` (config, default 30 days,
 *   docs/API.md §3). Rotation carries it over unchanged, so rotating can never
 *   extend a session past 30 days from the login that started it.
 */
export const SESSION_ROTATE_AFTER_SECONDS = 24 * 60 * 60;
export const SESSION_ROTATION_GRACE_SECONDS = 60;

/** Mirrors `sessions` in apps/api/db/schema.sql (#391). Times are epoch seconds. */
export interface SessionRow {
  /** `id_hash`: SHA-256 of the cookie value. */
  readonly tokenHash: string;
  readonly userId: string;
  /** The synchronizer token `GET /me` hands out and `X-Evergreen-CSRF` must echo. */
  readonly csrfToken: string;
  /** When this token was issued; rotation age is measured from here. */
  readonly createdAt: number;
  /** `last_used_at`. */
  readonly lastUsedAt: number;
  /** `idle_expires_at`: lastUsedAt + SESSION_IDLE_TIMEOUT. */
  readonly idleExpiresAt: number;
  /** `absolute_expires_at`: set at login, carried over on rotation; shortened to the grace end on the old row. */
  readonly absoluteExpiresAt: number;
  /** `rotated_from`: the previous token's hash, when this row came from a rotation. */
  readonly rotatedFrom?: string;
}

export async function hashSessionToken(token: string): Promise<string> {
  return sha256Hex(token);
}

/** A new session for `userId` (a login). */
export async function createSession(
  userId: string,
  now: number,
  config: AuthConfig,
): Promise<{ readonly token: string; readonly row: SessionRow }> {
  const token = base64url(randomBytes(32));
  return {
    token,
    row: {
      tokenHash: await hashSessionToken(token),
      userId,
      csrfToken: base64url(randomBytes(32)),
      createdAt: now,
      lastUsedAt: now,
      idleExpiresAt: now + config.sessionIdleTimeout,
      absoluteExpiresAt: now + config.sessionAbsoluteTimeout,
    },
  };
}

/** True once the token is older than `SESSION_ROTATE_AFTER_SECONDS`. */
export function rotationDue(row: SessionRow, now: number): boolean {
  return now - row.createdAt > SESSION_ROTATE_AFTER_SECONDS;
}

/**
 * Rotation: a new token for the same user and absolute expiry, plus the old
 * row cut down to the grace window. The CSRF token carries over, so a page
 * that already read it from `GET /me` keeps working.
 */
export async function rotateSession(
  old: SessionRow,
  now: number,
  config: AuthConfig,
): Promise<{ readonly token: string; readonly row: SessionRow; readonly retired: SessionRow }> {
  const token = base64url(randomBytes(32));
  const graceEnd = Math.min(old.absoluteExpiresAt, now + SESSION_ROTATION_GRACE_SECONDS);
  return {
    token,
    row: {
      tokenHash: await hashSessionToken(token),
      userId: old.userId,
      csrfToken: old.csrfToken,
      createdAt: now,
      lastUsedAt: now,
      idleExpiresAt: Math.min(now + config.sessionIdleTimeout, old.absoluteExpiresAt),
      absoluteExpiresAt: old.absoluteExpiresAt,
      rotatedFrom: old.tokenHash,
    },
    retired: {
      ...old,
      idleExpiresAt: Math.min(old.idleExpiresAt, graceEnd),
      absoluteExpiresAt: graceEnd,
    },
  };
}

/**
 * `valid`, or `expired` once either stored deadline is reached. A missing row
 * is `none`. The caller deletes an expired row; the browser's cookie is never
 * trusted to have expired.
 */
export function sessionState(
  row: SessionRow | undefined,
  now: number,
): 'valid' | 'expired' | 'none' {
  if (row === undefined) return 'none';
  if (now >= row.idleExpiresAt) return 'expired';
  if (now >= row.absoluteExpiresAt) return 'expired';
  return 'valid';
}

/** Records a use: pushes the idle deadline out, never past the absolute one. */
export function touchSession(row: SessionRow, now: number, config: AuthConfig): SessionRow {
  return {
    ...row,
    lastUsedAt: now,
    idleExpiresAt: Math.min(now + config.sessionIdleTimeout, row.absoluteExpiresAt),
  };
}

/**
 * `Set-Cookie` for a session. `__Host-` requires `Secure`, `Path=/` and no
 * `Domain`, which pins the cookie to the dashboard's exact host.
 */
export function sessionCookie(token: string, row: SessionRow, now: number): string {
  const maxAge = Math.max(0, row.absoluteExpiresAt - now);
  return `${SESSION_COOKIE}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`;
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
