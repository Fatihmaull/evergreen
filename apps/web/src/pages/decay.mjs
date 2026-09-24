/**
 * /dashboard/decay/ — three panels of recorded evidence: B's instance (the
 * control) first, then A's instance, then the code entry all three share.
 *
 * Dots at real observations; a solid segment only where the record shows
 * nothing was extended in between; a dashed segment only from the last
 * observation to a known expiry ledger; nothing past an expiry. The build
 * validates every one of those claims and fails when the data breaks them.
 */
import { esc, explorerTx, fmt } from './_shared.mjs';

const WARN = 120960;
const CRIT = 17280;

export const meta = {
  title: 'TTL decay — Evergreen',
  description:
    'Recorded remaining-TTL observations for our three testnet subjects: the control that decays, the contract that was extended, and the shared code entry. Every point cites its evidence.',
  active: '/dashboard/decay/',
  eyebrow: 'TTL decay · recorded evidence, not a simulation',
  heading: 'One chart, both halves of the claim',
  lead: 'The thing left alone declines; the thing watched over steps back up. Every dot is a committed observation — irregularly spaced, because that is when the readings happened. B’s expiry marker stays after the event: the timeline is evidence, not a status display.',
  script: null,
};

export function validate(series) {
  for (const s of series) {
    if (s.observations.length === 0) throw new Error(`decay: ${s.id} has no observations`);
    let current = null;
    for (const o of s.observations) {
      if (o.endsAt - o.ledger < 0)
        throw new Error(`decay: ${s.id} observes an already-expired entry`);
      if (!o.source) throw new Error(`decay: ${s.id} has an observation without a source`);
      current = current === null ? o.endsAt : current;
    }
    const ordered = [...s.steps].sort((a, b) => a.atLedger - b.atLedger);
    for (const step of ordered) {
      if (step.before !== current) {
        throw new Error(
          `decay: ${s.id} step at ledger ${step.atLedger} starts at ${step.before} but the record stands at ${current} — something extended in between that is not in the data`,
        );
      }
      if (step.after <= step.before) throw new Error(`decay: ${s.id} step does not go up`);
      if (!/^[0-9a-f]{64}$/.test(step.hash))
        throw new Error(`decay: ${s.id} step has no real transaction hash`);
      current = step.after;
    }
    const last = s.observations[s.observations.length - 1];
    if (last.endsAt !== current) {
      throw new Error(
        `decay: ${s.id} last observation ends at ${last.endsAt} but the steps leave ${current}`,
      );
    }
    if (s.expiryLedger !== null && s.expiryLedger < last.ledger) {
      throw new Error(`decay: ${s.id} expiry is before its last observation`);
    }
  }
}

/**
 * An expiry is one of three things, and the chart must not conflate them.
 *
 *   observed   — the watch completed and the event was captured.
 *   upcoming   — the date has not arrived yet.
 *   unobserved — the date passed and nothing captured it.
 *
 * Derived, never flagged by hand: `ops/crossing-schedule.json` records whether
 * each watch is complete, and the date says whether it is still ahead. So the
 * panel tells the truth on Saturday, on Sunday and on Monday without anyone
 * remembering to change it — and if guinea-pig C's capture does not happen,
 * the page says so by itself rather than simply stopping.
 *
 * A series that stops with no explanation reads as a chart that ran out of
 * data. SOW §6.2 is graded by one person with minimal technical expertise, and
 * to that reader unfinished and unexplained look identical.
 */
function expiryState(series, knownEnds, now) {
  const known = knownEnds?.[series.contract];
  if (known?.status === 'complete') return 'observed';
  const endsOn = known?.endsOn ?? series.expiryApprox;
  return Date.parse(`${endsOn}T23:59:59Z`) < now.getTime() ? 'unobserved' : 'upcoming';
}

