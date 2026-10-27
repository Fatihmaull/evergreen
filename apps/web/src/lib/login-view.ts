/**
 * /login/'s sentences and its two small behaviours, kept out of the page so a
 * test can hold them (PH2-E3-01).
 *
 * The sentences here are the ones `docs/API.md` §9a quotes for `CODE_INVALID`,
 * `RATE_LIMITED` and `EMAIL_NOT_SENT`. `test/login-view.test.ts` fails if the
 * page and the spec drift apart.
 *
 * Pure: no DOM lookups, no storage, no fetch. The timer functions are
 * injectable so a fake clock can drive the countdown.
 */

/** `CODE_INVALID`: one message for wrong, used and expired (§4, §9a). */
export const WRONG_CODE_TEXT =
  'That code did not work. It may be wrong, used or expired. Ask for a new one.';

/**
 * `502 EMAIL_NOT_SENT`, §9a. It says nothing was sent and that trying again
 * will not help. It names no cause, no provider and no setting.
 */
export const EMAIL_NOT_SENT_TEXT =
  'The code could not be sent to that address. Nothing was sent. Trying again will not help; use a different address.';

/** `503 UPSTREAM_UNAVAILABLE` on `POST /auth/email/start`. The detail line follows it. */
export const NOT_SENT_TEXT = 'The service could not send the code, nothing was sent.';

/** The line under an `undetermined` panel: what was received, and why that is not an answer. */
export const CANNOT_TELL_TEXT = 'This page cannot tell from that.';

/** No usable `Retry-After`: the page cannot say how long, so it does not count down. */
export const RATE_LIMITED_FALLBACK_TEXT = 'Too many codes asked for. Wait, then try again.';

/** A `Retry-After` the page may count down from: a finite number of seconds above zero. */
export function isCountdownSeconds(seconds: number | undefined): seconds is number {
  return typeof seconds === 'number' && Number.isFinite(seconds) && seconds > 0;
}

/** Whole minutes left, rounded up, never below 1: "1 min" until the last second, then "N min". */
export function minutesLeft(seconds: number): number {
  return Math.max(1, Math.ceil(seconds / 60));
}

/** `RATE_LIMITED` on `POST /auth/email/start`, §9a. "min" does not take an "s". */
export function rateLimitText(retryAfterSeconds: number | undefined): string {
  return isCountdownSeconds(retryAfterSeconds)
    ? `Too many codes asked for. Try again in ${minutesLeft(retryAfterSeconds)} min.`
    : RATE_LIMITED_FALLBACK_TEXT;
}

/** The note after a 202. `email` must already be escaped by the caller. */
export function sentText(escapedEmail: string): string {
  return `If <strong>${escapedEmail}</strong> can receive mail, a code is on its way. The answer is the same whether or not an account exists.`;
}

export interface CountdownClock {
  readonly now: () => number;
  readonly setInterval: (fn: () => void, ms: number) => unknown;
  readonly clearInterval: (id: unknown) => void;
}

const REAL_CLOCK: CountdownClock = {
  now: () => Date.now(),
  setInterval: (fn, ms) => setInterval(fn, ms),
  clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
};

/**
 * Counts down from `seconds`, once a second, against the clock rather than by
 * counting ticks, so a throttled background tab still ends on time. `onTick`
 * gets the whole seconds left (always above 0); `onDone` runs once, at 0.
 * Returns a function that cancels it without calling `onDone`.
 */
export function createCountdown(
  seconds: number,
  handlers: { readonly onTick: (secondsLeft: number) => void; readonly onDone: () => void },
  clock: CountdownClock = REAL_CLOCK,
): () => void {
  const deadline = clock.now() + seconds * 1000;
  let live = true;
  const stop = (): void => {
    live = false;
    clock.clearInterval(id);
  };
  const id = clock.setInterval(() => {
    if (!live) return;
    const left = Math.ceil((deadline - clock.now()) / 1000);
    if (left <= 0) {
      stop();
      handlers.onDone();
    } else {
      handlers.onTick(left);
    }
  }, 1000);
  return stop;
}

/** The code form's visibility: shown while a code is awaited, hidden once signed in. */
export function setCodeFormVisible(
  form: { hidden: boolean; style: { display: string } },
  visible: boolean,
): void {
  form.hidden = !visible;
  // `.stack > *` sets display, which beats the `hidden` attribute.
  form.style.display = visible ? '' : 'none';
}
