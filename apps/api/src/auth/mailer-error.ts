/**
 * What a failed sign-in email send looks like to the rest of the Worker.
 *
 * The mail provider's refusal text is never kept. Resend's `message` can embed
 * the account owner's own address (the `onboarding@resend.dev` sandbox refusal
 * does), so the classifier reads it only to match a fixed prefix and returns
 * our own `reason` token. Everything on a `MailerError` is a closed set or a
 * validated token, so it is safe to log and, for `kind`, to map to a status.
 *
 * Resend's documented errors: https://resend.com/docs/api-reference/errors
 * and https://resend.com/docs/knowledge-base/403-error-resend-dev-domain
 * (read 2026-10-24). A rewording on Resend's side degrades to `unclassified`,
 * which still logs the status and error name.
 */

/**
 * `rejected`: the provider answered 4xx (other than 429) and retrying the same
 * request will not help. `unavailable`: 429, 5xx or an odd status; the provider
 * is busy or down. `network`: no answer.
 */
export type MailerFailureKind = 'rejected' | 'unavailable' | 'network';

/** Our own tokens, never provider text. */
export type MailerFailureReason =
  | 'testing_recipient_restricted'
  | 'sender_domain_not_verified'
  | 'api_key_rejected'
  | 'recipient_invalid'
  | 'sender_invalid'
  | 'quota_or_rate_limited'
  | 'provider_5xx'
  | 'network_error'
  | 'request_invalid'
  | 'unexpected_redirect'
  | 'unclassified';

/**
 * Where a `kind: network` failure happened. `build`: constructing the request
 * threw, so nothing left the Worker (`reason: request_invalid`). `send`:
 * `fetch` itself threw (`reason: network_error`). Closed list: anything else
 * is dropped from the log line.
 */
export type FetchStage = 'build' | 'send';
export const FETCH_STAGES: ReadonlySet<string> = new Set<FetchStage>(['build', 'send']);

/** Length of the (trimmed) API key in coarse buckets. Never the exact length. */
export type KeyLengthBucket = '0' | '1-31' | '32-63' | '64-127' | '128+';
export const KEY_LENGTH_BUCKETS: ReadonlySet<string> = new Set<KeyLengthBucket>([
  '0',
  '1-31',
  '32-63',
  '64-127',
  '128+',
]);

/** Facts about the key, never the key. */
export interface KeyFacts {
  readonly keyLength: KeyLengthBucket;
  /** Any character outside 0x21-0x7e: a space, a control character, or non-ASCII. */
  readonly keyHasNonPrintableAscii: boolean;
  /** Any whitespace between the first and the last character (the ends are trimmed). */
  readonly keyHasInnerWhitespace: boolean;
}

export interface MailerFailure {
  readonly kind: MailerFailureKind;
  readonly reason: MailerFailureReason;
  readonly httpStatus?: number;
  /** Resend's error `name`, only if it is a short `lower_snake` token. */
  readonly providerErrorName?: string;
  /**
   * `kind: 'network'` only: the `name` of what `fetch` threw (`TypeError` for an
   * invalid header value, for one), only if it is 1 to 64 ASCII letters. Never
   * the message, the stack or the cause.
   */
  readonly fetchErrorName?: string;
  /** `kind: 'network'` only: whether building the request or `fetch` threw. */
  readonly fetchStage?: FetchStage;
  /** `kind: 'network'` only: `fetchStage: 'send'`, whole milliseconds rounded to 100. */
  readonly elapsedMs?: number;
  /** `kind: 'network'` only: facts about the trimmed key. */
  readonly keyLength?: KeyLengthBucket;
  readonly keyHasNonPrintableAscii?: boolean;
  readonly keyHasInnerWhitespace?: boolean;
  /** Domain part only, `unknown` if it did not parse. Never the local part. */
  readonly senderDomain: string;
  readonly recipientDomain: string;
}

