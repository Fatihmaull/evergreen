/**
 * F17 and F18 (docs/PH2-E4-05-FAILURE-MODES.md). `configCheck` is the detector:
 * setting NAMES only, never a value, and it does not send. `runConfigProblemAlert`
 * is the operator email, same gate as F9/F10/F11.
 *
 * Dedupe (decision for PM, 2026-11-10): the Resend key is
 * `f17-f18:<sorted setting names>:<UTC day YYYY-MM-DD>/<recipient hash>`.
 * The same names on the same UTC day collapse to one email per operator. A new
 * name is a new key that day. The body is those names and fixed text, so it
 * matches the key. Unset versus malformed stays on `thresholdFloor` in the
 * detection log and is not in the body: putting it in the body without putting
 * it in the key would make Resend answer 409.
 *
 * If `EMAIL_API_KEY` or `EMAIL_FROM` is one of the missing names, this does not
 * call the transport. The log is `action: 'email_channel_down'`. A fallback for
 * that case is undetermined (the failure-mode list).
 */
import { operatorSendFailedLog } from './operator-send.js';
import { missingApiSettings, thresholdFloorProblem } from './failure-modes.js';
import { alertsMode, parseAllowlist } from './policy.js';
import type { AlertEnv, AlertNotification, AlertTransport } from './sender.js';

/** The floor's name. The raw text is never copied onto the alert. */
export const THRESHOLD_FLOOR_SETTING = 'THRESHOLD_FLOOR_LEDGERS';

/** Missing either of these means the operator email channel itself is down. */
export const EMAIL_CHANNEL_SETTINGS = ['EMAIL_API_KEY', 'EMAIL_FROM'] as const;

export interface ConfigCheckLog {
  readonly event: 'alerts.f17_f18_config';
  /** F17: `THRESHOLD_FLOOR_LEDGERS` problem, or null when it parses. */
  readonly thresholdFloor: 'unset' | 'malformed' | null;
  /** F18: names of required API settings that are unset or empty. */
  readonly missingSettings: readonly string[];
  /** True when either check found a problem: what an operator alert would fire on. */
  readonly problem: boolean;
}

export function configCheck(env: Readonly<Record<string, unknown>>): ConfigCheckLog {
  const strings: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(env)) if (typeof v === 'string') strings[k] = v;
  const thresholdFloor = thresholdFloorProblem(strings);
  const missingSettings = missingApiSettings(strings);
  return {
    event: 'alerts.f17_f18_config',
    thresholdFloor,
    missingSettings,
    problem: thresholdFloor !== null || missingSettings.length > 0,
  };
}

/** UTC day `YYYY-MM-DD`. `toISOString` is always UTC. */
export function configProblemDay(nowSeconds: number): string {
  return new Date(nowSeconds * 1000).toISOString().slice(0, 10);
}

/**
 * Setting names only, sorted. The floor contributes its name when it is unset
 * or malformed; F18 contributes `missingSettings`. Values are not an input.
 */
export function configProblemNames(check: ConfigCheckLog): readonly string[] {
  const names = new Set<string>();
  if (check.thresholdFloor !== null) names.add(THRESHOLD_FLOOR_SETTING);
  for (const name of check.missingSettings) names.add(name);
  return [...names].sort();
}

/** Names among `EMAIL_CHANNEL_SETTINGS` that `missingSettings` already lists. */
export function emailChannelBlocked(missingSettings: readonly string[]): readonly string[] {
  return EMAIL_CHANNEL_SETTINGS.filter((name) => missingSettings.includes(name));
}

/** Event id for `operatorIdempotencyKey`. Names must already be sorted. */
export function configProblemEventId(names: readonly string[], nowSeconds: number): string {
  return `f17-f18:${names.join(',')}:${configProblemDay(nowSeconds)}`;
}

/** Body is the sorted names and fixed text. It must not gain a value or the floor's state word. */
export function configProblemNotification(names: readonly string[]): AlertNotification {
  return {
    subject: 'Evergreen operator alert: configuration (F17/F18)',
    body: `F17/F18: configuration problem. Setting names: ${names.join(', ')}. Checked by the API Worker cron.`,
    severity: 'critical',
  };
}

export interface ConfigAlertDeps {
  readonly nowSeconds: () => number;
  readonly transportFor: (recipient: string) => AlertTransport;
}

export type ConfigAlertOutcome =
  | { readonly action: 'none' }
  | {
      readonly action: 'email_channel_down';
      readonly settings: readonly string[];
      readonly blockedBy: readonly string[];
    }
  | {
      readonly action: 'dry-run';
      readonly reason: 'alerts_send_off' | 'no_operator';
      readonly settings: readonly string[];
    }
  | {
      readonly action: 'sent';
      readonly recipients: number;
      readonly settings: readonly string[];
      readonly failed?: number;
    }
  | {
      readonly action: 'send_failed';
      readonly failed: number;
      readonly settings: readonly string[];
    };

/**
 * One cron run. No send when there is no problem, or when the email channel's
 * own settings are missing. Otherwise the same gate as F9/F10/F11.
 */
export async function runConfigProblemAlert(
  env: AlertEnv,
  check: ConfigCheckLog,
  deps: ConfigAlertDeps,
): Promise<ConfigAlertOutcome> {
  if (!check.problem) return { action: 'none' };
  const settings = configProblemNames(check);
  const blockedBy = emailChannelBlocked(check.missingSettings);
  if (blockedBy.length > 0) return { action: 'email_channel_down', settings, blockedBy };
  if (alertsMode(env.ALERTS_SEND) !== 'send') {
    return { action: 'dry-run', reason: 'alerts_send_off', settings };
  }
  const operators = [...parseAllowlist(env.ALERTS_ALLOWLIST)];
  if (operators.length === 0) return { action: 'dry-run', reason: 'no_operator', settings };
  const eventId = configProblemEventId(settings, deps.nowSeconds());
  const notification = configProblemNotification(settings);
  // Guard: one recipient's send failure must not skip the other operators or the later checks.
  let sent = 0;
  let failed = 0;
  for (const recipient of operators) {
    try {
      await deps.transportFor(recipient).deliver(notification, eventId);
      sent += 1;
    } catch (error) {
      failed += 1;
      console.log(JSON.stringify(operatorSendFailedLog('alerts.f17_f18_config', error)));
    }
  }
  if (sent === 0) return { action: 'send_failed', failed, settings };
  return failed === 0
    ? { action: 'sent', recipients: sent, settings }
    : { action: 'sent', recipients: sent, failed, settings };
}
