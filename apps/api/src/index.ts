/**
 * The backend API Worker (docs/API.md, option B in ADR-003's 2026-10-21
 * amendment). Reached from the dashboard through a Pages Function that
 * forwards `/api/*` over the service binding `API`.
 */
import { handle, type Env } from './router.js';

export { API_BASE, API_VERSION, SERVICE, apiError, handle, json, notFound } from './router.js';
export type { Env } from './router.js';

// The one default export allowed: the Workers runtime requires a module
// Worker's handler object as the default export.
// eslint-disable-next-line no-restricted-syntax
export default {
  fetch(request: Request, env: Env): Response {
    return handle(request, env);
  },
};

// Auth core (PH2-E2-04).
export { AUTH_DEFAULTS, AuthConfigError, loadAuthConfig } from './auth/config.js';
export type { AuthConfig, AuthSetting } from './auth/config.js';
export { CSRF_HEADER, csrfAllows } from './auth/csrf.js';
export { hitLimit, MemoryCounterStore } from './auth/rate-limit.js';
export type { CounterStore, Limit, RateDecision } from './auth/rate-limit.js';
export {
  SESSION_COOKIE,
  clearedSessionCookie,
  createSession,
  hashSessionToken,
  readSessionToken,
  sessionCookie,
  sessionState,
  touchSession,
} from './auth/sessions.js';
export type { SessionRow } from './auth/sessions.js';
export { issueSigninCode, normalizeEmail, verifySigninCode } from './auth/signin-codes.js';
export type { SigninCodeRecord } from './auth/signin-codes.js';
export {
  CHALLENGE_NETWORK_PASSPHRASE,
  issueWalletChallenge,
  verifyWalletChallenge,
} from './auth/wallet-challenge.js';
export type { ChallengeDomains, ChallengeStore } from './auth/wallet-challenge.js';
