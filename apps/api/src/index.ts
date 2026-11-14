/**
 * The backend API Worker (docs/API.md, option B in ADR-003's 2026-10-21
 * amendment). Reached from the dashboard through a Pages Function that
 * forwards `/api/*` over the service binding `API`.
 */
import { handle, type Env } from './router.js';
import { neonSqlClient } from './auth/pg-store.js';
import {
  LATEST_TICK_SQL,
  resendOperatorTransport,
  runHeartbeatCheck,
  type HeartbeatEnv,
} from './alerts/heartbeat.js';
import {
  RECENT_TICKS_SQL,
  runTestnetResetCheck,
  type TestnetResetEnv,
} from './alerts/testnet-reset.js';
import { LATEST_OK_TICK_SQL, runSlowTickCheck, type SlowTickEnv } from './alerts/slow-tick.js';
import { configCheck, runConfigProblemAlert } from './alerts/config-check.js';
import { runDatabaseUnavailableAlert } from './alerts/database-unavailable.js';

export { API_BASE, API_VERSION, SERVICE, apiError, handle, json, notFound } from './router.js';
export type { Env, HandleOptions } from './router.js';

// The one default export allowed: the Workers runtime requires a module
// Worker's handler object as the default export.
// eslint-disable-next-line no-restricted-syntax
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
  // F17/F18, then F11, F10, F9, then at most one F14 (PH2-E4-05). Runs only if a
  // cron trigger is configured for this Worker. A failed Resend call stays inside
  // one recipient (the next operator and the next check still run). Logs never
  // carry an address, a key, or a setting value.
  async scheduled(
    _event: unknown,
    env: Env & HeartbeatEnv & TestnetResetEnv & SlowTickEnv,
  ): Promise<void> {
    const nowSeconds = (): number => Math.floor(Date.now() / 1000);
    const transportFor = (to: string) =>
      resendOperatorTransport(env.EMAIL_API_KEY ?? '', env.EMAIL_FROM ?? '', to, (u, i) =>
        fetch(u, i),
      );
    // F17/F18: detection log is names only. The email, when problem is true, is
    // separate and does not read the database.
    const config = configCheck(env as unknown as Record<string, unknown>);
    console.log(JSON.stringify(config));
    const configAlert = await runConfigProblemAlert(env, config, { nowSeconds, transportFor });
    if (configAlert.action !== 'none') {
      console.log(JSON.stringify({ event: 'alerts.f17_f18_config', ...configAlert }));
    }
    const databaseUrl = env.DATABASE_URL;
    const outcome = await runHeartbeatCheck(env, {
      latestTickedAt: async () => {
        if (!databaseUrl) throw new Error('DATABASE_URL unset');
        const rows = await neonSqlClient(databaseUrl).query(LATEST_TICK_SQL, []);
        const t = rows[0]?.['t'];
        return t === null || t === undefined ? undefined : Number(t);
      },
      nowSeconds,
      transportFor,
    });
    console.log(JSON.stringify({ event: 'alerts.f11_heartbeat', ...outcome }));
    // F10 signal 1 (PH2-E4-05): observed ledger decreased between ticks.
    const f10 = await runTestnetResetCheck(env, {
      recentTicks: async (limit) => {
        if (!databaseUrl) throw new Error('DATABASE_URL unset');
        const rows = await neonSqlClient(databaseUrl).query(RECENT_TICKS_SQL, [limit]);
        return rows.map((r) => ({
          tickedAt: Number(r['t']),
          observedLedger: BigInt(String(r['l'])),
        }));
      },
      transportFor,
    });
    console.log(JSON.stringify({ event: 'alerts.f10_testnet_reset', ...f10 }));
    // F9 slow-tick (PH2-E4-05): the newest successful tick's RPC time is above the threshold.
    const f9 = await runSlowTickCheck(env, {
      latestOkTick: async () => {
        if (!databaseUrl) throw new Error('DATABASE_URL unset');
        const rows = await neonSqlClient(databaseUrl).query(LATEST_OK_TICK_SQL, []);
        const row = rows[0];
        if (row === undefined) return undefined;
        const ms = row['rpc_ms'];
        return {
          tickedAt: Number(row['t']),
          rpcMs: ms === null || ms === undefined ? undefined : Number(ms),
        };
      },
      nowSeconds,
      transportFor,
    });
    console.log(JSON.stringify({ event: 'alerts.f9_slow_tick', ...f9 }));
    // F14: one email for this invocation, however many of the three reads failed.
    // The alert function has no database client.
    const readFailures = [outcome, f10, f9].filter((item) => item.action === 'read_failed').length;
    if (readFailures > 0) {
      const f14 = await runDatabaseUnavailableAlert(env, { nowSeconds, transportFor });
      console.log(JSON.stringify({ event: 'alerts.f14_database', ...f14, readFailures }));
    }
  },
};

