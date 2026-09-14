import { createHash } from 'node:crypto';
import { bumpFailed, bumpSucceeded } from '@evergreen-stellar/core';
import type { Notification } from '@evergreen-stellar/core';
import type { BumpRecord, NotificationChannel } from '@evergreen-stellar/shared-types';

export class EmailDeliveryError extends Error {
  constructor(
    readonly code: 'EMAIL_CONFIG' | 'EMAIL_REJECTED' | 'EMAIL_UNVERIFIED' | 'EMAIL_TIMEOUT',
    readonly classification: 'rejected' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'EmailDeliveryError';
  }
}

export type EmailDeliveryResult =
  | { readonly status: 'preview'; readonly submitted: false; readonly notification: Notification }
  | {
      readonly status: 'accepted';
      readonly submitted: true;
      readonly emailId: string;
      readonly receivedInInbox: 'unverified';
    };

export interface EmailChannelOptions {
  readonly from: string;
  readonly to: string;
  readonly mode?: 'dry-run' | 'send';
  readonly readApiKey?: () => string;
  readonly fetchImpl?: typeof fetch;
}

/** Callers supply genuine records. Preview/rendering does not verify chain evidence. */
export function previewBumpNotification(record: BumpRecord): Notification | undefined {
  switch (record.outcome) {
    case 'simulated':
      return undefined;
    case 'succeeded':
      return bumpSucceeded(record);
    case 'submitted':
    case 'failed':
      return bumpFailed(record);
    default:
      throw new EmailDeliveryError('EMAIL_CONFIG', 'rejected', 'Invalid notification outcome.');
  }
}

/** Stable across object property order; message changes are also bound by deliver(). */
export function bumpNotificationEventId(record: BumpRecord): string {
  return JSON.stringify([
    record.entryKey,
    record.payer,
    record.mode,
    record.outcome,
    record.recordedAt,
    record.transactionHash ?? null,
    record.before.observedAtLedger,
    record.before.endsAtLedger,
    record.extendToLedgers,
  ]);
}

function address(value: string): string {
  if (
    typeof value !== 'string' ||
    /[\r\n]/.test(value) ||
    !/^[^\s@<>,;]+@[^\s@<>,;]+\.[^\s@<>,;]+$/.test(value.trim())
  )
    throw new EmailDeliveryError(
      'EMAIL_CONFIG',
      'rejected',
      'Configure one plain email address for sender and recipient.',
    );
  return value.trim();
}

/** Resolving notify() means preview/skip or provider acceptance, never inbox receipt. */
export class EmailChannel implements NotificationChannel {
  readonly name = 'email';
  readonly #from: string;
  readonly #to: string;
  readonly #send: boolean;
  readonly #fetch: typeof fetch;
  readonly #readApiKey: (() => string) | undefined;

  constructor(options: EmailChannelOptions) {
    this.#from = address(options.from);
    this.#to = address(options.to);
    if (options.mode !== undefined && !['dry-run', 'send'].includes(options.mode))
      throw new EmailDeliveryError('EMAIL_CONFIG', 'rejected', 'Invalid email mode.');
    this.#send = options.mode === 'send';
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
    this.#readApiKey = options.readApiKey;
  }

  async notify(record: BumpRecord): Promise<void> {
    const notification = previewBumpNotification(record);
    if (notification) await this.deliver(notification, bumpNotificationEventId(record));
  }

  async deliver(notification: Notification, eventId: string): Promise<EmailDeliveryResult> {
    if (
      !notification ||
      typeof notification.subject !== 'string' ||
      !notification.subject.trim() ||
      /[\r\n]/.test(notification.subject) ||
      typeof notification.body !== 'string' ||
      !notification.body.trim() ||
      !['info', 'warn', 'critical'].includes(notification.severity) ||
      typeof eventId !== 'string' ||
      !eventId.trim()
    )
      throw new EmailDeliveryError(
        'EMAIL_CONFIG',
        'rejected',
        'Invalid email message or event identity.',
      );
    if (!this.#send)
      return { status: 'preview', submitted: false, notification: { ...notification } };
    let apiKey: string;
    try {
      apiKey = this.#readApiKey?.().trim() ?? '';
      if (!apiKey || /\s/.test(apiKey)) throw new Error();
    } catch {
      throw new EmailDeliveryError(
        'EMAIL_CONFIG',
        'rejected',
        'Email API key unavailable or invalid.',
      );
    }
    const body = JSON.stringify({
      from: this.#from,
      to: [this.#to],
      subject: notification.subject,
      text: notification.body,
    });
    const key = `evergreen-email-${createHash('sha256')
      .update(JSON.stringify([eventId, body]))
      .digest('hex')}`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async (): Promise<EmailDeliveryResult> => {
          const response = await this.#fetch('https://api.resend.com/emails', {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers: {
              Authorization: `Bearer ${apiKey}`,
              'Content-Type': 'application/json',
              'Idempotency-Key': key,
            },
            body,
          });
          if (!response.ok) {
            // Rejection bodies can contain addresses, payloads or credentials.
            await response.body?.cancel();
            throw new EmailDeliveryError(
              'EMAIL_REJECTED',
              response.status >= 500 ? 'unknown' : 'rejected',
              `Email provider returned HTTP ${response.status}; inspect delivery state before retrying.`,
            );
          }
          const result: unknown = await response.json();
          if (
            !result ||
            typeof result !== 'object' ||
            !('id' in result) ||
            typeof result.id !== 'string' ||
            !/^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(result.id)
          )
            throw new Error('Unverified response');
          return {
            status: 'accepted',
            submitted: true,
            emailId: result.id,
            receivedInInbox: 'unverified',
          };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new EmailDeliveryError(
                'EMAIL_TIMEOUT',
                'unknown',
                'Email delivery timed out; inspect delivery state before retrying.',
              ),
            );
            controller.abort();
          }, 10_000);
        }),
      ]);
    } catch (error) {
      if (error instanceof EmailDeliveryError) throw error;
      throw new EmailDeliveryError(
        'EMAIL_UNVERIFIED',
        'unknown',
        'Email request or response could not be verified; inspect delivery state before retrying.',
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
