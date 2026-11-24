/**
 * TTL decay, revamped (components.md § "Dashboard revamp", TTL decay), for the
 * user's own watched contracts.
 *
 * The API keeps one observation per watch item (`lastObservation`), not a
 * history, so every chart here has exactly one reading: a dot, and a dashed
 * projection from it to zero at the ledger it ends. There is never a solid
 * line, because a solid line claims readings that do not exist (DES,
 * 2026-11-24). An undetermined contract draws nothing; an archived one says
 * so in words. History arrives with PH2-E2-09 (observations).
 */
import { approxDateShort, esc, formatCount, short } from './format';
import { attentionFirst, ledgersLeft, stateChip } from './overview-view';
import { orderRows, type Row } from './watchlist-view';
import { DEFAULT_WARN_LEDGERS, SECONDS_PER_LEDGER } from '../../../../packages/core/src/index';

export const ONE_READING_CAPTION =
  'One reading so far. History is drawn once Evergreen keeps observations.';

const nameOf = (r: Row): string => r.item.label ?? short(r.item.contractId, 4, 4);

/** What one row can draw: a reading and the ledger it ends at, or nothing. */
export interface Reading {
  readonly left: number;
  readonly at: Date;
  readonly ends: Date;
  readonly observedAtLedger: number | undefined;
}

export function readingOf(r: Row, now = new Date()): Reading | undefined {
  const left = ledgersLeft(r);
  if (left === undefined || r.binding.state !== 'live') return undefined;
  const obs = r.item.lastObservation;
  const at = obs !== null && typeof obs.observedAt === 'string' ? new Date(obs.observedAt) : now;
  if (Number.isNaN(at.getTime())) return undefined;
  const ends = new Date(at.getTime() + left * SECONDS_PER_LEDGER * 1000);
  return { left, at, ends, observedAtLedger: r.binding.observedAtLedger };
}

/** The autopilot threshold, when autopilot is on and has one. */
function actBelow(r: Row): number | undefined {
  const a = r.item.autopilot;
  return a?.enabled === true && Number.isInteger(a.thresholdLedgers) && a.thresholdLedgers! > 0
    ? a.thresholdLedgers
    : undefined;
}

/**
 * The row charted large: `?c=` when it is watched; else the one needing
 * attention first if it has a reading to draw; else the first that has one.
 */
export function selectedRow(
  rows: readonly Row[],
  id: string | undefined,
  now = new Date(),
): Row | undefined {
  const asked = rows.find((r) => r.item.contractId === id);
  if (asked !== undefined) return asked;
  const first = attentionFirst(rows)?.row;
  if (first !== undefined && readingOf(first, now) !== undefined) return first;
  return orderRows(rows).find((r) => readingOf(r, now) !== undefined) ?? first;
}

const DAY = 86_400_000;
const DATE = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

function niceStep(max: number): number {
  const raw = max / 5;
  const mag = 10 ** Math.floor(Math.log10(raw));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * mag >= raw) return m * mag;
  return 10 * mag;
}

const compact = (n: number): string =>
  n >= 1_000_000
    ? `${+(n / 1_000_000).toFixed(1)}M`
    : n >= 1000
      ? `${Math.round(n / 1000)}k`
      : `${n}`;