// Auth core (PH2-E2-04).
export { AUTH_DEFAULTS, AuthConfigError, loadAuthConfig } from './auth/config.js';
export type { AuthConfig, AuthSetting } from './auth/config.js';
export { CSRF_HEADER, csrfAllows } from './auth/csrf.js';
export { hitLimit, MemoryCounterStore } from './auth/rate-limit.js';
export type { CounterStore, Limit, RateDecision } from './auth/rate-limit.js';
export {
  SESSION_COOKIE,
  SESSION_ROTATE_AFTER_SECONDS,
  SESSION_ROTATION_GRACE_SECONDS,
  clearedSessionCookie,
  rotateSession,
  rotationDue,
  createSession,
  hashSessionToken,
  readSessionToken,
  sessionCookie,
  sessionState,
  touchSession,
} from './auth/sessions.js';
export type { SessionRow } from './auth/sessions.js';
export { issueSigninCode, normalizeEmail, verifySigninCode } from './auth/signin-codes.js';
export type { SigninCodeRecord } from './auth/signin-codes.js';
export {
  CHALLENGE_NETWORK_PASSPHRASE,
  issueWalletChallenge,
  verifyWalletChallenge,
} from './auth/wallet-challenge.js';
export type { ChallengeDomains, ChallengeStore } from './auth/wallet-challenge.js';
export { MemoryAuthStore, MemoryChallengeStore } from './auth/memory-store.js';
export { AUTH_WRITE_ROUTES, handleAuth } from './auth/routes.js';
export type { AuthDeps } from './auth/routes.js';
export type { AuthStore, LinkResult, Mailer, User, WalletLink } from './auth/store.js';
export {
  MAX_ERROR_BODY_BYTES,
  MailerError,
  classifyResendFailure,
  consoleLogger,
  domainOf,
  emailSendFailedLog,
  readBoundedText,
  safeFetchErrorName,
} from './auth/mailer-error.js';
export type {
  AuthLogEntry,
  AuthLogger,
  EmailSendFailedLog,
  MailerFailure,
  MailerFailureKind,
  MailerFailureReason,
} from './auth/mailer-error.js';
export {
  AUTH_SECRET_NAMES,
  CHALLENGE_TIMEOUT_SECONDS,
  AuthUnavailableError,
  ResendMailer,
  authDepsFor,
  authDepsFromEnv,
  authRouteNeeds,
  isAuthPath,
} from './auth/mount.js';
export type { AuthEnv, AuthFeature, MountOptions, StoreFactory } from './auth/mount.js';
export {
  PgAuthStore,
  PgChallengeStore,
  PgCounterStore,
  neonSqlClient,
  upsertSessionQuery,
} from './auth/pg-store.js';
export type { SqlClient, SqlQuery, SqlRow } from './auth/pg-store.js';

