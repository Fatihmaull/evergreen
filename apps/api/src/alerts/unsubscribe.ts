/**
 * One-click unsubscribe for optional alerts (RFC 8058, PH2-E2-06 §6).
 *
 * Unauthenticated on purpose: a mail client POSTs the HTTPS URL from
 * `List-Unsubscribe` with no session cookie and no CSRF header. The HMAC is
 * the authorisation. POST is the only method that writes. GET returns the
 * same `{ ok: true }` and does not read or write a preference.
 *
 * The write turns every optional kind off for that user. It does not send
 * mail and does not build or submit a transaction: email never authorises
 * anything that moves XLM. Required kinds are not stored and are not touched.
 * A missing, invalid, tampered or expired token writes nothing. The response
 * never contains an address, the token, or the signing secret.
 *
 * Token TTL is 90 days from mint (a decision for Fatih; the alternative is
 * no expiry until `ALERTS_UNSUBSCRIBE_SECRET` rotates). The secret is its
 * own Worker secret, not `SIGNIN_CODE_PEPPER`: rotating sign-in codes must
 * not invalidate unsubscribe links, and a leak of one must not expose the
 * other. Unset, blank, or containing whitespace fails closed.
 */
import { base64url, hmacSha256Hex, timingSafeEqual } from '../auth/crypto.js';
import { apiError, json } from '../router.js';
import { ALERT_SPECS, canUnsubscribe, type AlertKind } from './policy.js';
import type { AlertPreferencesStore } from './preferences.js';

/** Fixed purpose bound into the HMAC. One list: every optional kind. */
export const UNSUBSCRIBE_PURPOSE = 'alerts-optional';

/**
 * How long a link verifies, in seconds. 90 days. Decision for Fatih.
 * Rotating `ALERTS_UNSUBSCRIBE_SECRET` invalidates every outstanding link
 * immediately, whichever of these is shorter.
 */
export const UNSUBSCRIBE_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Path under `/api/v1`. Matches `API_BASE` in `router.ts`; a test pins that. */
export const PUBLIC_API_BASE = '/api/v1';

export const ALERT_UNSUBSCRIBE_PATH = '/alerts/unsubscribe';

/** WEBF's screen. The page is not built here. */
export const ALERT_PREFERENCES_PAGE_PATH = '/dashboard/alerts/';

const USER_ID = /^[A-Za-z0-9_-]{1,80}$/;
const TOKEN = /^[A-Za-z0-9_-]+\.[0-9a-f]{64}$/;
const encoder = new TextEncoder();

export const ALERT_UNSUBSCRIBE_METHODS = ['GET', 'POST'] as const;

export function alertUnsubscribeMethods(path: string): readonly string[] | undefined {
  return path === ALERT_UNSUBSCRIBE_PATH ? ALERT_UNSUBSCRIBE_METHODS : undefined;
}

/**
 * The signing secret, or undefined when it must not be used. Trimmed.
 * Internal whitespace is unset: a secret we cannot tell from a wrapped line
 * is not a key. The value is never logged.
 */
export function unsubscribeSecret(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed === '' || /\s/.test(trimmed)) return undefined;
  return trimmed;
}

/** `https://host` with no userinfo, path, query or hash. Undefined otherwise. */
export function httpsOrigin(value: string | undefined): string | undefined {
  if (value === undefined || value.length === 0 || value.length > 256) return undefined;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }
  if (url.protocol !== 'https:') return undefined;
  if (url.username !== '' || url.password !== '') return undefined;
  if (url.search !== '' || url.hash !== '') return undefined;
  if (url.pathname !== '/' && url.pathname !== '') return undefined;
  return url.origin;
}

/** Absolute preferences-page URL, or undefined when the origin is not usable. */
export function alertPreferencesPageUrl(dashboardOrigin: string | undefined): string | undefined {
  const origin = httpsOrigin(dashboardOrigin);
  if (origin === undefined) return undefined;
  return `${origin}${ALERT_PREFERENCES_PAGE_PATH}`;
}

/**
 * Absolute one-click URL. The token is the query value RFC 8058 puts in
 * `List-Unsubscribe`. No `mailto:`.
 */
export function alertUnsubscribeUrl(
  dashboardOrigin: string | undefined,
  token: string,
): string | undefined {
  const origin = httpsOrigin(dashboardOrigin);
  if (origin === undefined || !TOKEN.test(token)) return undefined;
  return `${origin}${PUBLIC_API_BASE}${ALERT_UNSUBSCRIBE_PATH}?token=${token}`;
}

function payload(userId: string, exp: number): string {
  return `v1\n${userId}\n${UNSUBSCRIBE_PURPOSE}\n${exp}`;
}

/**
 * HMAC over the user id, the fixed purpose and the expiry. Undefined when
 * the secret is unusable or the user id is not a token-safe id. Never throws
 * the secret.
 */
export async function mintUnsubscribeToken(
  secret: string | undefined,
  userId: string,
  nowSeconds: number,
): Promise<string | undefined> {
  const key = unsubscribeSecret(secret);
  if (key === undefined || !USER_ID.test(userId)) return undefined;
  if (!Number.isSafeInteger(nowSeconds) || nowSeconds < 0) return undefined;
  const exp = nowSeconds + UNSUBSCRIBE_TTL_SECONDS;
  const body = base64url(encoder.encode(payload(userId, exp)));
  const mac = await hmacSha256Hex(key, body);
  return `${body}.${mac}`;
}

