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