// Watchlist (PH2-E2-05).
export { WATCHLIST_WRITE_ROUTES, handleWatchlist, isWatchlistPath } from './watchlist/routes.js';
export type { WatchlistDeps } from './watchlist/routes.js';
export { WATCHLIST_DEFAULTS, WATCHLIST_NEEDS, watchlistDepsFor } from './watchlist/mount.js';
export type { WatchlistMountOptions, WatchlistStoreFactory } from './watchlist/mount.js';
export { MemoryWatchlistStore } from './watchlist/memory-store.js';
export { PgWatchlistStore } from './watchlist/pg-store.js';
export { DAY_SECONDS, WATCH_ITEMS_PER_USER_MAX, WatchItemCapReached } from './watchlist/store.js';
export type {
  AddOutcome,
  AutopilotPatch,
  AutopilotSettings,
  NewWatchItem,
  UpdateResult,
  WatchNetwork,
  WatchPatch,
  WatchRecord,
  WatchScope,
  WatchlistStore,
} from './watchlist/store.js';
export {
  ALERT_RATE_LIMIT,
  ALERT_SPECS,
  alertsMode,
  canUnsubscribe,
  isAllowlisted,
  isRequired,
  parseAllowlist,
  rateDecision as alertRateDecision,
  wantsAlert,
} from './alerts/policy.js';
export type { AlertClass, AlertKind, AlertSpec, AlertsMode } from './alerts/policy.js';
export { decideAlert, sendAlert } from './alerts/sender.js';
export { PgAlertOutboxStore, PgAlertPreferencesStore } from './alerts/pg-store.js';
export {
  LATEST_TICK_SQL,
  heartbeatNotification,
  heartbeatState,
  operatorIdempotencyKey,
  resendOperatorTransport,
  runHeartbeatCheck,
  staleThresholdSeconds,
} from './alerts/heartbeat.js';
export { operatorSendFailedLog } from './alerts/operator-send.js';
export type { OperatorCheckEvent, OperatorSendFailedLog } from './alerts/operator-send.js';
export type {
  HeartbeatDeps,
  HeartbeatEnv,
  HeartbeatOutcome,
  HeartbeatState,
} from './alerts/heartbeat.js';
export {
  LATEST_OK_TICK_SQL,
  SLOW_TICK_RPC_MS,
  runSlowTickCheck,
  slowTickNotification,
  slowTickState,
} from './alerts/slow-tick.js';
export type {
  LatestOkTick,
  SlowTickDeps,
  SlowTickEnv,
  SlowTickOutcome,
  SlowTickState,
} from './alerts/slow-tick.js';
export type {
  AlertEnv,
  AlertNotification,
  AlertOutcome,
  AlertRequest,
  AlertTransport,
} from './alerts/sender.js';
export {
  API_REQUIRED_SETTINGS,
  FAILURE_MODES,
  FAILURE_MODE_ALERTS,
  alertModeMismatches,
  gapMarginHolds,
  missingApiSettings,
  thresholdFloorProblem,
  tickGaps,
  testnetResetSignal,
  entriesAtRiskFromGap,
  duplicatePulls,
  isPreflightFailed,
  isPulledThenFailed,
  isRefundOwed,
  isTryAgainLater,
  pulledThenFailedRates,
  reconcileProblems,
  pulledThenFailedBreaches,
  PULLED_THEN_FAILED_WINDOW_SECONDS,
  PULLED_THEN_FAILED_MIN_PULLED,
  PULLED_THEN_FAILED_RATE_PERCENT,
  floatCheck,
  isPermanentEmailFailure,
  emailFailureOperatorAlert,
} from './alerts/failure-modes.js';
export type {
  FailureMode,
  FailureModeAlerts,
  JobFacts,
  LedgerFact,
  OperatorAlert,
  PulledThenFailedRate,
  ReconcileProblem,
  TickFact,
  TickGaps,
  TestnetResetSignal,
  EntryLedgersLeft,
  UserAlert,
  UserJobFact,
  WindowedUserJobFact,
  PulledThenFailedBreach,
  FloatFacts,
  FloatCheck,
  EmailFailureFacts,
} from './alerts/failure-modes.js';
export {
  ALERT_BACKOFF_BASE_SECONDS,
  DEFAULT_ALERT_MAX_ATTEMPTS,
  alertRetryDelaySeconds,
  dispatchUserAlert,
  memoryOutboxStore,
  testnetResetUserEvents,
} from './alerts/dispatch.js';
export type {
  AlertOutboxStore,
  DispatchDeps,
  DispatchOutcome,
  DispatchRequest,
  OutboxRow,
  OutboxStatus,
} from './alerts/dispatch.js';
export {
  RECENT_TICKS_SQL,
  lookbackTicks,
  runTestnetResetCheck,
  testnetResetNotification,
} from './alerts/testnet-reset.js';
export {
  EMAIL_CHANNEL_SETTINGS,
  THRESHOLD_FLOOR_SETTING,
  configCheck,
  configProblemDay,
  configProblemEventId,
  configProblemNames,
  configProblemNotification,
  emailChannelBlocked,
  runConfigProblemAlert,
} from './alerts/config-check.js';
export type { ConfigAlertDeps, ConfigAlertOutcome, ConfigCheckLog } from './alerts/config-check.js';
export {
  databaseUnavailableEventId,
  databaseUnavailableHour,
  databaseUnavailableNotification,
  runDatabaseUnavailableAlert,
} from './alerts/database-unavailable.js';
export type {
  DatabaseUnavailableDeps,
  DatabaseUnavailableOutcome,
} from './alerts/database-unavailable.js';
export type {
  TestnetResetDeps,
  TestnetResetEnv,
  TestnetResetOutcome,
} from './alerts/testnet-reset.js';

