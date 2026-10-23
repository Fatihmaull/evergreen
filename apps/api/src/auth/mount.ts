/**
 * Mounting auth in the Worker (`PH2-E2-04`): turns the Worker's environment
 * into `AuthDeps`, or into a reason it cannot serve auth yet. A missing
 * secret, database or store answers `503 UPSTREAM_UNAVAILABLE` per route; it
 * never throws, and the error never names which secret is missing.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { loadAuthConfig, type AuthConfig } from './config.js';
import type { AuthDeps } from './routes.js';
import type { AuthStore, Mailer } from './store.js';

/** Worker secrets (`wrangler secret put`). Names are also listed in docs/API.md §1. */
export const AUTH_SECRET_NAMES = [
  'DATABASE_URL',
  'SIGNIN_CODE_PEPPER',
  'EMAIL_API_KEY',
  'CHALLENGE_SIGNING_KEY',
] as const;

/** How long a wallet-link challenge is valid, in seconds (SEP-10's usual 5 minutes). */
export const CHALLENGE_TIMEOUT_SECONDS = 300;

export interface AuthEnv {
  /** Neon Postgres connection string (secret). */
  DATABASE_URL?: string;
  /** HMAC key sign-in codes are stored under (secret). */
  SIGNIN_CODE_PEPPER?: string;
  /** Resend API key, same name the engine's EmailChannel uses (secret). */
  EMAIL_API_KEY?: string;
  /** Stellar secret seed (S…) of the unfunded challenge-signing key, ADR-008 (secret). */
  CHALLENGE_SIGNING_KEY?: string;
  /** Sender address for sign-in codes (var, not secret). */
  EMAIL_FROM?: string;
  /** The dashboard's origin, e.g. https://evergreen-stellar.pages.dev (var). CSRF and SEP-10 domains derive from it. */
  DASHBOARD_ORIGIN?: string;
  [setting: string]: string | undefined;
}

/** Builds the Postgres-backed store. Not wired until #391's schema is merged; see the PR. */
export type StoreFactory = (databaseUrl: string) => AuthStore | undefined;

export interface MountOptions {
  readonly createStore?: StoreFactory;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
}

/** Sends the sign-in code through Resend. Never logs or echoes the key, address or body. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch,
  ) {}

  async sendSigninCode(email: string, code: string): Promise<void> {
    const response = await this.fetcher('https://api.resend.com/emails', {
      method: 'POST',
      redirect: 'error',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [email],
        subject: 'Your Evergreen sign-in code',
        text: `Your Evergreen sign-in code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.`,
      }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error(`Email provider returned HTTP ${response.status}.`);
  }
}

const present = (v: string | undefined): v is string => v !== undefined && v !== '';

/** `AuthDeps` from the environment, or `undefined` when auth cannot be served. */
export function authDepsFromEnv(env: AuthEnv, options: MountOptions = {}): AuthDeps | undefined {
  if (!AUTH_SECRET_NAMES.every((name) => present(env[name]))) return undefined;
  if (!present(env.EMAIL_FROM) || !present(env.DASHBOARD_ORIGIN)) return undefined;
  let origin: URL;
  let challengeKeypair: Keypair;
  let config: AuthConfig;
  try {
    origin = new URL(env.DASHBOARD_ORIGIN);
    challengeKeypair = Keypair.fromSecret(env.CHALLENGE_SIGNING_KEY!);
    config = loadAuthConfig(env);
  } catch {
    // A malformed origin, seed or setting (AuthConfigError) is a misconfigured
    // Worker: answer 503 per request rather than crash or guess.
    return undefined;
  }
  const store = options.createStore?.(env.DATABASE_URL!);
  if (store === undefined) return undefined;
  return {
    store,
    mailer: new ResendMailer(env.EMAIL_API_KEY!, env.EMAIL_FROM, options.fetch ?? fetch),
    config,
    pepper: env.SIGNIN_CODE_PEPPER!,
    challengeKeypair,
    domains: { homeDomain: origin.host, webAuthDomain: origin.host },
    challengeTimeoutSeconds: CHALLENGE_TIMEOUT_SECONDS,
    allowedOrigin: origin.origin,
    now: options.now ?? (() => Math.floor(Date.now() / 1000)),
  };
}

/** Paths (relative to `/api/v1`) owned by the auth group. */
export function isAuthPath(path: string): boolean {
  return /^\/(?:auth\/|me$|wallets(?:\/|$))/.test(path);
}
