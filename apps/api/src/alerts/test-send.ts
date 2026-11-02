/**
 * PH2-E2-06 Stage B: preview-only test send of the per-user templates
 * (docs/PH2-E2-06-ALERTS-DESIGN.md §2 item 5, §6). Needs no outbox table:
 * it sends one email per requested kind to each address in
 * `ALERTS_TEST_ALLOWLIST`, and to nobody else. Every guard must pass:
 *   1. `ENVIRONMENT` is exactly `preview`;
 *   2. `ALERTS_SEND` is exactly `send` (alertsMode);
 *   3. `ALERTS_TEST_ALLOWLIST` (a secret: it holds addresses) is non-empty.
 * Otherwise the result is a dry run and the client is never called. Nothing
 * here logs or returns an address. Run via apps/api/scripts/alert-test-send.mjs
 * (docs/ops/alerts-test-send.md).
 */
import { operatorIdempotencyKey } from './heartbeat.js';
import { alertsMode, parseAllowlist, type AlertKind } from './policy.js';
import { ALERT_TEMPLATE_KINDS, renderAlertEmail, type AlertEmail } from './templates.js';

export interface TestSendEnv {
  readonly ENVIRONMENT?: string;
  readonly ALERTS_SEND?: string;
  readonly ALERTS_TEST_ALLOWLIST?: string;
}

/** Minimal Resend-shaped client; tests pass a fake. */
export interface ResendLikeClient {
  send(
    email: { from: string; to: string; subject: string; text: string; html: string },
    idempotencyKey: string,
  ): Promise<{ id?: string }>;
}

export type TestSendOutcome =
  | {
      readonly action: 'dry-run';
      readonly reason: 'not_preview' | 'alerts_send_off' | 'no_allowlist';
      readonly kinds: number;
    }
  | {
      readonly action: 'sent';
      readonly recipients: number;
      readonly sent: number;
      readonly failed: number;
    };

export async function runPreviewTestSend(
  env: TestSendEnv,
  deps: { readonly client: ResendLikeClient; readonly from: string; readonly runId: string },
  kinds: readonly AlertKind[] = ALERT_TEMPLATE_KINDS,
): Promise<TestSendOutcome> {
  if (env.ENVIRONMENT !== 'preview')
    return { action: 'dry-run', reason: 'not_preview', kinds: kinds.length };
  if (alertsMode(env.ALERTS_SEND) !== 'send')
    return { action: 'dry-run', reason: 'alerts_send_off', kinds: kinds.length };
  const to = [...parseAllowlist(env.ALERTS_TEST_ALLOWLIST)];
  if (to.length === 0) return { action: 'dry-run', reason: 'no_allowlist', kinds: kinds.length };
  let sent = 0;
  let failed = 0;
  for (const kind of kinds) {
    const e: AlertEmail = renderAlertEmail(kind, {
      entry: 'TEST-ENTRY (preview test send)',
      network: 'testnet',
      detail: `Test send ${deps.runId}; no real event.`,
    });
    for (const r of to) {
      const key = await operatorIdempotencyKey(`e2-06-test:${deps.runId}:${kind}`, r);
      try {
        await deps.client.send(
          { from: deps.from, to: r, subject: `[TEST] ${e.subject}`, text: e.body, html: e.html },
          key,
        );
        sent++;
      } catch {
        failed++;
      }
    }
  }
  return { action: 'sent', recipients: to.length, sent, failed };
}

/** Real Resend client over fetch; used only by the script, never by tests. */
export function resendFetchClient(apiKey: string, fetcher: typeof fetch): ResendLikeClient {
  return {
    async send(email, idempotencyKey) {
      const res = await fetcher('https://api.resend.com/emails', {
        method: 'POST',
        redirect: 'manual',
        headers: {
          authorization: `Bearer ${apiKey}`,
          'content-type': 'application/json',
          'idempotency-key': idempotencyKey,
        },
        body: JSON.stringify({ ...email, to: [email.to] }),
      });
      if (!res.ok) throw new Error(`test send failed: ${res.status}`);
      return (await res.json()) as { id?: string };
    },
  };
}