export class MailerError extends Error implements MailerFailure {
  readonly kind: MailerFailureKind;
  readonly reason: MailerFailureReason;
  readonly httpStatus?: number;
  readonly providerErrorName?: string;
  readonly fetchErrorName?: string;
  readonly fetchStage?: FetchStage;
  readonly elapsedMs?: number;
  readonly keyLength?: KeyLengthBucket;
  readonly keyHasNonPrintableAscii?: boolean;
  readonly keyHasInnerWhitespace?: boolean;
  readonly senderDomain: string;
  readonly recipientDomain: string;

  constructor(failure: MailerFailure) {
    // A constant message: nothing from the provider, the key or the address.
    super('The email provider did not send the sign-in code.');
    this.name = 'MailerError';
    this.kind = failure.kind;
    this.reason = failure.reason;
    this.senderDomain = failure.senderDomain;
    this.recipientDomain = failure.recipientDomain;
    if (failure.httpStatus !== undefined) this.httpStatus = failure.httpStatus;
    if (failure.providerErrorName !== undefined) this.providerErrorName = failure.providerErrorName;
    if (failure.fetchErrorName !== undefined) this.fetchErrorName = failure.fetchErrorName;
    if (failure.fetchStage !== undefined) this.fetchStage = failure.fetchStage;
    if (failure.elapsedMs !== undefined) this.elapsedMs = failure.elapsedMs;
    if (failure.keyLength !== undefined) this.keyLength = failure.keyLength;
    if (failure.keyHasNonPrintableAscii !== undefined) {
      this.keyHasNonPrintableAscii = failure.keyHasNonPrintableAscii;
    }
    if (failure.keyHasInnerWhitespace !== undefined) {
      this.keyHasInnerWhitespace = failure.keyHasInnerWhitespace;
    }
  }
}

/** How much of a provider error body is read. The rest is dropped unread. */
export const MAX_ERROR_BODY_BYTES = 2048;

const ERROR_NAME = /^[a-z_]{1,64}$/;
const FETCH_ERROR_NAME = /^[A-Za-z]{1,64}$/;
const DOMAIN = /@([a-z0-9.-]{1,253})>?\s*$/i;

/**
 * The `name` of a value `fetch` threw, or `undefined` if it is not a plain
 * 1 to 64 letter token (a hostile or odd name is dropped, not sanitised).
 * Reads nothing else: not the message, the stack or the cause. Never throws.
 */
export function safeFetchErrorName(thrown: unknown): string | undefined {
  try {
    if (typeof thrown !== 'object' || thrown === null) return undefined;
    const name: unknown = (thrown as { name?: unknown }).name;
    return typeof name === 'string' && FETCH_ERROR_NAME.test(name) ? name : undefined;
  } catch {
    return undefined; // a getter that throws
  }
}

/**
 * Coarse facts about an API key, computed from the trimmed value. Returns a
 * bucket and two booleans, never any part of the key. The bucket is safe to
 * log: Resend keys are one fixed-looking shape, so four wide buckets say
 * nothing a reader could not already guess, and they do not shorten a search.
 * Never throws.
 */
export function describeKey(key: string): KeyFacts {
  const trimmed = key.trim();
  const n = trimmed.length;
  const keyLength: KeyLengthBucket =
    n === 0 ? '0' : n < 32 ? '1-31' : n < 64 ? '32-63' : n < 128 ? '64-127' : '128+';
  let nonPrintable = false;
  for (let i = 0; i < n; i++) {
    const unit = trimmed.charCodeAt(i);
    if (unit < 0x21 || unit > 0x7e) {
      nonPrintable = true;
      break;
    }
  }
  return {
    keyLength,
    keyHasNonPrintableAscii: nonPrintable,
    keyHasInnerWhitespace: /\s/.test(trimmed),
  };
}

/** Whole milliseconds, rounded to the nearest 100, never negative. */
export function roundElapsedMs(ms: number): number {
  return Number.isFinite(ms) && ms > 0 ? Math.round(ms / 100) * 100 : 0;
}