// PH2-E2-06 per-user templates and the preview-only test send (Stage B).
export { ALERT_TEMPLATE_KINDS, renderAlertEmail } from './alerts/templates.js';
export type { AlertContext, AlertEmail } from './alerts/templates.js';
export {
  ALERT_PREFERENCE_PATH,
  ALERT_PREFERENCE_WRITE_ROUTES,
  alertPreferenceMethods,
  handleAlertPreferences,
} from './alerts/routes.js';
export type { AlertPreferenceDeps } from './alerts/routes.js';
export {
  ALERT_PREFERENCE_NEEDS,
  alertPreferencesDepsFor,
  alertUnsubscribeDepsFor,
} from './alerts/mount.js';
export type { AlertMountOptions, AlertPreferencesStoreFactory } from './alerts/mount.js';
export { MemoryAlertPreferencesStore } from './alerts/memory-store.js';
export type { PreferenceRow } from './alerts/memory-store.js';
export { parsePreferencePatch, preferenceItems } from './alerts/preferences.js';
export type {
  AlertPreferencesStore,
  ParsedPreference,
  PreferenceItem,
  PreferenceRefusal,
  PreferenceWrite,
} from './alerts/preferences.js';
export { resendFetchClient, runPreviewTestSend } from './alerts/test-send.js';
export {
  ALERT_PREFERENCES_PAGE_PATH,
  ALERT_UNSUBSCRIBE_METHODS,
  ALERT_UNSUBSCRIBE_PATH,
  PUBLIC_API_BASE,
  UNSUBSCRIBE_PURPOSE,
  UNSUBSCRIBE_TTL_SECONDS,
  alertPreferencesPageUrl,
  alertUnsubscribeMethods,
  alertUnsubscribeUrl,
  disableOptionalAlerts,
  handleAlertUnsubscribe,
  httpsOrigin,
  mintUnsubscribeToken,
  unsubscribeSecret,
  verifyUnsubscribeToken,
} from './alerts/unsubscribe.js';
export type { AlertUnsubscribeDeps, UnsubscribeClaims } from './alerts/unsubscribe.js';
export {
  MAX_EVENT_ID_LENGTH,
  dispatchUserAlertEvent,
  eventIdProblem,
  planUserAlert,
} from './alerts/plan.js';
export type {
  EventIdProblem,
  PlanResult,
  PlannedDispatchOutcome,
  UserAlertEvent,
} from './alerts/plan.js';
export type { ResendLikeClient, TestSendEnv, TestSendOutcome } from './alerts/test-send.js';
