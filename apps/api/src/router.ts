/**
 * The API Worker's router (docs/API.md §1–§2). Base path `/api/v1`, JSON in
 * and out. Health, the auth group (`PH2-E2-04`, docs/API.md §4), the watchlist
 * group (`PH2-E2-05`, §6) and a JSON 404.
 */
import {
  authDepsFor,
  authRouteNeeds,
  isAuthPath,
  type AuthEnv,
  type MountOptions,
} from './auth/mount.js';
import { MailerError, consoleLogger, emailSendFailedLog } from './auth/mailer-error.js';
import { handleAuth } from './auth/routes.js';
import { watchlistDepsFor, type WatchlistMountOptions } from './watchlist/mount.js';
import { handleWatchlist, watchlistMethods } from './watchlist/routes.js';

export const API_BASE = '/api/v1';
export const API_VERSION = 'v1';
export const SERVICE = 'evergreen-api';

export interface Env extends AuthEnv {
  /** `production` or `preview`, set per environment in wrangler.jsonc. */
  ENVIRONMENT?: string;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

/** Codes whose same request can succeed on retry (docs/API.md §9). */
const RETRYABLE: ReadonlySet<string> = new Set(['RATE_LIMITED', 'UPSTREAM_UNAVAILABLE']);

/**
 * The one way this Worker answers an error: the docs/API.md §9 envelope
 * `{ error: { code, message, retryable, details } }`. `retryable` is derived
 * from the code, never passed, so it cannot drift from the spec.
 */
export function apiError(
  code: string,
  message: string,
  status: number,
  options: { details?: Record<string, unknown>; headers?: Record<string, string> } = {},
): Response {
  return json(
    { error: { code, message, retryable: RETRYABLE.has(code), details: options.details ?? {} } },
    status,
    options.headers,
  );
}

export function notFound(): Response {
  return apiError('NOT_FOUND', 'No such route.', 404);
}

function logSendFailure(
  error: MailerError,
  env: Env,
  request: Request,
  options: MountOptions,
): void {
  try {
    (options.log ?? consoleLogger)(
      emailSendFailedLog(error, {
        environment: env.ENVIRONMENT ?? 'undetermined',
        rayId: request.headers.get('cf-ray'),
      }),
    );
  } catch {
    // A diagnosis aid must never change the answer.
  }
}

export async function handle(
  request: Request,
  env: Env = {},
  options: WatchlistMountOptions = {},
): Promise<Response> {
  const { pathname } = new URL(request.url);
  if (pathname.startsWith(`${API_BASE}/`)) {
    const path = pathname.slice(API_BASE.length);
    if (isAuthPath(path)) {
      const unavailable = () =>
        apiError('UPSTREAM_UNAVAILABLE', 'Sign-in is not available right now.', 503);
      const deps = authDepsFor(env, options, authRouteNeeds(request.method, path));
      if (deps === undefined) return unavailable();
      try {
        return (await handleAuth(request, path, deps)) ?? notFound();
      } catch (error) {
        // The database (or mail provider) did not answer, or a migration is
        // missing: absence is not health, and the error names nothing (§9).
        // A mail provider that refused this send is the one case with its own
        // code, because retrying cannot help. Its cause (a status, an error
        // name, our reason token, two domains) goes to the log, never the wire.
        if (error instanceof MailerError) {
          logSendFailure(error, env, request, options);
          if (error.kind === 'rejected') {
            return apiError('EMAIL_NOT_SENT', 'The sign-in code could not be sent.', 502);
          }
        }
        return unavailable();
      }
    }
  }
  if (pathname.startsWith(`${API_BASE}/`)) {
    const path = pathname.slice(API_BASE.length);
    const allowed = watchlistMethods(path);
    if (allowed !== undefined) {
      const method = request.method.toUpperCase();
      if (!allowed.includes(method)) {
        return apiError('METHOD_NOT_ALLOWED', `Use ${allowed.join(' or ')}.`, 405, {
          headers: { allow: allowed.join(', ') },
        });
      }
      const deps = watchlistDepsFor(env, options);
      if (deps === undefined) {
        return apiError('UPSTREAM_UNAVAILABLE', 'The watchlist is not available right now.', 503);
      }
      try {
        return (await handleWatchlist(request, path, deps)) ?? notFound();
      } catch {
        // The database did not answer: absence is not health, and the error names nothing (§9).
        return apiError('UPSTREAM_UNAVAILABLE', 'The watchlist is not available right now.', 503);
      }
    }
  }
  if (pathname === `${API_BASE}/health`) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return apiError('METHOD_NOT_ALLOWED', 'Use GET.', 405, { headers: { allow: 'GET, HEAD' } });
    }
    return json({
      ok: true,
      service: SERVICE,
      version: API_VERSION,
      environment: env.ENVIRONMENT ?? 'undetermined',
    });
  }
  return notFound();
}