/** `a@b.example` or `Name <a@b.example>` -> `b.example`; anything else -> `unknown`. */
export function domainOf(address: string): string {
  const match = DOMAIN.exec(address);
  return match?.[1] === undefined ? 'unknown' : match[1].toLowerCase();
}

/**
 * Reads at most `MAX_ERROR_BODY_BYTES` of a response and cancels the rest.
 * Returns '' if the body is absent or unreadable: a diagnosis aid must never
 * be the reason the request fails.
 */
export async function readBoundedText(response: Response): Promise<string> {
  const reader = response.body?.getReader();
  if (reader === undefined) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_ERROR_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.byteLength;
    }
  } catch {
    return '';
  } finally {
    await reader.cancel().catch(() => undefined);
  }
  const bytes = new Uint8Array(Math.min(total, MAX_ERROR_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    const room = bytes.length - offset;
    if (room <= 0) break;
    bytes.set(chunk.subarray(0, room), offset);
    offset += Math.min(chunk.byteLength, room);
  }
  return new TextDecoder().decode(bytes);
}

const KEY_NAMES: ReadonlySet<string> = new Set([
  'missing_api_key',
  'restricted_api_key',
  'suspended_api_key',
]);

/** Fixed prefixes of Resend's documented messages. Read, matched, never kept. */
function reasonFor(name: string | undefined, message: string): MailerFailureReason {
  if (name !== undefined && KEY_NAMES.has(name)) return 'api_key_rejected';
  if (message.startsWith('You can only send testing emails to your own email address')) {
    return 'testing_recipient_restricted';
  }
  if (/^The `[^`\s]{1,253}` domain is not verified/.test(message)) {
    return 'sender_domain_not_verified';
  }
  if (message.startsWith('API key is invalid')) return 'api_key_rejected';
  if (message.startsWith('Invalid `to` field')) return 'recipient_invalid';
  if (message.startsWith('Invalid `from` field')) return 'sender_invalid';
  return 'unclassified';
}

/**
 * Classifies a non-2xx answer from Resend's send endpoint. Pure: takes the
 * status and the (already bounded) body text, returns tokens only.
 *
 * Status first, because 429 and 5xx are the provider being busy or down, not
 * refusing this send. Then the error name and message prefix, because one
 * status and one name (`validation_error`) carry many different causes, and
 * the sandbox refusal has been reported as both 403 and 422.
 */
export function classifyResendFailure(
  status: number,
  bodyText: string,
  domains: { readonly senderDomain: string; readonly recipientDomain: string },
): MailerFailure {
  let name: string | undefined;
  let message = '';
  try {
    const parsed: unknown = JSON.parse(bodyText);
    if (typeof parsed === 'object' && parsed !== null) {
      const fields = parsed as Record<string, unknown>;
      if (typeof fields['name'] === 'string' && ERROR_NAME.test(fields['name'])) {
        name = fields['name'];
      }
      if (typeof fields['message'] === 'string') message = fields['message'];
    }
  } catch {
    // Not JSON: status only.
  }
  if (status >= 300 && status < 400) return redirectFailure(status, domains);
  const base = {
    httpStatus: status,
    ...(name === undefined ? {} : { providerErrorName: name }),
    ...domains,
  };
  if (status === 429) return { kind: 'unavailable', reason: 'quota_or_rate_limited', ...base };
  if (status >= 500) return { kind: 'unavailable', reason: 'provider_5xx', ...base };
  if (status >= 400) return { kind: 'rejected', reason: reasonFor(name, message), ...base };
  return { kind: 'unavailable', reason: 'unclassified', ...base };
}

/**
 * True for an answer the mailer must not act on as a send result: any 3xx, or
 * the opaque redirect a runtime may return under `redirect: 'manual'` (type
 * `opaqueredirect`, status 0). Reads only `status` and `type`, never `Location`
 * or any other header, and never throws.
 */
export function isRedirectResponse(response: {
  readonly status: number;
  readonly type?: string;
}): boolean {
  try {
    return response.type === 'opaqueredirect' || (response.status >= 300 && response.status < 400);
  } catch {
    return false; // a getter that throws is not a redirect we can name
  }
}

/**
 * The failure for a redirect answer. `unavailable`, not `rejected`: `rejected`
 * becomes `502 EMAIL_NOT_SENT`, whose page text tells the person to use a
 * different address, and a redirect from Resend's API has nothing to do with the
 * address; it is our setup or the provider. Retrying will not fix it, but the
 * person cannot either, so the plain `503` is the honest answer. `httpStatus` is
 * kept only for a real 3xx (an opaque redirect has status 0).
 */
export function redirectFailure(
  status: number,
  domains: { readonly senderDomain: string; readonly recipientDomain: string },
): MailerFailure {
  return {
    kind: 'unavailable',
    reason: 'unexpected_redirect',
    ...(status >= 300 && status < 400 ? { httpStatus: status } : {}),
    ...domains,
  };
}

/** One structured log line for a sink to write. Fields are the allowlist below, nothing else. */
export interface EmailSendFailedLog {
  readonly event: 'auth.email_send_failed';
  readonly provider: 'resend';
  readonly kind: MailerFailureKind;
  readonly reason: MailerFailureReason;
  readonly httpStatus?: number;
  readonly providerErrorName?: string;
  readonly fetchErrorName?: string;
  readonly fetchStage?: FetchStage;
  readonly elapsedMs?: number;
  readonly keyLength?: KeyLengthBucket;
  readonly keyHasNonPrintableAscii?: boolean;
  readonly keyHasInnerWhitespace?: boolean;
  readonly senderDomain: string;
  readonly recipientDomain: string;
  readonly environment: string;
  readonly rayId?: string;
}

export type AuthLogEntry = EmailSendFailedLog;
export type AuthLogger = (entry: AuthLogEntry) => void;

/** The Worker's sink: one JSON line on stderr, read with `wrangler tail` or Workers Logs. */
export const consoleLogger: AuthLogger = (entry) => {
  console.error(JSON.stringify(entry));
};

/** Builds the log entry from a `MailerError`, copying only allowlisted fields. */
export function emailSendFailedLog(
  error: MailerError,
  context: { readonly environment: string; readonly rayId: string | null },
): EmailSendFailedLog {
  return {
    event: 'auth.email_send_failed',
    provider: 'resend',
    kind: error.kind,
    reason: error.reason,
    ...(error.httpStatus === undefined ? {} : { httpStatus: error.httpStatus }),
    ...(error.providerErrorName === undefined
      ? {}
      : { providerErrorName: error.providerErrorName }),
    ...(error.fetchErrorName === undefined ? {} : { fetchErrorName: error.fetchErrorName }),
    // Each of these is re-checked against its closed set here, so a value that
    // is not one of the tokens (or not a boolean or a whole number) is dropped.
    ...(error.fetchStage !== undefined && FETCH_STAGES.has(error.fetchStage)
      ? { fetchStage: error.fetchStage }
      : {}),
    ...(Number.isInteger(error.elapsedMs) && error.elapsedMs! >= 0 && error.elapsedMs! % 100 === 0
      ? { elapsedMs: error.elapsedMs }
      : {}),
    ...(error.keyLength !== undefined && KEY_LENGTH_BUCKETS.has(error.keyLength)
      ? { keyLength: error.keyLength }
      : {}),
    ...(typeof error.keyHasNonPrintableAscii === 'boolean'
      ? { keyHasNonPrintableAscii: error.keyHasNonPrintableAscii }
      : {}),
    ...(typeof error.keyHasInnerWhitespace === 'boolean'
      ? { keyHasInnerWhitespace: error.keyHasInnerWhitespace }
      : {}),
    senderDomain: error.senderDomain,
    recipientDomain: error.recipientDomain,
    environment: context.environment,
    ...(context.rayId !== null && /^[0-9a-f]{8,32}(-[a-z]{3})?$/i.test(context.rayId)
      ? { rayId: context.rayId }
      : {}),
  };
}