/** The big chart for one row. */
export function bigChartHtml(r: Row, now = new Date()): string {
  const head = `<p class="label" id="sel-h">${esc(nameOf(r))}${
    r.binding.state === 'live' ? ` · binds on ${esc(r.binding.kind)}` : ''
  }</p>`;
  const reading = readingOf(r, now);
  if (reading === undefined) {
    const why =
      r.binding.state === 'expired'
        ? `It is ${esc(r.binding.word)}: restore it before it can be extended. There is nothing left to decay.`
        : esc(r.why ?? 'Its expiry could not be established, so there is nothing to draw.');
    return `<div class="chart-top"><div>${head}<p>${stateChip(r)}</p></div></div><p class="note">${why}</p>`;
  }
  const W = 1100;
  const H = 340;
  const L = 64;
  const R = 968;
  const T = 36;
  const B = 300;
  const threshold = actBelow(r);
  const yMax0 = Math.max(reading.left, DEFAULT_WARN_LEDGERS, threshold ?? 0) * 1.1;
  const step = niceStep(yMax0);
  const yMax = Math.ceil(yMax0 / step) * step;
  const t0 = reading.at.getTime();
  const t1 = Math.max(reading.ends.getTime(), t0 + DAY);
  const x = (t: number): number => L + ((t - t0) / (t1 - t0)) * (R - L);
  const y = (v: number): number => B - (v / yMax) * (B - T);

  const grid: string[] = [];
  for (let v = 0; v <= yMax + 1; v += step)
    grid.push(
      `<line class="grid" x1="${L}" x2="${R}" y1="${y(v).toFixed(1)}" y2="${y(v).toFixed(1)}"/><text class="t" x="${L - 10}" y="${(y(v) + 4).toFixed(1)}" text-anchor="end">${compact(v)}</text>`,
    );
  const span = t1 - t0;
  const tickEvery = Math.max(1, Math.round(span / DAY / 6)) * DAY;
  const ticks: string[] = [];
  for (let t = t0; t <= t1 + 1; t += tickEvery)
    ticks.push(
      `<text class="t" x="${x(t).toFixed(1)}" y="326" text-anchor="middle">${t === t0 ? '' : '~'}${DATE.format(new Date(t))}</text>`,
    );
  const bands: string[] = [];
  // Two band labels closer than a line of text: the warning label moves up.
  const warnLabelY =
    threshold !== undefined && Math.abs(y(DEFAULT_WARN_LEDGERS) - y(threshold)) < 14
      ? y(threshold) - 10
      : y(DEFAULT_WARN_LEDGERS) + 4;
  if (DEFAULT_WARN_LEDGERS < yMax)
    bands.push(
      `<line class="band warn-b" x1="${L}" x2="${R}" y1="${y(DEFAULT_WARN_LEDGERS).toFixed(1)}" y2="${y(DEFAULT_WARN_LEDGERS).toFixed(1)}"/><text class="t band-t" x="${R + 8}" y="${warnLabelY.toFixed(1)}">warning ${formatCount(DEFAULT_WARN_LEDGERS)}</text>`,
    );
  if (threshold !== undefined)
    bands.push(
      `<line class="band act-b" x1="${L}" x2="${R}" y1="${y(threshold).toFixed(1)}" y2="${y(threshold).toFixed(1)}"/><text class="t band-t" x="${R + 8}" y="${(y(threshold) + 4).toFixed(1)}">act below ${formatCount(threshold)}</text>`,
    );
  const nowX = Math.min(Math.max(x(now.getTime()), L), R);
  const readAt = `read${reading.observedAtLedger === undefined ? '' : ` · ledger ${formatCount(reading.observedAtLedger)}`}`;
  const svg = `<svg class="chart big" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(
    `${nameOf(r)}: one reading of ${formatCount(reading.left)} ledgers left, projected to zero ${approxDateShort(reading.ends)}.`,
  )}">
    ${grid.join('')}
    <rect class="future" x="${nowX.toFixed(1)}" y="${T}" width="${(R - nowX).toFixed(1)}" height="${B - T}"/>
    ${bands.join('')}
    ${ticks.join('')}
    <polyline class="proj" points="${x(t0).toFixed(1)},${y(reading.left).toFixed(1)} ${x(reading.ends.getTime()).toFixed(1)},${y(0).toFixed(1)}"/>
    <circle class="dot" cx="${x(t0).toFixed(1)}" cy="${y(reading.left).toFixed(1)}" r="4.5"/>
    <text class="t now-t" x="${(x(t0) + 10).toFixed(1)}" y="${(y(reading.left) - 10).toFixed(1)}">${esc(readAt)}</text>
  </svg>`;
  return `<div class="chart-top"><div>${head}<p><span class="sel-figure">${esc(formatCount(reading.left))}</span> <span class="sel-unit">ledgers left · ends ${esc(approxDateShort(reading.ends))}</span></p></div>
      <p class="legend"><span><i class="lg-dot"></i>reading</span><span><i class="lg-proj"></i>projection</span></p></div>
    <figure class="chart-wrap">${svg}<figcaption class="note">${ONE_READING_CAPTION} Dates are estimates from ledgers at ${SECONDS_PER_LEDGER} s each.</figcaption></figure>`;
}

/**
 * One strip per contract on a shared time axis, so where each line meets zero
 * can be compared; each row has its own vertical scale.
 */
export function stripsHtml(
  rows: readonly Row[],
  openId: string | undefined,
  now = new Date(),
): string {
  const ordered = orderRows(rows);
  const readings = ordered.map((r) => readingOf(r, now));
  const live = readings.filter((x): x is Reading => x !== undefined);
  const t0 = live.length === 0 ? now.getTime() : Math.min(...live.map((x) => x.at.getTime()));
  const t1 =
    live.length === 0 ? t0 + DAY : Math.max(t0 + DAY, ...live.map((x) => x.ends.getTime()));
  const W = 520;
  const sx = (t: number): number => 2 + ((t - t0) / (t1 - t0)) * (W - 4);
  return ordered
    .map((r, i) => {
      const reading = readings[i];
      const id = r.item.contractId;
      const open = id === openId ? ' open' : '';
      let cell: string;
      let num = '<span class="none">—</span>';
      let end = '<span class="none">—</span>';
      if (reading !== undefined) {
        const threshold = actBelow(r);
        const top = Math.max(reading.left, threshold ?? 0) * 1.1;
        const sy = (v: number): number => 40 - (v / top) * 36;
        const band =
          threshold === undefined
            ? ''
            : `<line class="band act-b" x1="0" x2="${W}" y1="${sy(threshold).toFixed(1)}" y2="${sy(threshold).toFixed(1)}" vector-effect="non-scaling-stroke"/>`;
        const x0 = sx(reading.at.getTime()).toFixed(1);
        const y0 = sy(reading.left).toFixed(1);
        cell = `<svg class="spark" viewBox="0 0 ${W} 44" preserveAspectRatio="none" aria-hidden="true">${band}
          <polyline class="proj" points="${x0},${y0} ${sx(reading.ends.getTime()).toFixed(1)},${sy(0).toFixed(1)}" vector-effect="non-scaling-stroke"/>
          <line class="pt" x1="${x0}" y1="${y0}" x2="${x0}" y2="${y0}" vector-effect="non-scaling-stroke"/></svg>`;
        num = esc(formatCount(reading.left));
        end = esc(approxDateShort(reading.ends));
      } else if (r.binding.state === 'expired') {
        cell = `<p class="note">${esc(r.binding.word)}: nothing left to decay.</p>`;
        end = esc(r.binding.word);
      } else {
        const why = (r.why ?? 'it could not be established').replace(/\.$/, '');
        cell = `<p class="note">No expiry to draw: ${esc(why.charAt(0).toLowerCase() + why.slice(1))}.</p>`;
      }
      return `<li class="strip${open}" data-open="${esc(id)}" tabindex="0" role="button" aria-label="${esc(`Chart ${nameOf(r)}`)}">
        <div class="name"><span>${esc(nameOf(r))}</span>${stateChip(r)}</div>
        <div class="spark-cell">${cell}</div>
        <p class="mono num-cell">${num}</p>
        <p class="end-cell">${end}</p>
      </li>`;
    })
    .join('');
}
