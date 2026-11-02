/**
 * F17 and F18 (docs/PH2-E4-05-FAILURE-MODES.md), log only, run from the API Worker cron.
 * No table, no read, no send: the operator channel (target Telegram, email until it exists;
 * PM, 2026-10-30) is not wired here, and `ALERTS_SEND` plays no part. The log line carries
 * setting NAMES only, never a value.
 */
import { missingApiSettings, thresholdFloorProblem } from './failure-modes.js';

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
