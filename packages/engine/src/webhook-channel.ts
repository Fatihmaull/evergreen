import { createHash, createHmac } from 'node:crypto';
import type { Notification } from '@evergreen-stellar/core';
import type { BumpRecord, NotificationChannel } from '@evergreen-stellar/shared-types';
import { bumpNotificationEventId, previewBumpNotification } from './email-channel.js';

export class WebhookDeliveryError extends Error {
  constructor(
    readonly code: 'WEBHOOK_CONFIG' | 'WEBHOOK_REJECTED' | 'WEBHOOK_UNVERIFIED' | 'WEBHOOK_TIMEOUT',
    readonly classification: 'rejected' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'WebhookDeliveryError';
  }
}

export type WebhookDeliveryResult =
  | { readonly status: 'preview'; readonly submitted: false; readonly notification: Notification }
  | {
      readonly status: 'accepted';
      readonly submitted: true;
      readonly httpStatus: number;
      readonly receivedByEndpoint: 'unverified';
    };

export interface WebhookChannelOptions {
  /**
   * Absolute https URL for the operator webhook. Callers resolve env (e.g. WEBHOOK_URL
   * or a config toEnvVar) before construction; this module never reads process.env.
   */
  readonly url: string;
  readonly mode?: 'dry-run' | 'send';
  readonly fetchImpl?: typeof fetch;
  /**
   * Optional shared secret (conventional env name WEBHOOK_SECRET). Called only on send.
   * Unset/empty → plain HTTPS POST. Non-empty → HMAC-SHA256 of the body in
   * X-Evergreen-Signature: sha256=<hex>. Never embed the secret in the URL.
   */
  readonly readSecret?: () => string | undefined;
}

/** https only; no credentials-in-URL; no whitespace or control characters. */
function webhookUrl(value: string): string {
  if (typeof value !== 'string' || !value.trim() || /[\r\n\s]/.test(value))
    throw new WebhookDeliveryError(
      'WEBHOOK_CONFIG',
      'rejected',
      'Configure one absolute https webhook URL.',
    );
  let parsed: URL;
  try {
    parsed = new URL(value.trim());
  } catch {
    throw new WebhookDeliveryError(
      'WEBHOOK_CONFIG',
      'rejected',
      'Configure one absolute https webhook URL.',
    );
  }
  if (parsed.protocol !== 'https:')
    throw new WebhookDeliveryError(
      'WEBHOOK_CONFIG',
      'rejected',
      'Configure one absolute https webhook URL.',
    );
  if (parsed.username || parsed.password)
    throw new WebhookDeliveryError(
      'WEBHOOK_CONFIG',
      'rejected',
      'Webhook URL must not embed credentials.',
    );
  if (parsed.href.length > 2048)
    throw new WebhookDeliveryError(
      'WEBHOOK_CONFIG',
      'rejected',
      'Configure one absolute https webhook URL.',
    );
  return parsed.href;
}

/** Resolving notify() means preview/skip or HTTP acceptance, never delivery receipt. */
export class WebhookChannel implements NotificationChannel {
  readonly name = 'webhook';
  readonly #url: string;
  readonly #send: boolean;
  readonly #fetch: typeof fetch;
  readonly #readSecret: (() => string | undefined) | undefined;

  constructor(options: WebhookChannelOptions) {
    this.#url = webhookUrl(options.url);
    if (options.mode !== undefined && !['dry-run', 'send'].includes(options.mode))
      throw new WebhookDeliveryError('WEBHOOK_CONFIG', 'rejected', 'Invalid webhook mode.');
    this.#send = options.mode === 'send';
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
    this.#readSecret = options.readSecret;
  }

  async notify(record: BumpRecord): Promise<void> {
    const notification = previewBumpNotification(record);
    if (notification) await this.deliver(notification, bumpNotificationEventId(record));
  }

  async deliver(notification: Notification, eventId: string): Promise<WebhookDeliveryResult> {
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
      throw new WebhookDeliveryError(
        'WEBHOOK_CONFIG',
        'rejected',
        'Invalid webhook message or event identity.',
      );
    if (!this.#send)
      return { status: 'preview', submitted: false, notification: { ...notification } };

    const body = JSON.stringify({
      subject: notification.subject,
      body: notification.body,
      severity: notification.severity,
    });
    const key = `evergreen-webhook-${createHash('sha256')
      .update(JSON.stringify([eventId, body, this.#url]))
      .digest('hex')}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Idempotency-Key': key,
    };
    let secret: string | undefined;
    try {
      secret = this.#readSecret?.();
    } catch {
      throw new WebhookDeliveryError(
        'WEBHOOK_CONFIG',
        'rejected',
        'Webhook secret unavailable or invalid.',
      );
    }
    if (secret !== undefined && secret !== '') {
      if (typeof secret !== 'string' || /\s/.test(secret))
        throw new WebhookDeliveryError(
          'WEBHOOK_CONFIG',
          'rejected',
          'Webhook secret unavailable or invalid.',
        );
      headers['X-Evergreen-Signature'] =
        `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    }

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async (): Promise<WebhookDeliveryResult> => {
          const response = await this.#fetch(this.#url, {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers,
            body,
          });
          if (!response.ok) {
            // Rejection bodies can contain URLs, payloads or credentials.
            await response.body?.cancel();
            throw new WebhookDeliveryError(
              'WEBHOOK_REJECTED',
              response.status >= 500 ? 'unknown' : 'rejected',
              `Webhook endpoint returned HTTP ${response.status}; inspect delivery state before retrying.`,
            );
          }
          // Drain under the abort signal so a stalled body hits WEBHOOK_TIMEOUT.
          // Discard bytes; never put response text into errors or results.
          await response.arrayBuffer();
          return {
            status: 'accepted',
            submitted: true,
            httpStatus: response.status,
            receivedByEndpoint: 'unverified',
          };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new WebhookDeliveryError(
                'WEBHOOK_TIMEOUT',
                'unknown',
                'Webhook delivery timed out; inspect delivery state before retrying.',
              ),
            );
            controller.abort();
          }, 10_000);
        }),
      ]);
    } catch (error) {
      if (error instanceof WebhookDeliveryError) throw error;
      throw new WebhookDeliveryError(
        'WEBHOOK_UNVERIFIED',
        'unknown',
        'Webhook request or response could not be verified; inspect delivery state before retrying.',
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
