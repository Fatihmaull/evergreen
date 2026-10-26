/**
 * Formatting. Every number is pinned to one locale, because an unpinned
 * `toLocaleString()` renders 120,909 as 120.909 in German and changes the
 * digits entirely in Arabic — found and fixed once in the CLI, and the web
 * inherits the same hazard.
 */
import { EVIDENCE_LOCALE, formatCount, stroopsToXlm } from '../../../../packages/core/src/index';

export { formatCount };

const DATE = new Intl.DateTimeFormat(EVIDENCE_LOCALE, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'UTC',
});

const DATE_SHORT = new Intl.DateTimeFormat(EVIDENCE_LOCALE, {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'UTC',
});

/** Dates are estimates from an assumed cadence, so they always travel with `~`. */
export function approxDate(date: Date | undefined): string {
  return date ? `~${DATE.format(date)}` : '—';
}

export function approxDateShort(date: Date | undefined): string {
  return date ? `~${DATE_SHORT.format(date)}` : '—';
}

export function stamp(iso: string): string {
  return DATE_SHORT.format(new Date(iso));
}

/**
 * Two significant figures and the word "about", the rule the CLI's `cost.ts`
 * sets: simulated rent moved ~18% against a real fee recorded a day earlier, so
 * a four-decimal figure implies precision the method cannot support.
 *
 * TEMPORARY: this rounding lives in `packages/cli/src/cost.ts` and is not
 * exported. #195 moves it into core; delete this copy then.
 */
export function approxXlm(stroops: string): string {
  const exact = Number(stroopsToXlm(stroops as `${bigint}`));
  if (!Number.isFinite(exact) || exact === 0) return 'about 0 XLM';
  const magnitude = Math.floor(Math.log10(Math.abs(exact)));
  const factor = 10 ** (magnitude - 1);
  const rounded = Math.round(exact / factor) * factor;
  return `about ${rounded.toFixed(Math.max(0, 1 - magnitude))} XLM`;
}

/** Middle truncation: the tail is what tells two contract IDs apart. */
export function short(value: string, head = 6, tail = 6): string {
  return value.length <= head + tail + 1 ? value : `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function esc(value: unknown): string {
  return String(value).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );
}

/**
 * EXACT, for a signing screen — never `approxXlm` there.
 *
 * `approxXlm` rounds on purpose because it formats ESTIMATED rent. An
 * allowance cap is not an estimate: the user signs an exact number of stroops,
 * and Freighter shows that number raw and unlabelled (#320). So a signing
 * screen shows both, unrounded, from the same integer (Fatih, decision 4 on
 * #327; Rakha agreed there). Two formatters, because they answer two different
 * questions; folding them into one with a flag is how the rounding would reach
 * a signature.
 *
 * Refuses anything that is not a non-negative whole number of stroops rather
 * than formatting it: a cap the page cannot state exactly is not one it should
 * ask anyone to sign.
 */
export function exactXlm(stroops: string | bigint): { xlm: string; stroops: string } {
  const text = typeof stroops === 'bigint' ? stroops.toString() : stroops;
  if (!/^\d+$/.test(text)) {
    throw new RangeError(`exactXlm: "${text}" is not a non-negative whole number of stroops`);
  }
  return {
    xlm: `${stroopsToXlm(text as `${bigint}`)} XLM`,
    stroops: `${formatCount(BigInt(text))} ${text === '1' ? 'stroop' : 'stroops'}`,
  };
}
