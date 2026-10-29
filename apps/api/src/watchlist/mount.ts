/**
 * Mounting the watchlist in the Worker (`PH2-E2-05`): turns the Worker's
 * environment into `WatchlistDeps`. Like auth's mount, a missing or malformed
 * setting answers `503 UPSTREAM_UNAVAILABLE` without naming it.
 *
 * Settings (config, not constants in code, §3):
 * - `EXTEND_NOW_PER_USER_CONTRACT_PER_DAY`: the "Extend now" limit shown on
 *   each item. Default 3, Fatih's starting value (2026-10-20, amended 2026-10-23).
 * - `THRESHOLD_FLOOR_LEDGERS`: the lowest `thresholdLedgers` the API accepts
 *   (§6). No default: the value is the engine's to publish (`PH2-E4-04`,
 *   `B-D31-01`), and until it is set autopilot cannot be turned on.
 */
import { authDepsFor, type AuthFeature, type MountOptions } from '../auth/mount.js';
import { neonSqlClient } from '../auth/pg-store.js';
import { PgWatchlistStore } from './pg-store.js';
import type { WatchlistDeps } from './routes.js';
import type { WatchlistStore } from './store.js';

export const WATCHLIST_DEFAULTS = { EXTEND_NOW_PER_USER_CONTRACT_PER_DAY: 3 } as const;

/** Builds the store from `DATABASE_URL`. Defaults to `PgWatchlistStore` over Neon; tests inject one. */
export type WatchlistStoreFactory = (databaseUrl: string) => WatchlistStore | undefined;

export interface WatchlistMountOptions extends MountOptions {
  readonly createWatchlistStore?: WatchlistStoreFactory;
}

/** What every watchlist route needs: the database, and the session's origin for CSRF. */
export const WATCHLIST_NEEDS: readonly AuthFeature[] = ['database', 'session'];

export const wholeNumber = (raw: string): number | undefined =>
  /^[1-9]\d*$/.test(raw) && Number.isSafeInteger(Number(raw)) ? Number(raw) : undefined;

export function watchlistDepsFor(
  env: Readonly<Record<string, string | undefined>>,
  options: WatchlistMountOptions,
): WatchlistDeps | undefined {
  const auth = authDepsFor(env, options, WATCHLIST_NEEDS);
  const databaseUrl = env['DATABASE_URL'];
  if (auth === undefined || databaseUrl === undefined || databaseUrl === '') return undefined;

  const limitRaw = env['EXTEND_NOW_PER_USER_CONTRACT_PER_DAY'];
  const limit =
    limitRaw === undefined || limitRaw === ''
      ? WATCHLIST_DEFAULTS.EXTEND_NOW_PER_USER_CONTRACT_PER_DAY
      : wholeNumber(limitRaw);
  const floorRaw = env['THRESHOLD_FLOOR_LEDGERS'];
  const floor = floorRaw === undefined || floorRaw === '' ? undefined : wholeNumber(floorRaw);
  // Set but malformed is a misconfigured Worker, not "unset".
  if (limit === undefined || (floorRaw !== undefined && floorRaw !== '' && floor === undefined)) {
    return undefined;
  }

  const store = (
    options.createWatchlistStore ?? ((url) => new PgWatchlistStore(neonSqlClient(url)))
  )(databaseUrl);
  if (store === undefined) return undefined;
  return {
    auth,
    store,
    extendNowLimitPerDay: limit,
    thresholdFloorLedgers: floor,
    now: auth.now,
  };
}