function decodeBase64url(segment: string): string | undefined {
  if (segment.length === 0 || segment.length > 256) return undefined;
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) return undefined;
  const pad = segment.length % 4 === 0 ? '' : '='.repeat(4 - (segment.length % 4));
  let binary: string;
  try {
    binary = atob(segment.replaceAll('-', '+').replaceAll('_', '/') + pad);
  } catch {
    return undefined;
  }
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  return text;
}

export interface UnsubscribeClaims {
  readonly userId: string;
}

/**
 * The user id, or undefined for every failure (missing, malformed, wrong
 * purpose, bad mac, expired, not yet valid, secret unusable). One result, so
 * a caller cannot tell those cases apart.
 */
export async function verifyUnsubscribeToken(
  secret: string | undefined,
  token: string,
  nowSeconds: number,
): Promise<UnsubscribeClaims | undefined> {
  const key = unsubscribeSecret(secret);
  if (key === undefined || token.length > 512 || !TOKEN.test(token)) return undefined;
  if (!Number.isSafeInteger(nowSeconds)) return undefined;
  const dot = token.indexOf('.');
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);
  const expected = await hmacSha256Hex(key, body);
  if (!timingSafeEqual(expected, mac)) return undefined;
  let text: string;
  try {
    const decoded = decodeBase64url(body);
    if (decoded === undefined) return undefined;
    text = decoded;
  } catch {
    return undefined;
  }
  const lines = text.split('\n');
  if (lines.length !== 4) return undefined;
  const version = lines[0];
  const userId = lines[1];
  const purpose = lines[2];
  const expText = lines[3];
  if (version !== 'v1' || purpose !== UNSUBSCRIBE_PURPOSE) return undefined;
  if (userId === undefined || !USER_ID.test(userId)) return undefined;
  if (expText === undefined || !/^[1-9]\d{0,15}$/.test(expText)) return undefined;
  const exp = Number(expText);
  if (!Number.isSafeInteger(exp)) return undefined;
  // Inclusive of the expiry second. A clock that moved backwards past the
  // mint, or an expiry further out than the TTL, fails closed.
  if (exp < nowSeconds || exp > nowSeconds + UNSUBSCRIBE_TTL_SECONDS) return undefined;
  return { userId };
}

/** Sets every optional kind to false. Required kinds are not passed to `set`. */
export async function disableOptionalAlerts(
  store: AlertPreferencesStore,
  userId: string,
  nowSeconds: number,
): Promise<void> {
  for (const kind of Object.keys(ALERT_SPECS) as AlertKind[]) {
    if (!canUnsubscribe(kind)) continue;
    await store.set(userId, kind, false, nowSeconds);
  }
}

export interface AlertUnsubscribeDeps {
  readonly store: AlertPreferencesStore;
  /** Unix seconds. */
  readonly now: () => number;
  /** Already passed through `unsubscribeSecret`. */
  readonly secret: string;
  /**
   * True only for an account that still exists and is not deactivated.
   * `PgAuthStore.getUser` is that check: a deactivated row is no user.
   * False is a no-op success, including a user id that matches no row, so
   * the response does not say which.
   */
  readonly userActive: (userId: string) => Promise<boolean>;
}

const UNSUBSCRIBED = { ok: true } as const;

function invalid(): Response {
  return apiError('INVALID_REQUEST', 'This unsubscribe link is not valid.', 400);
}

async function isOneClick(request: Request): Promise<boolean> {
  const media = (request.headers.get('content-type') ?? '').split(';')[0]?.trim().toLowerCase();
  if (media !== 'application/x-www-form-urlencoded') return false;
  let text: string;
  try {
    text = await request.text();
  } catch {
    return false;
  }
  text = text.trim();
  // RFC 8058's body, exactly: one field, no extra pairs.
  return text === 'List-Unsubscribe=One-Click';
}

function tokenFrom(request: Request): string | undefined {
  const all = new URL(request.url).searchParams.getAll('token');
  if (all.length !== 1) return undefined;
  const token = all[0];
  if (token === undefined || token === '') return undefined;
  return token;
}

/**
 * GET never writes. POST writes only when the token verifies and the body
 * is the RFC 8058 one-click form. Anything else is the same 400, with no
 * store read and no user lookup.
 */
export async function handleAlertUnsubscribe(
  request: Request,
  path: string,
  deps: AlertUnsubscribeDeps,
): Promise<Response | undefined> {
  if (path !== ALERT_UNSUBSCRIBE_PATH) return undefined;
  const method = request.method.toUpperCase();
  if (method === 'GET') return json(UNSUBSCRIBED);
  if (method !== 'POST') return undefined;
  const token = tokenFrom(request);
  if (token === undefined || !(await isOneClick(request))) return invalid();
  const claims = await verifyUnsubscribeToken(deps.secret, token, deps.now());
  if (claims === undefined) return invalid();
  if (!(await deps.userActive(claims.userId))) return json(UNSUBSCRIBED);
  await disableOptionalAlerts(deps.store, claims.userId, deps.now());
  return json(UNSUBSCRIBED);
}
