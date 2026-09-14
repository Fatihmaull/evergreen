import { loadConfig } from '@evergreen-stellar/core';
import {
  EmailChannel,
  EmailDeliveryError,
  previewBumpNotification,
  bumpNotificationEventId,
} from './email-channel.js';
import { parseNotificationRecord, NotificationRecordError } from './notification-record.js';

export interface EmailCommandDependencies {
  readFile(path: string): Promise<string>;
  env(name: string): string | undefined;
  readonly fetchImpl?: typeof fetch;
}
const HELP = `usage: pnpm email:notify --record path [--config path] [--send]

Default: preview only; no API-key lookup, email or Stellar transaction.
Config defaults to evergreen.config.json and needs notifications.toEnvVar.
Recipient comes only from that environment variable; no EMAIL_TO fallback.
EMAIL_FROM defaults to onboarding@resend.dev; explicit --send needs EMAIL_API_KEY.
No .env auto-loading. Supply one public BumpRecord, not an entire engine run.
Input records are structurally validated, not independently verified on chain.
Simulated records are skipped; failed/submitted records never become success alerts.
This rehearsal command refuses --send in CI. No automatic resend after uncertainty.
Provider acceptance is not inbox receipt. Exit 0: preview/skip/accepted; 2: error.`;

export async function runEmailCommand(
  args: readonly string[],
  deps: EmailCommandDependencies,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fail = (code: string, message: string, classification?: 'unknown' | 'rejected') => ({
    stdout: JSON.stringify({
      error: { code, message, ...(classification ? { classification } : {}) },
    }),
    stderr: message,
    exitCode: 2,
  });
  if (args.length === 1 && args[0] === '--help') return { stdout: HELP, stderr: '', exitCode: 0 };
  const values = new Map<string, string>();
  let send = false;
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--send' && !send) {
      send = true;
      continue;
    }
    if ((arg === '--record' || arg === '--config') && !values.has(arg)) {
      const value = args[++i];
      if (value && !value.startsWith('--')) {
        values.set(arg, value);
        continue;
      }
    }
    return fail('ARGUMENTS', 'Invalid or repeated email argument. Use --help.');
  }
  if (!values.has('--record')) return fail('ARGUMENTS', 'An explicit --record path is required.');
  try {
    const ci = send ? deps.env('CI') : undefined;
    if (ci && ci !== 'false')
      return fail('LOCAL_ONLY', 'The email rehearsal command cannot send in CI.');
    const record = parseNotificationRecord(await deps.readFile(values.get('--record')!));
    const notification = previewBumpNotification(record);
    if (!notification)
      return {
        stdout: JSON.stringify({
          status: 'skipped',
          submitted: false,
          reason: 'Simulation is not a bump success.',
          chainVerified: false,
        }),
        stderr: '',
        exitCode: 0,
      };
    const { config } = loadConfig(
      await deps.readFile(values.get('--config') ?? 'evergreen.config.json'),
    );
    if (!config.notifications)
      return fail('EMAIL_CONFIG', 'Configure notifications.toEnvVar for the email recipient.');
    const channel = new EmailChannel({
      from: deps.env('EMAIL_FROM') || 'onboarding@resend.dev',
      to: deps.env(config.notifications.toEnvVar) ?? '',
      mode: send ? 'send' : 'dry-run',
      readApiKey: () => deps.env('EMAIL_API_KEY') ?? '',
      ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
    });
    const result = await channel.deliver(notification, bumpNotificationEventId(record));
    return {
      stdout: JSON.stringify(
        { ...result, chainVerified: false, recordSource: 'provided-record' },
        null,
        2,
      ),
      stderr: '',
      exitCode: 0,
    };
  } catch (error) {
    if (error instanceof EmailDeliveryError)
      return fail(error.code, error.message, error.classification);
    if (error instanceof NotificationRecordError) return fail('RECORD_INVALID', error.message);
    // Config validation can quote supplied strings, so keep this boundary generic.
    return fail(
      'EMAIL_INPUT',
      'Unable to read or validate notification input/configuration. No provider details are printed.',
    );
  }
}
