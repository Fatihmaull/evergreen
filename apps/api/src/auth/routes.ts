/**
 * The auth routes of docs/API.md §4, over `AuthStore`. Every state-changing
 * route needs a valid session and passes CSRF (§3), except the two sign-in
 * routes, which have no session yet and are rate-limited instead.
 *
 * **Email never authorises anything that moves XLM.** No route here moves
 * XLM, signs or submits a transaction. A wallet link is proven by the wallet's
 * own signature on a SEP-10 challenge, never by the email session alone, and
 * the link itself grants no spending: an allowance is a separate on-chain
 * signature by the wallet (ADR-007).
 */
import type { Keypair } from '@stellar/stellar-sdk';
import { StrKey } from '@stellar/stellar-sdk';
import type { AuthConfig } from './config.js';
import { CSRF_HEADER, csrfAllows } from './csrf.js';
import { hitLimit } from './rate-limit.js';
import {
  clearedSessionCookie,
  createSession,
  hashSessionToken,
  readSessionToken,
  sessionCookie,
  sessionState,
  touchSession,
  type SessionRow,
} from './sessions.js';
import { issueSigninCode, normalizeEmail, verifySigninCode } from './signin-codes.js';
import type { AuthStore, Mailer, User, WalletLink } from './store.js';
import {
  issueWalletChallenge,
  verifyWalletChallenge,
  type ChallengeDomains,
} from './wallet-challenge.js';

export interface AuthDeps {
  readonly store: AuthStore;
  readonly mailer: Mailer;
  readonly config: AuthConfig;
  readonly pepper: string;
  readonly challengeKeypair: Keypair;
  readonly domains: ChallengeDomains;
  readonly challengeTimeoutSeconds: number;
  /** The dashboard's origin; CSRF's `Origin` check compares against it. */
  readonly allowedOrigin: string;
  /** Unix seconds. */
  readonly now: () => number;
}

export function apiError(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  return jsonResponse(
    status,
    { error: { code, message, retryable: status === 429, details: {} } },
    headers,
  );
}

function jsonResponse(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === null ? {} : { 'content-type': 'application/json; charset=utf-8' }),
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

async function readJson(request: Request): Promise<Record<string, unknown> | undefined> {
  try {
    const body: unknown = await request.json();
    return typeof body === 'object' && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined;
  } catch {
    return undefined;
  }
}

const iso = (seconds: number): string => new Date(seconds * 1000).toISOString();
const userJson = (u: User) => ({ id: u.id, email: u.email, createdAt: iso(u.createdAt) });
const walletJson = (w: WalletLink) => ({
  account: w.account,
  network: w.network,
  linkedAt: iso(w.linkedAt),
});

interface Authed {
  readonly row: SessionRow;
  readonly user: User;
}

/** Session, then CSRF for unsafe methods. Returns a refusal Response or the session. */
async function requireSession(request: Request, deps: AuthDeps): Promise<Authed | Response> {
  const token = readSessionToken(request.headers.get('cookie'));
  const unauth = () => apiError(401, 'UNAUTHENTICATED', 'Sign in first.');
  if (token === undefined) return unauth();
  const tokenHash = await hashSessionToken(token);
  const row = await deps.store.getSession(tokenHash);
  const now = deps.now();
  const state = sessionState(row, now, deps.config);
  if (row === undefined || state !== 'valid') {
    if (row !== undefined) await deps.store.deleteSession(tokenHash);
    return unauth();
  }
  const allowed = csrfAllows({
    method: request.method,
    origin: request.headers.get('origin'),
    allowedOrigin: deps.allowedOrigin,
    headerToken: request.headers.get(CSRF_HEADER),
    sessionCsrfToken: row.csrfToken,
  });
  if (!allowed) return apiError(403, 'CSRF_FAILED', 'Request refused.');
  const user = await deps.store.getUser(row.userId);
  if (user === undefined) return unauth();
  const touched = touchSession(row, now);
  await deps.store.putSession(touched);
  return { row: touched, user };
}

function clientIp(request: Request): string {
  return request.headers.get('cf-connecting-ip') ?? 'unknown';
}

async function emailStart(request: Request, deps: AuthDeps): Promise<Response> {
  const body = await readJson(request);
  const now = deps.now();
  const ipDecision = await hitLimit(deps.store.counters, {
    scope: 'email-start-ip',
    subject: clientIp(request),
    limit: deps.config.emailSendsPerIp,
    now,
  });
  if (!ipDecision.allowed) return rateLimited(ipDecision.retryAfterSeconds);
  const email = typeof body?.['email'] === 'string' ? normalizeEmail(body['email']) : null;
  // Always 202 for a malformed or unknown address: the route cannot enumerate users.
  if (email === null) return jsonResponse(202, null);
  const addrDecision = await hitLimit(deps.store.counters, {
    scope: 'email-start-address',
    subject: email,
    limit: deps.config.emailSendsPerAddress,
    now,
  });
  if (!addrDecision.allowed) return rateLimited(addrDecision.retryAfterSeconds);
  const { code, record } = await issueSigninCode({
    email,
    now,
    config: deps.config,
    pepper: deps.pepper,
  });
  await deps.store.putSigninCode(record);
  await deps.mailer.sendSigninCode(email, code);
  return jsonResponse(202, null);
}

function rateLimited(retryAfterSeconds: number): Response {
  return apiError(429, 'RATE_LIMITED', 'Too many requests.', {
    'retry-after': String(retryAfterSeconds),
  });
}

