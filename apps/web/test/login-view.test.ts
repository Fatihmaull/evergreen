/**
 * PH2-E3-01: the sentences /login/ shows for the answers `docs/API.md` §9a
 * writes copy for, and the countdown that locks "Email me a code" for a
 * server-given `Retry-After`. No DOM, no network.
 */
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { API_ERROR_CODES } from '../src/lib/api';
import {
  CANNOT_TELL_TEXT,
  EMAIL_NOT_SENT_TEXT,
  NOT_SENT_TEXT,
  RATE_LIMITED_FALLBACK_TEXT,
  WRONG_CODE_TEXT,
  createCountdown,
  isCountdownSeconds,
  minutesLeft,
  rateLimitText,
  sentText,
  setCodeFormVisible,
} from '../src/lib/login-view';

describe('the sentences, locked word for word', () => {
  test('wrong code', () => {
    expect(WRONG_CODE_TEXT).toBe(
      'That code did not work. It may be wrong, used or expired. Ask for a new one.',
    );
  });

  test('502 EMAIL_NOT_SENT', () => {
    expect(EMAIL_NOT_SENT_TEXT).toBe(
      'The code could not be sent to that address. Nothing was sent. Trying again will not help; use a different address.',
    );
  });

  test('503 not sent', () => {
    expect(NOT_SENT_TEXT).toBe('The service could not send the code, nothing was sent.');
  });

  test('rate limit, with and without a usable Retry-After', () => {
    expect(rateLimitText(120)).toBe('Too many codes asked for. Try again in 2 min.');
    expect(RATE_LIMITED_FALLBACK_TEXT).toBe('Too many codes asked for. Wait, then try again.');
    expect(rateLimitText(undefined)).toBe(RATE_LIMITED_FALLBACK_TEXT);
  });

  test('the "on its way" note says "can receive mail", and claims no account fact', () => {
    expect(sentText('a@example.com')).toBe(
      'If <strong>a@example.com</strong> can receive mail, a code is on its way. The answer is the same whether or not an account exists.',
    );
  });

  test('the undetermined line claims no deploy state', () => {
    expect(CANNOT_TELL_TEXT).toBe('This page cannot tell from that.');
  });

  test('no failure sentence names a provider, a sandbox, a sender or a person, or claims a cause', () => {
    for (const text of [NOT_SENT_TEXT, EMAIL_NOT_SENT_TEXT, RATE_LIMITED_FALLBACK_TEXT]) {
      expect(text).not.toMatch(/resend|sandbox|sender|onboarding|owner|tih|deploy|key|secret/i);
    }
    expect(NOT_SENT_TEXT).toMatch(/nothing was sent/);
    expect(EMAIL_NOT_SENT_TEXT).toMatch(/Nothing was sent/);
    expect(NOT_SENT_TEXT).not.toMatch(/is on its way/);
    expect(EMAIL_NOT_SENT_TEXT).not.toMatch(/is on its way/);
  });
});

describe('minutes: "1 min" and "N min", never "mins"', () => {
  test.each([
    [1, 1],
    [59, 1],
    [60, 1],
    [61, 2],
    [120, 2],
    [121, 3],
    [900, 15],
  ])('%i s is %i min', (seconds, mins) => {
    expect(minutesLeft(seconds)).toBe(mins);
    expect(rateLimitText(seconds)).toBe(`Too many codes asked for. Try again in ${mins} min.`);
  });

  test.each([undefined, 0, -5, Number.NaN, Number.POSITIVE_INFINITY])(
    '%s is not a countdown: the fallback sentence, no number',
    (seconds) => {
      expect(isCountdownSeconds(seconds)).toBe(false);
      expect(rateLimitText(seconds)).toBe(RATE_LIMITED_FALLBACK_TEXT);
    },
  );
});

describe('docs/API.md §9a quotes the same sentences', () => {
  const docs = readFileSync(
    fileURLToPath(new URL('../../../docs/API.md', import.meta.url)),
    'utf8',
  );

  test('wrong code', () => {
    expect(docs).toContain(`"${WRONG_CODE_TEXT}"`);
  });

  test('rate limit, in its "N min" form', () => {
    expect(docs).toContain(`"${rateLimitText(7 * 60).replace(' 7 ', ' N ')}"`);
  });

  test('EMAIL_NOT_SENT', () => {
    expect(docs).toContain(`"${EMAIL_NOT_SENT_TEXT}"`);
  });

  test('every code the client knows is named in the spec', () => {
    for (const code of API_ERROR_CODES) expect(docs).toContain(`\`${code}\``);
  });
});

describe('the countdown, on a fake clock', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const fakeClock = {
    now: () => Date.now(),
    setInterval: (fn: () => void, ms: number) => setInterval(fn, ms),
    clearInterval: (id: unknown) => clearInterval(id as ReturnType<typeof setInterval>),
  };

  test('ticks once a second with the seconds left, then finishes once at 0', () => {
    const ticks: number[] = [];
    const done = vi.fn();
    createCountdown(3, { onTick: (n) => ticks.push(n), onDone: done }, fakeClock);
    vi.advanceTimersByTime(999);
    expect(ticks).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(ticks).toEqual([2]);
    vi.advanceTimersByTime(1000);
    expect(ticks).toEqual([2, 1]);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(10_000);
    expect(done).toHaveBeenCalledTimes(1);
    expect(ticks).toEqual([2, 1]);
  });

  test('works with the real clock default, not only an injected one', () => {
    const done = vi.fn();
    createCountdown(2, { onTick: () => {}, onDone: done });
    vi.advanceTimersByTime(1999);
    expect(done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  test('a throttled tab that wakes late ends on the deadline, not after N more ticks', () => {
    const done = vi.fn();
    createCountdown(60, { onTick: () => {}, onDone: done }, fakeClock);
    vi.setSystemTime(Date.now() + 61_000);
    vi.advanceTimersByTime(1000);
    expect(done).toHaveBeenCalledTimes(1);
  });

  test('cancelling stops the ticks and never calls onDone', () => {
    const onTick = vi.fn();
    const done = vi.fn();
    const cancel = createCountdown(5, { onTick, onDone: done }, fakeClock);
    vi.advanceTimersByTime(2000);
    cancel();
    const seen = onTick.mock.calls.length;
    vi.advanceTimersByTime(10_000);
    expect(onTick.mock.calls.length).toBe(seen);
    expect(done).not.toHaveBeenCalled();
  });

  test('the sentence a page would show counts down in whole minutes from the server number', () => {
    const shown: string[] = [];
    createCountdown(
      125,
      { onTick: (left) => shown.push(rateLimitText(left)), onDone: () => {} },
      fakeClock,
    );
    expect(rateLimitText(125)).toBe('Too many codes asked for. Try again in 3 min.');
    vi.advanceTimersByTime(5000);
    expect(shown.at(-1)).toBe('Too many codes asked for. Try again in 2 min.');
    vi.advanceTimersByTime(60_000);
    expect(shown.at(-1)).toBe('Too many codes asked for. Try again in 1 min.');
  });
});

describe('the code form', () => {
  test('is shown while a code is awaited and hidden once signed in, against the `.stack > *` display rule', () => {
    const form = { hidden: true, style: { display: 'none' } };
    setCodeFormVisible(form, true);
    expect(form).toEqual({ hidden: false, style: { display: '' } });
    setCodeFormVisible(form, false);
    expect(form).toEqual({ hidden: true, style: { display: 'none' } });
  });
});
