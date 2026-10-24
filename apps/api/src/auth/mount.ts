/**
 * Mounting auth in the Worker (`PH2-E2-04`): turns the Worker's environment
 * into `AuthDeps` per route. A route whose own settings are missing answers
 * `503 UPSTREAM_UNAVAILABLE`; other routes keep working. It never throws, and
 * the error never names which setting is missing.
 */
import { Keypair } from '@stellar/stellar-sdk';
import { loadAuthConfig, type AuthConfig } from './config.js';
import {
  MailerError,
  classifyResendFailure,
  describeKey,
  domainOf,
  isRedirectResponse,
  readBoundedText,
  redirectFailure,
  roundElapsedMs,
  safeFetchErrorName,
  type AuthLogger,
  type FetchStage,
} from './mailer-error.js';
import type { AuthDeps } from './routes.js';
import { PgAuthStore, neonSqlClient } from './pg-store.js';
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

/** Builds the store from `DATABASE_URL`. Defaults to `PgAuthStore` over Neon; tests inject one. */
export type StoreFactory = (databaseUrl: string) => AuthStore | undefined;

export interface MountOptions {
  readonly createStore?: StoreFactory;
  readonly fetch?: typeof fetch;
  readonly now?: () => number;
  /** Where `auth.email_send_failed` goes. Defaults to one JSON line on `console.error`; tests inject a recorder. */
  readonly log?: AuthLogger;
}

