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
  | 'unclassified';

export interface MailerFailure {
  readonly kind: MailerFailureKind;
  readonly reason: MailerFailureReason;
  readonly httpStatus?: number;
  /** Resend's error `name`, only if it is a short `lower_snake` token. */
  readonly providerErrorName?: string;
  /** Domain part only, `unknown` if it did not parse. Never the local part. */
  readonly senderDomain: string;
  readonly recipientDomain: string;
}

export class MailerError extends Error implements MailerFailure {
  readonly kind: MailerFailureKind;
  readonly reason: MailerFailureReason;
  readonly httpStatus?: number;
  readonly providerErrorName?: string;
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
  }
}

/** How much of a provider error body is read. The rest is dropped unread. */
export const MAX_ERROR_BODY_BYTES = 2048;

const ERROR_NAME = /^[a-z_]{1,64}$/;
const DOMAIN = /@([a-z0-9.-]{1,253})>?\s*$/i;

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

/** One structured log line for a sink to write. Fields are the allowlist below, nothing else. */
export interface EmailSendFailedLog {
  readonly event: 'auth.email_send_failed';
  readonly provider: 'resend';
  readonly kind: MailerFailureKind;
  readonly reason: MailerFailureReason;
  readonly httpStatus?: number;
  readonly providerErrorName?: string;
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
    senderDomain: error.senderDomain,
    recipientDomain: error.recipientDomain,
    environment: context.environment,
    ...(context.rayId !== null && /^[0-9a-f]{8,32}(-[a-z]{3})?$/i.test(context.rayId)
      ? { rayId: context.rayId }
      : {}),
  };
}
