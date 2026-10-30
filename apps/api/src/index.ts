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

export { API_BASE, API_VERSION, SERVICE, apiError, handle, json, notFound } from './router.js';
export type { Env } from './router.js';

// The one default export allowed: the Workers runtime requires a module
// Worker's handler object as the default export.
// eslint-disable-next-line no-restricted-syntax
export default {
  fetch(request: Request, env: Env): Promise<Response> {
    return handle(request, env);
  },
  // F11 heartbeat check (PH2-E4-05). Runs only if a cron trigger is configured
  // for this Worker; logs the outcome, never an address or a key.
  async scheduled(_event: unknown, env: Env & HeartbeatEnv & TestnetResetEnv): Promise<void> {
    const databaseUrl = env.DATABASE_URL;
    const outcome = await runHeartbeatCheck(env, {
      latestTickedAt: async () => {
        if (!databaseUrl) throw new Error('DATABASE_URL unset');
        const rows = await neonSqlClient(databaseUrl).query(LATEST_TICK_SQL, []);
        const t = rows[0]?.['t'];
        return t === null || t === undefined ? undefined : Number(t);
      },
      nowSeconds: () => Math.floor(Date.now() / 1000),
      transportFor: (to) =>
        resendOperatorTransport(env.EMAIL_API_KEY ?? '', env.EMAIL_FROM ?? '', to, (u, i) =>
          fetch(u, i),
        ),
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
      transportFor: (to) =>
        resendOperatorTransport(env.EMAIL_API_KEY ?? '', env.EMAIL_FROM ?? '', to, (u, i) =>
          fetch(u, i),
        ),
    });
    console.log(JSON.stringify({ event: 'alerts.f10_testnet_reset', ...f10 }));
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
export { DAY_SECONDS } from './watchlist/store.js';
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
export {
  LATEST_TICK_SQL,
  heartbeatNotification,
  heartbeatState,
  operatorIdempotencyKey,
  resendOperatorTransport,
  runHeartbeatCheck,
  staleThresholdSeconds,
} from './alerts/heartbeat.js';
export type {
  HeartbeatDeps,
  HeartbeatEnv,
  HeartbeatOutcome,
  HeartbeatState,
} from './alerts/heartbeat.js';
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
export type {
  TestnetResetDeps,
  TestnetResetEnv,
  TestnetResetOutcome,
} from './alerts/testnet-reset.js';

// PH2-E2-06 per-user templates and the preview-only test send (Stage B).
export { ALERT_TEMPLATE_KINDS, renderAlertEmail } from './alerts/templates.js';
export type { AlertContext, AlertEmail } from './alerts/templates.js';
export { resendFetchClient, runPreviewTestSend } from './alerts/test-send.js';
export type { ResendLikeClient, TestSendEnv, TestSendOutcome } from './alerts/test-send.js';
