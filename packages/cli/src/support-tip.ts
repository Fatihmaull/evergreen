/**
 * The CLI's "Support Evergreen" tip (`PH2-E1-08`, plan §3.3).
 *
 * Rules, each enforced here and tested:
 * - at most once per calendar month (UTC);
 * - dismissible for the month (`evergreen tip --dismiss`), or for good with
 *   `EVERGREEN_NO_SUPPORT_TIP=1`;
 * - only to a human at a terminal: stderr must be a TTY;
 * - never with `--json`, never in CI;
 * - the address comes from configuration (`EVERGREEN_SUPPORT_ADDRESS`). No
 *   address is compiled in; with none configured, there is no tip. The final
 *   treasury address waits on `PH2-E4-03`.
 *
 * Pure: the caller reads and writes the state file.
 */
import { StrKey } from '@stellar/stellar-sdk';

export interface SupportTipState {
  /** `YYYY-MM` of the last month the tip was shown or dismissed. */
  readonly lastMonth?: string;
}

export interface SupportTipInput {
  readonly args: readonly string[];
  readonly stderrIsTTY: boolean;
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly now: Date;
  readonly state: SupportTipState;
}

export interface SupportTipDecision {
  /** Text for stderr, or undefined for no tip. */
  readonly text?: string;
  /** State to persist when `text` is shown; undefined means leave it. */
  readonly nextState?: SupportTipState;
}

const CI_VARS = [
  'CI',
  'GITHUB_ACTIONS',
  'GITLAB_CI',
  'BUILDKITE',
  'CIRCLECI',
  'TF_BUILD',
  'JENKINS_URL',
];

export function monthKey(now: Date): string {
  return now.toISOString().slice(0, 7);
}

function isSet(value: string | undefined): boolean {
  return value !== undefined && value !== '' && value !== '0' && value.toLowerCase() !== 'false';
}

export function inCi(env: Readonly<Record<string, string | undefined>>): boolean {
  return CI_VARS.some((name) => isSet(env[name]));
}

export function supportTip(input: SupportTipInput): SupportTipDecision {
  if (!input.stderrIsTTY) return {};
  if (input.args.includes('--json')) return {};
  if (inCi(input.env)) return {};
  if (isSet(input.env['EVERGREEN_NO_SUPPORT_TIP'])) return {};
  const address = input.env['EVERGREEN_SUPPORT_ADDRESS']?.trim();
  if (address === undefined || !StrKey.isValidEd25519PublicKey(address)) return {};
  const month = monthKey(input.now);
  if (input.state.lastMonth === month) return {};
  return {
    text:
      `\nEvergreen is free and open source. If it saved you a restore, you can support it: ${address}\n` +
      `Hide this until next month: evergreen tip --dismiss  (or set EVERGREEN_NO_SUPPORT_TIP=1)`,
    nextState: { lastMonth: month },
  };
}

/** `evergreen tip --dismiss`: hide the tip for the current month. */
export function dismissSupportTip(now: Date): SupportTipState {
  return { lastMonth: monthKey(now) };
}

export function parseSupportTipState(raw: string | undefined): SupportTipState {
  if (raw === undefined) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === 'object' && parsed !== null) {
      const month = (parsed as Record<string, unknown>)['lastMonth'];
      if (typeof month === 'string' && /^\d{4}-\d{2}$/.test(month)) return { lastMonth: month };
    }
  } catch {
    // A corrupt state file means "never shown", not a crash.
  }
  return {};
}
