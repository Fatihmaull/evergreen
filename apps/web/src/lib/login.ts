/**
 * /login/'s calls, as outcomes the page renders (PH2-E3-01, spec #350 §4).
 *
 * Every call goes through `lib/api.ts`, so the page inherits its rules: branch
 * on the envelope's `code`, never the status; a code this client does not know
 * is `UNRECOGNISED`; and "the API did not answer" (a Pages 404, an HTML page, a
 * network error, JSON without §9's envelope) is `unavailable`. On this page
 * every one of those reads **undetermined**, never "signed out" and never
 * "sent". Only `UNAUTHENTICATED` from the API itself is the signed-out state.
 *
 * Pure: no DOM, no storage. `fetchImpl` is injectable for tests.
 */
import { apiRequest, type ApiOutcome, type FetchLike } from './api';

export interface Me {
  readonly user: { readonly id: string; readonly email: string; readonly createdAt: string };
  readonly wallets: readonly { readonly account: string }[];
  readonly csrfToken: string;
}

export interface Challenge {
  readonly challengeXdr: string;
  readonly networkPassphrase: string;
}

/** Why the page cannot tell: a short, human line for the undetermined panel. */
export type Undetermined = { readonly kind: 'undetermined'; readonly detail: string };

export type SessionResult =
  { readonly kind: 'signed-in'; readonly me: Me } | { readonly kind: 'signed-out' } | Undetermined;
export type StartResult =
  | { readonly kind: 'sent' }
  | { readonly kind: 'rate-limited'; readonly retryAfterSeconds?: number }
  | { readonly kind: 'not-sent'; readonly detail: string }
  | { readonly kind: 'email-not-sent' }
  | Undetermined;
export type VerifyResult =
  { readonly kind: 'verified' } | { readonly kind: 'code-invalid' } | Undetermined;
export type ChallengeResult =
  | { readonly kind: 'challenge'; readonly challenge: Challenge }
  | { readonly kind: 'signed-out' }
  | Undetermined;
export type LinkResult =
  | { readonly kind: 'linked' }
  | { readonly kind: 'linked-elsewhere' }
  | { readonly kind: 'challenge-invalid' }
  | { readonly kind: 'csrf-failed' }
  | { readonly kind: 'signed-out' }
  | Undetermined;

/** What was received, for the undetermined panel. Never the server's `message`. */
export function describe(o: ApiOutcome<unknown>): string {
  if (o.kind === 'unavailable') {
    return o.reason === 'network'
      ? 'no response from the account service'
      : 'a response that is not the account service’s answer (no API envelope)';
  }
  if (o.kind === 'error') return `HTTP ${o.status} ${o.code}`;
  return `HTTP ${o.status}, not an answer this route gives`;
}

const und = (o: ApiOutcome<unknown>): Undetermined => ({
  kind: 'undetermined',
  detail: describe(o),
});

function postInit(body: unknown, csrfToken?: string): RequestInit {
  return {
    method: 'POST',
    body: JSON.stringify(body),
    headers: {
      'Content-Type': 'application/json',
      ...(csrfToken === undefined ? {} : { 'X-Evergreen-CSRF': csrfToken }),
    },
  };
}

function isMe(d: unknown): d is Me {
  const m = d as Me | null;
  return (
    typeof m === 'object' &&
    m !== null &&
    typeof m.csrfToken === 'string' &&
    typeof m.user?.email === 'string' &&
    Array.isArray(m.wallets)
  );
}

export async function readSession(f?: FetchLike): Promise<SessionResult> {
  const o = await apiRequest<unknown>('/me', { method: 'GET' }, f);
  if (o.kind === 'ok' && o.status === 200 && isMe(o.data)) return { kind: 'signed-in', me: o.data };
  if (o.kind === 'error' && o.code === 'UNAUTHENTICATED') return { kind: 'signed-out' };
  return und(o);
}

export async function startEmail(email: string, f?: FetchLike): Promise<StartResult> {
  const o = await apiRequest<unknown>('/auth/email/start', postInit({ email }), f);
  if (o.kind === 'ok' && o.status === 202) return { kind: 'sent' };
  if (o.kind === 'error' && o.code === 'RATE_LIMITED') {
    return o.retryAfterSeconds === undefined
      ? { kind: 'rate-limited' }
      : { kind: 'rate-limited', retryAfterSeconds: o.retryAfterSeconds };
  }
  // The API answered, in its own envelope, that it could not do the send. That
  // is an answer, not silence: the page says nothing was sent, and nothing about why.
  if (o.kind === 'error' && o.code === 'UPSTREAM_UNAVAILABLE') {
    return { kind: 'not-sent', detail: describe(o) };
  }
  // `502 EMAIL_NOT_SENT`, not retryable (§4, §9): the mail provider refused this
  // send. The client learns the class of the answer and nothing about the cause.
  if (o.kind === 'error' && o.code === 'EMAIL_NOT_SENT') return { kind: 'email-not-sent' };
  return und(o);
}

