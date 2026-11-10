/**
 * What a failed operator-alert send (F9, F10, F11) is allowed to look like in
 * Workers Logs. The provider body and the thrown message are never kept:
 * Resend's text can embed an address, and a fetch error can embed the key or
 * the URL. The line is `action: 'send_failed'` plus, at most, our own status
 * or a closed error name.
 */
import { safeFetchErrorName } from '../auth/mailer-error.js';

export type OperatorCheckEvent =
  'alerts.f9_slow_tick' | 'alerts.f10_testnet_reset' | 'alerts.f11_heartbeat';

/**
 * The message `resendOperatorTransport` throws on a non-OK answer. Status
 * digits only; anything else is not logged, because it is not our text.
 */
const SEND_FAILED_STATUS = /^operator alert send failed: ([1-9][0-9]{2})$/;

export interface OperatorSendFailedLog {
  readonly event: OperatorCheckEvent;
  readonly action: 'send_failed';
  readonly httpStatus?: number;
  readonly errorName?: string;
}

/** Closed fields only. Never throws, and never copies `message` or `stack`. */
export function operatorSendFailedLog(
  event: OperatorCheckEvent,
  thrown: unknown,
): OperatorSendFailedLog {
  const httpStatus = httpStatusOf(thrown);
  const errorName = httpStatus === undefined ? safeFetchErrorName(thrown) : undefined;
  return {
    event,
    action: 'send_failed',
    ...(httpStatus === undefined ? {} : { httpStatus }),
    ...(errorName === undefined ? {} : { errorName }),
  };
}

function httpStatusOf(thrown: unknown): number | undefined {
  if (typeof thrown !== 'object' || thrown === null) return undefined;
  let message: unknown;
  try {
    message = (thrown as { message?: unknown }).message;
  } catch {
    return undefined;
  }
  if (typeof message !== 'string') return undefined;
  const match = SEND_FAILED_STATUS.exec(message);
  if (!match) return undefined;
  const status = Number(match[1]);
  return status >= 100 && status <= 599 ? status : undefined;
}
