/**
 * Mounts alert preferences in the Worker (PH2-E2-06). A missing database or
 * dashboard origin answers 503 without naming the setting, the same rule as
 * the watchlist mount.
 */
import { authDepsFor, type AuthEnv, type MountOptions } from '../auth/mount.js';
import { neonSqlClient } from '../auth/pg-store.js';
import { PgAlertPreferencesStore } from './pg-store.js';
import type { AlertPreferenceDeps } from './routes.js';
import type { AlertPreferencesStore } from './preferences.js';
import {
  alertPreferencesPageUrl,
  unsubscribeSecret,
  type AlertUnsubscribeDeps,
} from './unsubscribe.js';

export type AlertPreferencesStoreFactory = (
  databaseUrl: string,
) => AlertPreferencesStore | undefined;

export interface AlertMountOptions extends MountOptions {
  readonly createAlertPreferencesStore?: AlertPreferencesStoreFactory;
}

/** What the preference routes need: the database, and the session origin for CSRF. */
export const ALERT_PREFERENCE_NEEDS = ['database', 'session'] as const;

export function alertPreferencesDepsFor(
  env: AuthEnv,
  options: AlertMountOptions,
): AlertPreferenceDeps | undefined {
  const auth = authDepsFor(env, options, ALERT_PREFERENCE_NEEDS);
  const databaseUrl = env.DATABASE_URL;
  if (auth === undefined || databaseUrl === undefined || databaseUrl === '') return undefined;
  const store = (
    options.createAlertPreferencesStore ??
    ((url) => new PgAlertPreferencesStore(neonSqlClient(url)))
  )(databaseUrl);
  if (store === undefined) return undefined;
  return { auth, store, now: auth.now };
}

/**
 * The one-click route. Database and `ALERTS_UNSUBSCRIBE_SECRET` only: it does
 * not need the dashboard origin, the mailer, or the challenge key. A missing
 * secret is the same as a missing database — the route answers 503 and names
 * nothing. Session routes keep working without the secret.
 */
export function alertUnsubscribeDepsFor(
  env: AuthEnv,
  options: AlertMountOptions,
): AlertUnsubscribeDeps | undefined {
  const secret = unsubscribeSecret(env.ALERTS_UNSUBSCRIBE_SECRET);
  const databaseUrl = env.DATABASE_URL;
  if (secret === undefined || databaseUrl === undefined || databaseUrl === '') return undefined;
  const auth = authDepsFor(env, options, ['database']);
  if (auth === undefined) return undefined;
  const store = (
    options.createAlertPreferencesStore ??
    ((url: string) => new PgAlertPreferencesStore(neonSqlClient(url)))
  )(databaseUrl);
  if (store === undefined) return undefined;
  return {
    store,
    secret,
    now: auth.now,
    userActive: async (userId) => (await auth.store.getUser(userId)) !== undefined,
    preferencesUrl: alertPreferencesPageUrl(env.DASHBOARD_ORIGIN),
  };
}
