/**
 * `GET` and `PATCH /me/alert-preferences` (docs/API.md §6a, PH2-E2-06).
 *
 * The user id comes from the session, never the body. PATCH also passes CSRF
 * inside `requireSession`. A preference is a boolean for an optional kind.
 * This route does not send mail and does not build or submit a transaction:
 * email never authorises anything that moves XLM.
 */
import { requireSession, withRotatedCookie, type AuthDeps } from '../auth/routes.js';
import { apiError, json } from '../router.js';
import {
  parsePreferencePatch,
  preferenceItems,
  type AlertPreferencesStore,
} from './preferences.js';

export interface AlertPreferenceDeps {
  readonly auth: AuthDeps;
  readonly store: AlertPreferencesStore;
  /** Unix seconds. */
  readonly now: () => number;
}

export const ALERT_PREFERENCE_PATH = '/me/alert-preferences';

/** The one state-changing route, listed so tests can prove it is guarded. */
export const ALERT_PREFERENCE_WRITE_ROUTES = [['PATCH', ALERT_PREFERENCE_PATH]] as const;

export function alertPreferenceMethods(path: string): readonly string[] | undefined {
  return path === ALERT_PREFERENCE_PATH ? ['GET', 'PATCH'] : undefined;
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

async function list(request: Request, deps: AlertPreferenceDeps): Promise<Response> {
  const authed = await requireSession(request, deps.auth);
  if (authed instanceof Response) return authed;
  const items = preferenceItems(await deps.store.get(authed.user.id));
  return json({ items });
}

async function patch(request: Request, deps: AlertPreferenceDeps): Promise<Response> {
  const authed = await requireSession(request, deps.auth);
  if (authed instanceof Response) return authed;
  const parsed = parsePreferencePatch(await readJson(request));
  if (!parsed.ok) {
    return apiError('INVALID_REQUEST', parsed.message, parsed.status, {
      details: { field: parsed.field },
    });
  }
  const now = deps.now();
  const userId = authed.user.id;
  if (parsed.value.action === 'set') {
    await deps.store.set(userId, parsed.value.kind, parsed.value.enabled, now);
  } else {
    await deps.store.reset(userId, parsed.value.kind, now);
  }
  return json({ items: preferenceItems(await deps.store.get(userId)) });
}

export async function handleAlertPreferences(
  request: Request,
  path: string,
  deps: AlertPreferenceDeps,
): Promise<Response | undefined> {
  if (path !== ALERT_PREFERENCE_PATH) return undefined;
  const method = request.method.toUpperCase();
  let res: Response | undefined;
  if (method === 'GET') res = await list(request, deps);
  else if (method === 'PATCH') res = await patch(request, deps);
  return res === undefined ? undefined : withRotatedCookie(request, res);
}