async function emailVerify(request: Request, deps: AuthDeps): Promise<Response> {
  const body = await readJson(request);
  const invalid = () => apiError(401, 'CODE_INVALID', 'That code is not valid.');
  const email = typeof body?.['email'] === 'string' ? normalizeEmail(body['email']) : null;
  const code = body?.['code'];
  if (email === null || typeof code !== 'string') return invalid();
  const now = deps.now();
  const { result, record } = await verifySigninCode({
    record: await deps.store.getSigninCode(email),
    email,
    code,
    now,
    config: deps.config,
    pepper: deps.pepper,
  });
  if (record !== undefined) await deps.store.putSigninCode(record);
  if (result !== 'ok') return invalid();
  const user = await deps.store.upsertUserByEmail(email, now);
  const session = await createSession(user.id, now);
  await deps.store.putSession(session.row);
  return jsonResponse(
    200,
    { user: userJson(user) },
    {
      'set-cookie': sessionCookie(session.token, deps.config),
    },
  );
}

async function logout(request: Request, deps: AuthDeps): Promise<Response> {
  const authed = await requireSession(request, deps);
  if (authed instanceof Response) return authed;
  await deps.store.deleteSession(authed.row.tokenHash);
  return jsonResponse(204, null, { 'set-cookie': clearedSessionCookie() });
}

async function me(request: Request, deps: AuthDeps): Promise<Response> {
  const authed = await requireSession(request, deps);
  if (authed instanceof Response) return authed;
  const wallets = await deps.store.listWallets(authed.user.id);
  return jsonResponse(200, {
    user: userJson(authed.user),
    wallets: wallets.map(walletJson),
    csrfToken: authed.row.csrfToken,
  });
}

async function walletChallenge(request: Request, deps: AuthDeps): Promise<Response> {
  const authed = await requireSession(request, deps);
  if (authed instanceof Response) return authed;
  const body = await readJson(request);
  const account = body?.['account'];
  if (typeof account !== 'string' || !StrKey.isValidEd25519PublicKey(account)) {
    return apiError(400, 'CHALLENGE_INVALID', 'account must be a G… address.');
  }
  const now = deps.now();
  const issued = await issueWalletChallenge({
    serverKeypair: deps.challengeKeypair,
    account,
    domains: deps.domains,
    timeoutSeconds: deps.challengeTimeoutSeconds,
    sessionTokenHash: authed.row.tokenHash,
    now,
    store: deps.store.challenges,
  });
  return jsonResponse(200, {
    challengeXdr: issued.challengeXdr,
    networkPassphrase: issued.networkPassphrase,
    expiresAt: iso(issued.expiresAt),
  });
}

async function walletLink(request: Request, deps: AuthDeps): Promise<Response> {
  const authed = await requireSession(request, deps);
  if (authed instanceof Response) return authed;
  const body = await readJson(request);
  const signedXdr = body?.['challengeXdr'];
  const refuse = () => apiError(400, 'CHALLENGE_INVALID', 'The signed challenge is not valid.');
  if (typeof signedXdr !== 'string') return refuse();
  const account = await verifyWalletChallenge({
    signedXdr,
    serverPublicKey: deps.challengeKeypair.publicKey(),
    domains: deps.domains,
    sessionTokenHash: authed.row.tokenHash,
    store: deps.store.challenges,
  });
  if (account === null) return refuse();
  const result = await deps.store.linkWallet(authed.user.id, account, deps.now());
  if (result === 'linked-elsewhere') {
    return apiError(409, 'WALLET_LINKED_ELSEWHERE', 'This wallet is linked to another account.');
  }
  const link = (await deps.store.listWallets(authed.user.id)).find((w) => w.account === account);
  return jsonResponse(result === 'created' ? 201 : 200, { wallet: link && walletJson(link) });
}

async function walletUnlink(request: Request, deps: AuthDeps, account: string): Promise<Response> {
  const authed = await requireSession(request, deps);
  if (authed instanceof Response) return authed;
  if (await deps.store.walletPaysForWatchedContract(authed.user.id, account)) {
    return apiError(
      409,
      'WALLET_PAYS_FOR_WATCHED_CONTRACT',
      'This wallet pays for a watched contract. Change the payer first.',
    );
  }
  if (!(await deps.store.unlinkWallet(authed.user.id, account))) {
    return apiError(404, 'NOT_FOUND', 'No such wallet on this account.');
  }
  return jsonResponse(204, null);
}

/** The state-changing auth routes, listed so tests can prove each one is guarded. */
export const AUTH_WRITE_ROUTES = [
  ['POST', '/auth/email/start'],
  ['POST', '/auth/email/verify'],
  ['POST', '/auth/logout'],
  ['POST', '/wallets/challenge'],
  ['POST', '/wallets'],
  ['DELETE', '/wallets/{account}'],
] as const;

/**
 * Handles `path` (relative to `/api/v1`) if it is an auth route, else returns
 * `undefined` so the router can try the next group or answer 404.
 */
export async function handleAuth(
  request: Request,
  path: string,
  deps: AuthDeps,
): Promise<Response | undefined> {
  const method = request.method.toUpperCase();
  const route = `${method} ${path}`;
  switch (route) {
    case 'POST /auth/email/start':
      return emailStart(request, deps);
    case 'POST /auth/email/verify':
      return emailVerify(request, deps);
    case 'POST /auth/logout':
      return logout(request, deps);
    case 'GET /me':
      return me(request, deps);
    case 'POST /wallets/challenge':
      return walletChallenge(request, deps);
    case 'POST /wallets':
      return walletLink(request, deps);
  }
  const unlink = /^\/wallets\/([^/]+)$/.exec(path);
  if (method === 'DELETE' && unlink?.[1] !== undefined) {
    return walletUnlink(request, deps, decodeURIComponent(unlink[1]));
  }
  return undefined;
}
