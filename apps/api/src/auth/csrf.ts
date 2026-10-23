import { timingSafeEqual } from './crypto.js';

export const CSRF_HEADER = 'X-Evergreen-CSRF';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Both checks from docs/API.md §3, for every state-changing request:
 * - `Origin` must equal the dashboard's origin. A missing `Origin` fails:
 *   browsers send it on cross-origin and on every non-GET `fetch`, so its
 *   absence on a state change is not a request this API should honour.
 * - `X-Evergreen-CSRF` must equal the session's synchronizer token.
 *
 * `SameSite=Lax` is a third layer, not a substitute: it does not cover a
 * same-site attacker, and `pages.dev` siblings are separate sites only
 * because the Public Suffix List says so.
 */
export function csrfAllows(args: {
  readonly method: string;
  readonly origin: string | null;
  readonly allowedOrigin: string;
  readonly headerToken: string | null;
  readonly sessionCsrfToken: string;
}): boolean {
  if (SAFE_METHODS.has(args.method.toUpperCase())) return true;
  // A missing Origin (null) never equals the allowed one, so it fails here.
  if (args.origin !== args.allowedOrigin) return false;
  if (args.headerToken === null) return false;
  return timingSafeEqual(args.headerToken, args.sessionCsrfToken);
}
