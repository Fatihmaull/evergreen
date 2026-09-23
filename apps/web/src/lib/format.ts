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