export async function verifyEmail(
  email: string,
  code: string,
  f?: FetchLike,
): Promise<VerifyResult> {
  const o = await apiRequest<unknown>('/auth/email/verify', postInit({ email, code }), f);
  if (o.kind === 'ok' && o.status === 200) return { kind: 'verified' };
  if (o.kind === 'error' && o.code === 'CODE_INVALID') return { kind: 'code-invalid' };
  return und(o);
}

export async function requestChallenge(
  account: string,
  csrfToken: string,
  f?: FetchLike,
): Promise<ChallengeResult> {
  const o = await apiRequest<unknown>('/wallets/challenge', postInit({ account }, csrfToken), f);
  if (o.kind === 'ok' && o.status === 200) {
    const c = o.data as Partial<Challenge> | null;
    if (typeof c?.challengeXdr === 'string' && typeof c.networkPassphrase === 'string') {
      return {
        kind: 'challenge',
        challenge: { challengeXdr: c.challengeXdr, networkPassphrase: c.networkPassphrase },
      };
    }
  }
  if (o.kind === 'error' && o.code === 'UNAUTHENTICATED') return { kind: 'signed-out' };
  return und(o);
}

export async function linkWallet(
  signedXdr: string,
  csrfToken: string,
  f?: FetchLike,
): Promise<LinkResult> {
  const o = await apiRequest<unknown>(
    '/wallets',
    postInit({ challengeXdr: signedXdr }, csrfToken),
    f,
  );
  if (o.kind === 'ok' && (o.status === 201 || o.status === 200)) return { kind: 'linked' };
  if (o.kind === 'error') {
    switch (o.code) {
      case 'WALLET_LINKED_ELSEWHERE':
        return { kind: 'linked-elsewhere' };
      case 'CHALLENGE_INVALID':
        return { kind: 'challenge-invalid' };
      case 'CSRF_FAILED':
        return { kind: 'csrf-failed' };
      case 'UNAUTHENTICATED':
        return { kind: 'signed-out' };
    }
  }
  return und(o);
}

export type LogoutResult =
  { readonly kind: 'signed-out' } | { readonly kind: 'csrf-failed' } | Undetermined;

/** `POST /auth/logout`, §4: `204`. Already signed out (`UNAUTHENTICATED`) is the same end state. */
export async function logout(csrfToken: string, f?: FetchLike): Promise<LogoutResult> {
  const o = await apiRequest<unknown>(
    '/auth/logout',
    { method: 'POST', headers: { 'X-Evergreen-CSRF': csrfToken } },
    f,
  );
  if (o.kind === 'ok' && o.status === 204) return { kind: 'signed-out' };
  if (o.kind === 'error' && o.code === 'UNAUTHENTICATED') return { kind: 'signed-out' };
  if (o.kind === 'error' && o.code === 'CSRF_FAILED') return { kind: 'csrf-failed' };
  return und(o);
}

export type UnlinkResult =
  | { readonly kind: 'unlinked' }
  | { readonly kind: 'pays-for-watched' }
  | { readonly kind: 'csrf-failed' }
  | { readonly kind: 'signed-out' }
  | Undetermined;

/**
 * `DELETE /wallets/{account}`, §4. #350 does not state the success status for
 * this route; `204` is read as unlinked (the convention of §4's logout and
 * §6's delete), and any other success status stays undetermined until the
 * spec says.
 *
 * Client only, no control yet: §9a's `WALLET_PAYS_FOR_WATCHED_CONTRACT` row
 * puts the revoke (`approve(0)`, a wallet-signed money path, WEBR) beside
 * unlink, so the unlink control waits for that screen.
 */
export async function unlinkWallet(
  account: string,
  csrfToken: string,
  f?: FetchLike,
): Promise<UnlinkResult> {
  const o = await apiRequest<unknown>(
    `/wallets/${encodeURIComponent(account)}`,
    { method: 'DELETE', headers: { 'X-Evergreen-CSRF': csrfToken } },
    f,
  );
  if (o.kind === 'ok' && o.status === 204) return { kind: 'unlinked' };
  if (o.kind === 'error') {
    switch (o.code) {
      case 'WALLET_PAYS_FOR_WATCHED_CONTRACT':
        return { kind: 'pays-for-watched' };
      case 'CSRF_FAILED':
        return { kind: 'csrf-failed' };
      case 'UNAUTHENTICATED':
        return { kind: 'signed-out' };
    }
  }
  return und(o);
}
