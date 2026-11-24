/**
 * Mounting the jobs and ledger reads in the Worker (`PH2-E2-08`): turns the
 * Worker's environment into `JobsDeps`. A missing setting answers
 * `503 UPSTREAM_UNAVAILABLE` without naming it, like the watchlist.
 */
import { authDepsFor, type MountOptions } from '../auth/mount.js';
import { neonSqlClient } from '../auth/pg-store.js';
import { WATCHLIST_NEEDS } from '../watchlist/mount.js';
import { PgJobsStore } from './pg-store.js';
import type { JobsDeps } from './routes.js';
import type { JobsStore } from './store.js';

/** Builds the store from `DATABASE_URL`. Defaults to `PgJobsStore` over Neon; tests inject one. */
export type JobsStoreFactory = (databaseUrl: string) => JobsStore | undefined;

export interface JobsMountOptions extends MountOptions {
  readonly createJobsStore?: JobsStoreFactory;
}

export function jobsDepsFor(
  env: Readonly<Record<string, string | undefined>>,
  options: JobsMountOptions,
): JobsDeps | undefined {
  const auth = authDepsFor(env, options, WATCHLIST_NEEDS);
  const databaseUrl = env['DATABASE_URL'];
  if (auth === undefined || databaseUrl === undefined || databaseUrl === '') return undefined;
  const store = (options.createJobsStore ?? ((url) => new PgJobsStore(neonSqlClient(url))))(
    databaseUrl,
  );
  return store === undefined ? undefined : { auth, store };
}
