/**
 * Mounting the jobs and ledger reads in the Worker (`PH2-E2-08`): turns the
 * Worker's environment into `JobsDeps`. A missing setting answers
 * `503 UPSTREAM_UNAVAILABLE` without naming it, like the watchlist.
 */
import { authDepsFor, type MountOptions } from '../auth/mount.js';
import { neonSqlClient } from '../auth/pg-store.js';
import { resendOperatorTransport } from '../alerts/heartbeat.js';
import { PgAlertOutboxStore } from '../alerts/pg-store.js';
import { dispatchUserAlertEvent } from '../alerts/plan.js';
import type { AlertOutboxStore } from '../alerts/dispatch.js';
import { WATCHLIST_DEFAULTS, WATCHLIST_NEEDS, wholeNumber } from '../watchlist/mount.js';
import { PgJobsStore } from './pg-store.js';
import type { JobsDeps } from './routes.js';
import type { JobsStore } from './store.js';

/** Builds the store from `DATABASE_URL`. Defaults to `PgJobsStore` over Neon; tests inject one. */
export type JobsStoreFactory = (databaseUrl: string) => JobsStore | undefined;

export interface JobsMountOptions extends MountOptions {
  readonly createJobsStore?: JobsStoreFactory;
  /** Test seam for the Extend now notice's outbox; defaults to Postgres over `DATABASE_URL`. */
  readonly createAlertOutboxStore?: (databaseUrl: string) => AlertOutboxStore;
  readonly waitUntil?: (promise: Promise<unknown>) => void;
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
  if (store === undefined) return undefined;

  const limitRaw = env['EXTEND_NOW_PER_USER_CONTRACT_PER_DAY'];
  const limit =
    limitRaw === undefined || limitRaw === ''
      ? WATCHLIST_DEFAULTS.EXTEND_NOW_PER_USER_CONTRACT_PER_DAY
      : wholeNumber(limitRaw);
  if (limit === undefined) return undefined; // set but malformed: a misconfigured Worker

  const fetcher = options.fetch ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const outbox = (
    options.createAlertOutboxStore ?? ((url) => new PgAlertOutboxStore(neonSqlClient(url)))
  )(databaseUrl);
  return {
    auth,
    store,
    // Exactly "true": anything else, unset included, is off.
    extendNowEnabled: env['EXTEND_NOW_ENABLED'] === 'true',
    extendNowLimitPerDay: limit,
    now: auth.now,
    ...(options.waitUntil === undefined ? {} : { waitUntil: options.waitUntil }),
    announce: (user, job) =>
      dispatchUserAlertEvent(
        {
          ...(env['ALERTS_SEND'] === undefined ? {} : { ALERTS_SEND: env['ALERTS_SEND'] }),
          ...(env['ALERTS_ALLOWLIST'] === undefined
            ? {}
            : { ALERTS_ALLOWLIST: env['ALERTS_ALLOWLIST'] }),
        },
        {
          kind: 'extend_now_requested',
          userId: user.id,
          // One notice per job: a retried send reuses the outbox row and Resend's key.
          eventId: `job:${job.id}:extend-now`,
          recipient: user.email,
          context: {
            entry: job.contractId,
            network: 'testnet',
            detail: `Paid by ${job.payerWallet}, from the allowance you approved. Job ${job.id}.`,
            ...(env['DASHBOARD_ORIGIN'] === undefined
              ? {}
              : { dashboardUrl: `${env['DASHBOARD_ORIGIN']}/dashboard/activity/?j=${job.id}` }),
          },
          prefs: {},
          deactivated: false,
          ...(env['DASHBOARD_ORIGIN'] === undefined
            ? {}
            : { dashboardOrigin: env['DASHBOARD_ORIGIN'] }),
          nowSeconds: auth.now(),
        },
        {
          store: outbox,
          transportFor: (to) =>
            resendOperatorTransport(
              env['EMAIL_API_KEY'] ?? '',
              env['EMAIL_FROM'] ?? '',
              to,
              (u, i) => fetcher(u as string, i),
            ),
          nowSeconds: auth.now,
        },
      ),
  };
}
