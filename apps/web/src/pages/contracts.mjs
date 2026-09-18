/**
 * /dashboard/contracts/ — our contracts. What each of A, B and C is for, its
 * health graded by core from the committed snapshot, its binding entry and
 * date. No registration, no policy column, no payer pool, no actions.
 */
import { approxDate, dateLong, esc, fmt, CONTRACTS } from './_shared.mjs';

export const meta = {
  title: 'Our contracts — Evergreen',
  description:
    'The three testnet contracts this project runs against: what each is for, its health, and the entry that binds it.',
  active: '/dashboard/contracts/',
  eyebrow: 'Our contracts · three, for three different reasons',
  heading: 'The contracts this project runs against',
  lead: 'A is the working subject, B is the control left to decay, C is the backup proof. All three were built from one Wasm, so one code entry binds them all — and touching it touches both proofs, which is why the write guard refuses it by key.',
  script: null,
};

const KIND_WORD = { instance: 'contract instance', code: 'contract code' };

export function render(ctx) {
  const at = ctx.grades.observedAtLedger;
  const cards = CONTRACTS.map((c) => {
    const g = ctx.grades.grades[c.id];
    const b = g.binding;
    const guard =
      c.label === 'guinea-pig B'
        ? `<p class="small">Alert threshold ${esc(dateLong(ctx.guard.bAlert))} · <strong>expires ${esc(dateLong(ctx.guard.bExpires))}</strong> at ledger <span class="mono">${fmt(4793687)}</span>. That expiry is the unrepeatable event.</p>`
        : c.label === 'guinea-pig C'
          ? `<p class="small">Alert threshold ${esc(dateLong(ctx.guard.cAlert))} · <strong>expires ${esc(dateLong(ctx.guard.cExpires))}</strong> at ledger <span class="mono">${fmt(4880097)}</span>.</p>`
          : `<p class="small">Extended by hand on 9 September past the sprint, then twice more — see <a href="/dashboard/history/">the extension history</a>. Its code entry still binds it: <strong>${esc(approxDate(5290829, at, ctx.snapshotCapturedAt).slice(1))}</strong> at ledger <span class="mono">${fmt(5290829)}</span>, shared with B and C.</p>`;
    return `<article class="card card-pad stack">
      <div class="row"><span class="name">${esc(c.label)}</span><span class="chip ${g.worst}"><span class="shape"></span>${esc(g.worst)}</span></div>
      <div class="id mono">${esc(c.id)}</div>
      <p class="muted">${esc(c.role)}</p>
      <dl class="facts">
        <dt>binds</dt><dd>${esc(KIND_WORD[b.kind] ?? b.kind)}</dd>
        <dt>remaining</dt><dd>${fmt(b.remaining)} ledgers</dd>
        <dt>expires</dt><dd>${esc(approxDate(b.endsAt, at, ctx.snapshotCapturedAt))} · ledger <span class="mono">${fmt(b.endsAt)}</span></dd>
      </dl>
      ${guard}
    </article>`;
  }).join('');

  return `<section>
    <p class="small muted">Health graded by core from the snapshot committed with this build: as of ledger ${fmt(at)}. Not current — <a href="/dashboard/">the overview</a> reads the chain live.</p>
    <div class="contract-grid">${cards}</div>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">The shared code entry</h2>
    <p class="muted">
      Key <span class="mono">AAAAB8flXwrYnvsGALwVBIsVUJn6TZfO4WRm+hJEs9y86Yv7</span>, from Wasm hash
      <span class="mono">c7e55f0a…98bfb</span>. Ends at ledger <span class="mono">${fmt(5290829)}</span>,
      ${esc(approxDate(5290829, at, ctx.snapshotCapturedAt))}. A scan of one contract reports it with one
      consumer, because the chain does not index reverse dependencies — <a href="/dashboard/blast-radius/">scan
      all three together</a> to see the real number. Due to be extended at W3-D18-02d, after the proofs are captured.
    </p>
  </section>`;
}