/**
 * Sends the sign-in code through Resend. Never logs or echoes the key, the
 * address or the provider's message. A failure throws a `MailerError` carrying
 * only a status, a validated error name, our own reason token and two domains
 * (`mailer-error.ts`).
 */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly fetcher: typeof fetch,
    private readonly hooks: {
      /**
       * Builds the request the way `fetch` will, only to see whether that
       * throws. Defaults to `new Request`; tests swap it to stand in for a
       * runtime with stricter rules. Its result is discarded.
       */
      readonly buildRequest?: (url: string, init: RequestInit) => unknown;
      /** Milliseconds; defaults to `Date.now`. Tests inject a fake clock. */
      readonly clock?: () => number;
    } = {},
  ) {}

  async sendSigninCode(email: string, code: string): Promise<void> {
    const domains = { senderDomain: domainOf(this.from), recipientDomain: domainOf(email) };
    const url = 'https://api.resend.com/emails';
    const init: RequestInit = {
      method: 'POST',
      // Workers does not implement `redirect: 'error'`: it throws a TypeError when
      // the Request is built, before anything is sent (Workers docs, Request). So
      // `manual`, and any 3xx answer below is a failed send, never followed. The
      // Authorization header therefore never goes to any other URL.
      redirect: 'manual',
      headers: { authorization: `Bearer ${this.apiKey}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        from: this.from,
        to: [email],
        subject: 'Your Evergreen sign-in code',
        text: `Your Evergreen sign-in code is ${code}. It expires in 10 minutes. If you did not ask for it, ignore this email.`,
      }),
    };

    // Stage 'build': constructing the request, as `fetch(url, init)` does first.
    // A throw here means nothing left the Worker (an invalid header value or
    // option), which is not an outage. The result is discarded; `fetch` below
    // builds its own from the same arguments.
    try {
      (this.hooks.buildRequest ?? ((u, i) => new Request(u, i)))(url, init);
    } catch (thrown) {
      throw this.networkFailure('build', 'request_invalid', thrown, domains);
    }

    const clock = this.hooks.clock ?? Date.now;
    const startedAt = clock();
    let response: Response;
    try {
      response = await this.fetcher(url, init);
    } catch (thrown) {
      let elapsedMs: number | undefined;
      try {
        elapsedMs = roundElapsedMs(clock() - startedAt);
      } catch {
        elapsedMs = undefined; // a clock that throws costs the field, not the answer
      }
      throw this.networkFailure('send', 'network_error', thrown, domains, elapsedMs);
    }
    if (isRedirectResponse(response)) {
      // Not followed, `Location` not read, body dropped unread.
      try {
        await response.body?.cancel();
      } catch {
        // an unreadable body costs nothing here
      }
      throw new MailerError(redirectFailure(response.status, domains));
    }
    if (response.ok) {
      await response.body?.cancel();
      return;
    }
    // Only a bounded slice, parsed for the error name and a message prefix.
    throw new MailerError(
      classifyResendFailure(response.status, await readBoundedText(response), domains),
    );
  }

  /**
   * The thrown error's text can carry the URL, a header value or a library
   * message: dropped. Only its `name` survives, and only as a plain letters
   * token, plus the stage, the key facts and (send only) a coarse elapsed time.
   */
  private networkFailure(
    fetchStage: FetchStage,
    reason: 'request_invalid' | 'network_error',
    thrown: unknown,
    domains: { readonly senderDomain: string; readonly recipientDomain: string },
    elapsedMs?: number,
  ): MailerError {
    const fetchErrorName = safeFetchErrorName(thrown);
    return new MailerError({
      kind: 'network',
      reason,
      fetchStage,
      ...(fetchErrorName === undefined ? {} : { fetchErrorName }),
      ...(elapsedMs === undefined ? {} : { elapsedMs }),
      ...describeKey(this.apiKey),
      ...domains,
    });
  }
}

const present = (v: string | undefined): v is string => v !== undefined && v !== '';

/**
 * What an auth route needs from the environment (Fatih, 2026-10-23: each route
 * requires only the settings it uses, so a missing Resend key cannot take the
 * wallet routes down, nor a missing signing key the email routes).
 *
 * - `database`: `DATABASE_URL` and a store. Every auth route.
 * - `email`: `SIGNIN_CODE_PEPPER`, `EMAIL_API_KEY`, `EMAIL_FROM`. Email start and verify.
 * - `session`: a valid `DASHBOARD_ORIGIN`, which CSRF's Origin check compares against.
 * - `challenge`: a valid `CHALLENGE_SIGNING_KEY` seed. The wallet challenge and link routes.
 */
export type AuthFeature = 'database' | 'email' | 'session' | 'challenge';

export function authRouteNeeds(method: string, path: string): readonly AuthFeature[] {
  switch (`${method.toUpperCase()} ${path}`) {
    case 'POST /auth/email/start':
    case 'POST /auth/email/verify':
      return ['database', 'email'];
    case 'POST /auth/logout':
    case 'GET /me':
      return ['database', 'session'];
    case 'POST /wallets/challenge':
    case 'POST /wallets':
      return ['database', 'session', 'challenge'];
  }
  if (method.toUpperCase() === 'DELETE' && /^\/wallets\/[^/]+$/.test(path)) {
    return ['database', 'session'];
  }
  return []; // not an auth route: the router answers 404 without touching anything
}

/** Thrown if a route ever reaches a setting it did not declare; the router answers 503. */
export class AuthUnavailableError extends Error {
  constructor() {
    super('Auth setting not configured for this route.');
    this.name = 'AuthUnavailableError';
  }
}

function unavailable<T extends object>(): T {
  return new Proxy({} as T, {
    get() {
      throw new AuthUnavailableError();
    },
  });
}

/**
 * `AuthDeps` for one route, or `undefined` (503) when a setting it needs is
 * missing or malformed. Settings the route does not need are left as values
 * that throw when touched, never as empty strings: an empty pepper would
 * silently MAC codes under no key.
 */
export function authDepsFor(
  env: AuthEnv,
  options: MountOptions,
  needs: readonly AuthFeature[],
): AuthDeps | undefined {
  let config: AuthConfig;
  try {
    config = loadAuthConfig(env);
  } catch {
    return undefined; // AuthConfigError: misconfigured Worker, 503 per request
  }
  const deps: Record<string, unknown> = {
    config,
    challengeTimeoutSeconds: CHALLENGE_TIMEOUT_SECONDS,
    now: options.now ?? (() => Math.floor(Date.now() / 1000)),
  };
  const lazy = (name: string) =>
    Object.defineProperty(deps, name, {
      enumerable: true,
      get() {
        throw new AuthUnavailableError();
      },
    });

  if (needs.includes('database')) {
    if (!present(env.DATABASE_URL)) return undefined;
    const store = (options.createStore ?? defaultStoreFactory(options))(env.DATABASE_URL);
    if (store === undefined) return undefined;
    deps['store'] = store;
  } else deps['store'] = unavailable<AuthStore>();

  if (needs.includes('email')) {
    // The one place the key is read. It goes into an `authorization` header, and
    // a secret stored with a trailing newline or space makes `fetch` throw for an
    // invalid header value. All-whitespace is unset: 503, no fetch.
    const emailApiKey = env.EMAIL_API_KEY?.trim();
    if (!present(env.SIGNIN_CODE_PEPPER) || !present(emailApiKey) || !present(env.EMAIL_FROM)) {
      return undefined;
    }
    deps['pepper'] = env.SIGNIN_CODE_PEPPER;
    deps['mailer'] = new ResendMailer(emailApiKey, env.EMAIL_FROM, options.fetch ?? fetch);
  } else {
    lazy('pepper');
    deps['mailer'] = unavailable<Mailer>();
  }

  let origin: URL | undefined;
  if (needs.includes('session') || needs.includes('challenge')) {
    if (!present(env.DASHBOARD_ORIGIN)) return undefined;
    try {
      origin = new URL(env.DASHBOARD_ORIGIN);
    } catch {
      return undefined;
    }
    deps['allowedOrigin'] = origin.origin;
    deps['domains'] = { homeDomain: origin.host, webAuthDomain: origin.host };
  } else {
    lazy('allowedOrigin');
    lazy('domains');
  }

  if (needs.includes('challenge')) {
    if (!present(env.CHALLENGE_SIGNING_KEY)) return undefined;
    try {
      deps['challengeKeypair'] = Keypair.fromSecret(env.CHALLENGE_SIGNING_KEY);
    } catch {
      return undefined;
    }
  } else deps['challengeKeypair'] = unavailable<Keypair>();

  return deps as unknown as AuthDeps;
}

/** `DATABASE_URL` set and no factory injected: Postgres on Neon over schema.sql. */
function defaultStoreFactory(options: MountOptions): StoreFactory {
  return (databaseUrl) =>
    new PgAuthStore(
      neonSqlClient(databaseUrl),
      options.now ?? (() => Math.floor(Date.now() / 1000)),
    );
}

/** `AuthDeps` with every feature, or `undefined` when any setting is missing. */
export function authDepsFromEnv(env: AuthEnv, options: MountOptions = {}): AuthDeps | undefined {
  return authDepsFor(env, options, ['database', 'email', 'session', 'challenge']);
}

/** Paths (relative to `/api/v1`) owned by the auth group. */
export function isAuthPath(path: string): boolean {
  return /^\/(?:auth\/|me$|wallets(?:\/|$))/.test(path);
}
