// W1-D5-04: local provider readiness only; engine notifications follow in W3.
// Retire this probe when EmailChannel lands at W3-D17-01.
// Usage: pnpm email:smoke (preview), pnpm email:smoke --send (one live test).
import console from 'node:console';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';

const ENDPOINT = 'https://api.resend.com/emails';
const SUBJECT = 'Evergreen email setup test [W1-D5-04]';
const TEXT = [
  'This is a manual email setup test from Evergreen.',
  'Receiving this message confirms the local email provider path works.',
  'This is not an engine alert. No Stellar transaction was submitted.',
].join('\n');
const HELP = 'Preview: pnpm email:smoke\nSend one test email: pnpm email:smoke --send';

function address(value, name) {
  const trimmed = value?.trim();
  // Intentionally accepts one plain address, not display names or recipient lists.
  if (!trimmed || !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(trimmed)) {
    throw new Error(`Set ${name} to one plain email address in .env`);
  }
  return trimmed;
}

/** Preview without network access, or explicitly submit one test to Resend. */
export async function runEmailSmoke({ args = [], env = {}, fetchImpl = globalThis.fetch } = {}) {
  if (args.length === 1 && args[0] === '--help') return { status: 'help', usage: HELP };
  if (args.length > 1 || (args.length === 1 && args[0] !== '--send')) {
    throw new Error('Expected no arguments, --help, or --send');
  }
  const send = args[0] === '--send';
  const payload = {
    from: address(env.EMAIL_FROM || 'onboarding@resend.dev', 'EMAIL_FROM'),
    to: [address(env.EMAIL_TO, 'EMAIL_TO')],
    subject: SUBJECT,
    text: TEXT,
  };
  const context = {
    task: 'W1-D5-04',
    provider: 'Resend',
    recipientCount: 1,
    // Logs may become public evidence; keep mailbox addresses out of them.
    from: '[redacted]',
    to: '[redacted]',
    subject: payload.subject,
    text: payload.text,
  };
  if (!send) return { ...context, status: 'dry-run', submitted: false };
  if (env.CI && env.CI !== 'false')
    throw new Error('Live email smoke is local-only; CI cannot send');
  const apiKey = env.EMAIL_API_KEY?.trim();
  if (!apiKey || /\s/.test(apiKey))
    throw new Error('Set EMAIL_API_KEY in .env before using --send');

  const body = JSON.stringify(payload);
  // Reusing the same payload avoids duplicate mail on a manual retry within 24h.
  const idempotencyKey = `evergreen-w1-email-${createHash('sha256').update(body).digest('hex')}`;
  let response;
  try {
    response = await fetchImpl(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body,
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(10_000),
    });
  } catch {
    // Transport errors may contain headers or addresses; never echo raw errors.
    throw new Error('Resend request failed or timed out; check the dashboard before retrying');
  }
  if (!response.ok) {
    throw new Error(`Resend rejected the request (HTTP ${response.status}); check its dashboard`);
  }
  let result;
  try {
    result = await response.json();
  } catch {
    throw new Error('Resend returned invalid JSON; check the dashboard before retrying');
  }
  if (
    typeof result?.id !== 'string' ||
    !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result.id)
  ) {
    throw new Error(
      'Resend response is missing a valid email ID; check the dashboard before retrying',
    );
  }
  return {
    ...context,
    status: 'accepted',
    submitted: true,
    emailId: result.id,
    httpStatus: response.status,
    receivedInInbox: 'unverified',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runEmailSmoke({ args: process.argv.slice(2), env: process.env });
    console.log(JSON.stringify({ ...result, recordedAt: new Date().toISOString() }));
  } catch (error) {
    console.error(JSON.stringify({ task: 'W1-D5-04', status: 'error', error: error.message }));
    process.exitCode = 1;
  }
}
