/**
 * /dashboard/contracts/ — our contracts. What each of A, B and C is for, its
 * health graded by core from the committed snapshot, its binding entry and
 * date. No registration, no policy column, no payer pool, no actions.
 */
import { approxDate, dateLong, esc, fmt, futureEnd, CONTRACTS } from './_shared.mjs';

export const meta = {
  title: 'Our contracts — Evergreen',
  description:
    'The three testnet contracts this project runs against: what each is for, its health, and the entry that binds it.',
  active: '/dashboard/contracts/',
  eyebrow: 'Our contracts · three, for three different reasons',
  heading: 'The contracts this project runs against',
  lead: 'A is the working subject, B is the control left to decay, C is the backup proof. All three were built from one Wasm, so one code entry binds them all — and touching it touches both proofs, which is why a write guard refused it by key while the two decay proofs were running.',
  script: null,
};

const KIND_WORD = { instance: 'contract instance', code: 'contract code' };

/**
 * The ledger an expired entry actually ended at, from `ops/crossing-schedule.json`.
 * The chain cannot answer it any more: an archived entry reads
 * `liveUntilLedgerSeq 0`. Absent a committed measurement, say so.
 */
function knownEnd(ctx, contractId, kind) {
  const known = ctx.knownEnds?.[contractId];
  const ledger = kind === 'instance' ? known?.instance : known?.persistent;
  if (typeof ledger !== 'number') {
    return `<dt>ended at</dt><dd>no longer readable from a scan</dd>`;
  }
  return `<dt>ended at</dt><dd>ledger <span class="mono">${fmt(ledger)}</span>${known.endsOn ? ` · ~${esc(dateLong(known.endsOn))}` : ''}</dd>`;
}

export function render(ctx) {
  /**
   * The shared code entry's end, once, from the snapshot. Every page that
   * states it reads it; none of them types it. See `futureEnd`.
   */
  const sharedCode = futureEnd(
    ctx.sharedCodeEnd.ledger,
    ctx.sharedCodeEnd.observedAtLedger,
    'the shared code entry',
  );

  const cards = CONTRACTS.map((c) => {
    const g = ctx.grades.grades[c.id];
    if (g === undefined) throw new Error(`contracts page: no grade for ${c.id}`);
    const b = g.binding;
    // Per grade, not top level. Reading it from the top level rendered "ledger
    // NaN" on this page for four days, because nothing asserted it resolved.
    const at = g.observedAtLedger;
    if (typeof at !== 'number') throw new Error(`contracts page: no observedAtLedger for ${c.id}`);
    /**
     * Both dates come from `ops/crossing-schedule.json` via `knownEnds`, which
     * is where they were measured. They used to be parsed out of
     * `packages/core/src/write-guard.ts`, a file that is being deleted
     * (PH2-E0-06) — and reading an expiry date out of a guard's source meant
     * the page lost its dates the moment the guard did, which is not a
     * relationship those two things should have had.
     */
    const ends = ctx.knownEnds[c.id] ?? {};
    const guard =
      c.label === 'guinea-pig B'
        ? `<p class="small">Alert threshold ${esc(dateLong(ends.crossesOn))} · <strong>expired ${esc(dateLong(ends.endsOn))}</strong> at ledger <span class="mono">${fmt(ends.instance)}</span>. It was left alone on purpose, and that is the proof.</p>`
        : c.label === 'guinea-pig C'
          ? `<p class="small">Alert threshold ${esc(dateLong(ends.crossesOn))} · <strong>expired ${esc(dateLong(ends.endsOn))}</strong> at ledger <span class="mono">${fmt(ends.instance)}</span>. That expiry was the unrepeatable event.</p>`
          : (() => {
              // Read, never typed. This number was the literal `5290829` here
              // and in three other places; the entry was extended on
              // 2026-10-14 and the page kept announcing the old one.
              const end = futureEnd(
                ctx.sharedCodeEnd.ledger,
                ctx.sharedCodeEnd.observedAtLedger,
                "guinea-pig A's shared code entry",
              );
              return `<p class="small">Extended by hand on 9 September past the sprint, then twice more — see <a href="/dashboard/history/">the extension history</a>. Its code entry still binds it: <strong>${esc(approxDate(end, at, ctx.snapshotCapturedAt).slice(1))}</strong> at ledger <span class="mono">${fmt(end)}</span>, shared with B and C.</p>`;
            })();
    return `<article class="card card-pad stack">
      <div class="row"><span class="name">${esc(c.label)}</span><span class="chip ${g.worst}"><span class="shape"></span>${esc(g.worst)}</span></div>
      <div class="id mono">${esc(c.id)}</div>
      <p class="muted">${esc(c.role)}</p>
      <dl class="facts">
        <dt>binds</dt><dd>${esc(KIND_WORD[b.kind] ?? b.kind)}</dd>
        ${
          b.isExpired
            ? `<dt>state</dt><dd class="expired-cell">${b.endBehavior === 'deleted' ? 'deleted' : 'archived'}</dd>
               ${knownEnd(ctx, c.id, b.kind)}
               <dt>read at</dt><dd>ledger <span class="mono">${fmt(b.observedAtLedger)}</span></dd>`
            : `<dt>remaining</dt><dd>${fmt(b.remaining)} ledgers</dd>
               <dt>expires</dt><dd>${esc(approxDate(b.endsAt, at, ctx.snapshotCapturedAt))} · ledger <span class="mono">${fmt(b.endsAt)}</span></dd>`
        }
      </dl>
      ${b.isExpired ? `<p class="small">${esc(b.reason)}</p>` : ''}
      ${guard}
    </article>`;
  }).join('');

  return `<section>
    <p class="small muted">Health graded by core from the snapshot committed with this build: as of ledger ${fmt(ctx.snapshotLedger)}. Not current — <a href="/dashboard/">the overview</a> reads the chain live.</p>
    <div class="contract-grid">${cards}</div>
  </section>
  <section class="card card-pad stack">
    <h2 class="section">The shared code entry</h2>
    <p class="muted">
      Key <span class="mono">AAAAB8flXwrYnvsGALwVBIsVUJn6TZfO4WRm+hJEs9y86Yv7</span>, from Wasm hash
      <span class="mono">c7e55f0a…98bfb</span>. Ends at ledger <span class="mono">${fmt(sharedCode)}</span>,
      ${esc(approxDate(sharedCode, ctx.snapshotLedger, ctx.snapshotCapturedAt))} — read from the scan captured
      ${esc(dateLong(ctx.snapshotCapturedAt.slice(0, 10)))}, not typed into this page. A scan of one contract reports it with one
      consumer, because the chain does not index reverse dependencies — <a href="/dashboard/blast-radius/">scan
      all three together</a> to see the real number.
    </p>
  </section>`;
}