function panel(s, state, crossesOn) {
  const W = 940;
  const H = 300;
  const PAD = { l: 92, r: 24, t: 26, b: 44 };
  // Path in (ledger, remaining) space: observations interleaved with steps.
  const ordered = [...s.steps].sort((a, b) => a.atLedger - b.atLedger);

  // EVERY observation is a point, not just the first and the last. This drew
  // only the endpoints until 2026-09-23, which was invisible while each series
  // had two readings and wrong the moment B's crossing watch added four more:
  // a straight line between endpoints is a drawing of an average, and the
  // caption underneath calls each dot a committed observation.
  const pts = [
    ...s.observations.map((o) => ({
      ledger: o.ledger,
      remaining: o.endsAt - o.ledger,
      dot: true,
      order: 1,
    })),
    ...ordered.flatMap((step) => [
      {
        ledger: step.atLedger,
        remaining: step.before - step.atLedger,
        corner: true,
        step,
        order: 0,
      },
      {
        ledger: step.atLedger,
        remaining: step.after - step.atLedger,
        corner: true,
        stepped: step,
        order: 2,
      },
    ]),
  ].sort((a, b) => a.ledger - b.ledger || a.order - b.order);
  const last = s.observations[s.observations.length - 1];

  const xMax = s.expiryLedger ?? last.ledger;
  const xMin = Math.min(s.observations[0].ledger, ...ordered.map((t) => t.atLedger));
  const yMax = Math.max(...pts.map((p) => p.remaining)) * 1.12;
  const X = (l) => PAD.l + ((l - xMin) / (xMax - xMin)) * (W - PAD.l - PAD.r);
  const Y = (r) => H - PAD.b - (r / yMax) * (H - PAD.t - PAD.b);

  const solid = pts
    .map((p, i) => `${i === 0 ? 'M' : 'L'}${X(p.ledger).toFixed(1)} ${Y(p.remaining).toFixed(1)}`)
    .join(' ');
  const dashed =
    s.expiryLedger !== null
      ? `<line class="decay-dash" x1="${X(last.ledger)}" y1="${Y(last.endsAt - last.ledger)}" x2="${X(s.expiryLedger)}" y2="${Y(0)}" />`
      : '';

  const bands = [WARN, CRIT]
    .filter((t) => t < yMax)
    .map(
      (t) =>
        `<line class="decay-band" x1="${PAD.l}" y1="${Y(t)}" x2="${W - PAD.r}" y2="${Y(t)}" />` +
        `<text class="decay-band-label" x="${W - PAD.r}" y="${Y(t) - 5}" text-anchor="end">${t === WARN ? 'warning 120,960' : 'act 17,280'}</text>`,
    )
    .join('');

  const dotted = pts.filter((p) => p.dot);
  /**
   * The caption under this chart says every dot is a committed observation.
   * That is a CLAIM, and the rendering has to support it.
   *
   * This plotted only the first and last observation until 2026-09-23 —
   * invisible while each series had two readings, and wrong the moment the
   * crossing watch added four more, because a straight line between endpoints
   * is a drawing of an average. Counting once does not survive guinea-pig C's
   * readings landing, so the count is asserted rather than checked by hand.
   */
  if (dotted.length !== s.observations.length) {
    throw new Error(
      `decay: ${s.id} has ${s.observations.length} observation(s) but would draw ${dotted.length} dot(s) — ` +
        'the caption claims every dot is a recorded observation',
    );
  }
  const dots = dotted
    .map((p) => `<circle class="decay-dot" cx="${X(p.ledger)}" cy="${Y(p.remaining)}" r="4.5" />`)
    .join('');

  const stepMarks = ordered
    .map(
      (t) =>
        `<circle class="decay-step" cx="${X(t.atLedger)}" cy="${Y(t.after - t.atLedger)}" r="5.5" />` +
        `<text class="decay-step-label" x="${X(t.atLedger)}" y="${Y(t.after - t.atLedger) - 12}" text-anchor="middle">${esc(t.actor)} · <a href="${explorerTx(t.hash)}">${esc(t.hash.slice(0, 8))}…</a></text>`,
    )
    .join('');

  const MARKER = {
    observed: `expired ${esc(s.expiryApprox)} · ledger ${fmt(s.expiryLedger)}`,
    upcoming: `expires ~${esc(s.expiryApprox)} · ledger ${fmt(s.expiryLedger)} · not yet`,
    unobserved: `expiry ~${esc(s.expiryApprox)} · ledger ${fmt(s.expiryLedger)} · not observed`,
  };
  const expiryMark =
    s.expiryLedger !== null
      ? `<text class="decay-expiry ${state}" x="${X(s.expiryLedger)}" y="${H - 12}" text-anchor="end">${MARKER[state]}</text>`
      : '';

  const svg = `<div class="graph-wrap"><svg class="decay" viewBox="0 0 ${W} ${H}" role="img" aria-label="Remaining ledgers over time for ${esc(s.label)}. Dots are recorded observations; steps are real extensions.">
    ${bands}
    <path class="decay-line" d="${solid}" />
    ${dashed}${dots}${stepMarks}${expiryMark}
    <text class="decay-axis" x="${PAD.l}" y="${H - 12}">ledger ${fmt(xMin)}</text>
  </svg></div>`;

  const tableRows = [
    ...s.observations.map(
      (o) =>
        `<tr><td class="num">${fmt(o.ledger)}</td><td class="num">${fmt(o.endsAt - o.ledger)}</td><td>observed · <span class="mono">${esc(o.source)}</span></td></tr>`,
    ),
    ...ordered.map(
      (t) =>
        `<tr><td class="num">${fmt(t.atLedger)}</td><td class="num">${fmt(t.before - t.atLedger)} → ${fmt(t.after - t.atLedger)}</td><td>${esc(t.actor)} · <a class="mono" href="${explorerTx(t.hash)}">${esc(t.hash)}</a> · ${esc(t.note)} <span class="mono">${esc(t.source)}</span></td></tr>`,
    ),
  ].join('');

  return `<article class="card card-pad stack">
    <h3>${esc(s.label)}</h3>
    <p class="muted">${esc(s.role)}</p>
    ${svg}
    ${
      state === 'unobserved'
        ? `<p class="small caution"><strong>The expiry was not observed.</strong> ${esc(s.label.split(' · ')[0])} crossed its alert threshold${crossesOn ? ` on ${esc(crossesOn)}` : ''} and expired ~${esc(s.expiryApprox)} at ledger ${fmt(s.expiryLedger)}. Nothing captured the moment, so this series ends at its last recorded reading and the dashed segment is a projection rather than a measurement.</p>`
        : state === 'upcoming'
          ? `<p class="small muted">The dashed segment is a projection to a known expiry ledger, not a reading. Nothing has been recorded past the last dot.</p>`
          : ''
    }
    <p class="small muted">Each panel has its own vertical scale; the horizontal axis is always ledger numbers. Dates beside ledgers are estimates at five seconds per ledger.</p>
    <details>
      <summary>Every point behind this panel, with its source</summary>
      <div class="table-wrap"><table>
        <thead><tr><th scope="col">Ledger</th><th scope="col">Remaining</th><th scope="col">What happened</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table></div>
    </details>
  </article>`;
}

export function render(ctx, now = new Date()) {
  validate(ctx.decay.series);
  const panels = ctx.decay.series
    .map((s) =>
      panel(s, expiryState(s, ctx.knownEnds, now), ctx.knownEnds?.[s.contract]?.crossesOn),
    )
    .join('');
  return `<section class="stack">${panels}</section>
  <section>
    <h2 class="section">How to read this</h2>
    <p class="muted">
      A sawtooth is the product working: decay, then an extension, then decay again. A straight decline is
      the control: guinea-pig B was calibrated once on 5 September and left alone, so its two observations
      agree on one expiry — ledger 4,793,687, about 21 September 2026. A's steps each link to the transaction
      that made them; the second step's timing was arranged by raising the threshold, the response was not.
      The shared code entry binds all three contracts and expires about 20 October 2026 at ledger 5,290,829.
    </p>
  </section>`;
}
