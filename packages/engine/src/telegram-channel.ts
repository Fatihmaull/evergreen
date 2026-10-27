import type { Notification } from '@evergreen-stellar/core';
import type { BumpRecord, NotificationChannel } from '@evergreen-stellar/shared-types';
import { bumpNotificationEventId, previewBumpNotification } from './email-channel.js';

export class TelegramDeliveryError extends Error {
  constructor(
    readonly code:
      'TELEGRAM_CONFIG' | 'TELEGRAM_REJECTED' | 'TELEGRAM_UNVERIFIED' | 'TELEGRAM_TIMEOUT',
    readonly classification: 'rejected' | 'unknown',
    message: string,
  ) {
    super(message);
    this.name = 'TelegramDeliveryError';
  }
}

export type TelegramDeliveryResult =
  | { readonly status: 'preview'; readonly submitted: false; readonly notification: Notification }
  | {
      readonly status: 'accepted';
      readonly submitted: true;
      readonly httpStatus: number;
      readonly receivedByChat: 'unverified';
    };

export interface TelegramChannelOptions {
  /**
   * Target chat. Callers resolve it (conventional env name TELEGRAM_CHAT_ID) before
   * construction; this module never reads process.env.
   */
  readonly chatId: string;
  readonly mode?: 'dry-run' | 'send';
  readonly fetchImpl?: typeof fetch;
  /** Bot token (conventional env name TELEGRAM_BOT_TOKEN). Called only on send. */
  readonly readBotToken?: () => string;
}

/** Bot API sendMessage text limit. */
export const TELEGRAM_TEXT_LIMIT = 4096;
const TRUNCATED = '…(truncated)';

function telegramChatId(value: string): string {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 256 ||
    /\s/.test(value) ||
    [...value].some((c) => c.charCodeAt(0) < 0x20 || c.charCodeAt(0) === 0x7f)
  )
    throw new TelegramDeliveryError(
      'TELEGRAM_CONFIG',
      'rejected',
      'Configure one Telegram chat id.',
    );
  return value;
}

/** Plain text: subject, blank line, body; cut to the Bot API limit. */
export function telegramText(notification: Notification): string {
  const text = `${notification.subject}\n\n${notification.body}`;
  return text.length <= TELEGRAM_TEXT_LIMIT
    ? text
    : text.slice(0, TELEGRAM_TEXT_LIMIT - TRUNCATED.length) + TRUNCATED;
}

/** Resolving notify() means preview/skip or Bot API acceptance, never a read receipt. */
export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram';
  readonly #chatId: string;
  readonly #send: boolean;
  readonly #fetch: typeof fetch;
  readonly #readBotToken: (() => string) | undefined;

  constructor(options: TelegramChannelOptions) {
    this.#chatId = telegramChatId(options?.chatId);
    if (options.mode !== undefined && !['dry-run', 'send'].includes(options.mode))
      throw new TelegramDeliveryError('TELEGRAM_CONFIG', 'rejected', 'Invalid Telegram mode.');
    this.#send = options.mode === 'send';
    this.#fetch = options.fetchImpl ?? globalThis.fetch;
    this.#readBotToken = options.readBotToken;
  }

  async notify(record: BumpRecord): Promise<void> {
    const notification = previewBumpNotification(record);
    if (notification) await this.deliver(notification, bumpNotificationEventId(record));
  }

  /**
   * The Bot API has no idempotency key, so eventId is validated but not sent. Callers
   * must not retry an 'unknown' failure blindly: the message may already be posted.
   */
  async deliver(notification: Notification, eventId: string): Promise<TelegramDeliveryResult> {
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
      throw new TelegramDeliveryError(
        'TELEGRAM_CONFIG',
        'rejected',
        'Invalid Telegram message or event identity.',
      );
    if (!this.#send)
      return { status: 'preview', submitted: false, notification: { ...notification } };

    let token: string | undefined;
    try {
      token = this.#readBotToken?.();
    } catch {
      token = undefined;
    }
    if (typeof token !== 'string' || !/^[A-Za-z0-9:_-]+$/.test(token))
      throw new TelegramDeliveryError(
        'TELEGRAM_CONFIG',
        'rejected',
        'Telegram bot token unavailable or invalid.',
      );

    const body = JSON.stringify({
      chat_id: this.#chatId,
      text: telegramText(notification),
      disable_web_page_preview: true,
    });

    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        (async (): Promise<TelegramDeliveryResult> => {
          const response = await this.#fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            redirect: 'error',
            signal: controller.signal,
            headers: { 'Content-Type': 'application/json' },
            body,
          });
          if (!response.ok) {
            // Bot API descriptions can echo chat ids or message text.
            await response.body?.cancel();
            throw new TelegramDeliveryError(
              'TELEGRAM_REJECTED',
              response.status >= 500 ? 'unknown' : 'rejected',
              `Telegram Bot API returned HTTP ${response.status}; inspect the chat before retrying.`,
            );
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(await response.text());
          } catch {
            parsed = undefined;
          }
          if (
            typeof parsed !== 'object' ||
            parsed === null ||
            (parsed as { ok?: unknown }).ok !== true
          )
            throw new TelegramDeliveryError(
              'TELEGRAM_UNVERIFIED',
              'unknown',
              'Telegram response could not be verified; inspect the chat before retrying.',
            );
          return {
            status: 'accepted',
            submitted: true,
            httpStatus: response.status,
            receivedByChat: 'unverified',
          };
        })(),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => {
            reject(
              new TelegramDeliveryError(
                'TELEGRAM_TIMEOUT',
                'unknown',
                'Telegram delivery timed out; inspect the chat before retrying.',
              ),
            );
            controller.abort();
          }, 10_000);
        }),
      ]);
    } catch (error) {
      if (error instanceof TelegramDeliveryError) throw error;
      // Never surface the underlying error: fetch errors can include the token-bearing URL.
      throw new TelegramDeliveryError(
        'TELEGRAM_UNVERIFIED',
        'unknown',
        'Telegram request or response could not be verified; inspect the chat before retrying.',
      );
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  }
}
