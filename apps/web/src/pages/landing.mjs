/**
 * `/` — the landing page.
 *
 * Composition, not decoration. Each of the three middle sections is one narrow
 * text column beside one large artefact, and the artefacts are the point: an
 * unretouched scan, a measured share of a bill, and a contract of ours that is
 * finished. The text beside each is a caption, three elements at most.
 *
 * One element on this page is larger than 40px — the 98%. A page that shouts on
 * every screen has no dominant element anywhere, which is the same defect as
 * having nothing to say. `scripts/check-design.mjs` asserts the count rather
 * than trusting this comment.
 *
 * B's expiry is read from `ops/crossing-schedule.json` through the build's
 * `knownEnds`, never typed here. An archived entry reports `liveUntilLedgerSeq`
 * 0, so the ledger it ended at is unreadable from a scan after the fact; the
 * schedule is the only place that still knows it.
 */
import { dateLong, esc, fmt } from './_shared.mjs';

const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';

export const meta = {
  title: 'Evergreen — Soroban contract rent, configured once',
  description:
    'Soroban contract state expires on a schedule nobody is watching. Evergreen reports what expires first, what it costs, and what fails with it.',
  active: '/',
  layout: 'site',
};

/** A narrow column of at most three things, beside an artefact that is large. */
function feature({ eyebrow, heading, body, link, artefact, flip = false }) {
  return `<section class="feature${flip ? ' flip' : ''}">
        <div class="site-wrap feature-grid">
          <div class="feature-text">
            <p class="eyebrow">${eyebrow}</p>
            <h2>${heading}</h2>
            ${body}
            ${link}
          </div>
          <div class="feature-art">${artefact}</div>
        </div>
      </section>`;
}

export function render(ctx) {
  const b = ctx.knownEnds[B];
  if (!b || typeof b.instance !== 'number' || typeof b.endsOn !== 'string') {
    throw new Error(
      "the landing states guinea-pig B's final ledger and date; ops/crossing-schedule.json no longer carries them",
    );
  }

  const hero = `<section class="hero">
        <div class="site-wrap">
          <p class="eyebrow">Stellar testnet · built by Apex</p>
          <h1>Your contract expires. You just don't know when.</h1>
          <p class="lead">
            One ledger entry can hold the compiled code for many contracts at once — and when it
            expires, all of them stop working together. Soroban state runs on a timer measured in
            ledgers, about five seconds each, and nothing tells you it is running out.
          </p>
          <p class="hero-actions">
            <a class="site-cta" href="/dashboard/">Open dashboard <span aria-hidden="true">→</span></a>
            <a class="site-more" href="https://github.com/Fatihmaull/evergreen">The code on GitHub <span aria-hidden="true">→</span></a>
          </p>
        </div>
      </section>`;

  const blastRadius = feature({
    eyebrow: 'The thesis',
    heading: 'One entry. Every contract built from that Wasm. They fail together.',
    body: `<p>
              Soroban keeps a contract's compiled code in a ledger entry of its own, and every
              contract deployed from that same code points at that one entry. So a contract's own
              state can be healthy until December while the code it runs expires in October — and
              without its code a contract cannot execute at all.
            </p>
            <p>
              The real expiry is therefore the earliest entry, which is rarely the obvious one. That
              is the failure this exists to catch: a fleet reported healthy right up until it stops
              together.
            </p>`,
    link: `<p><a class="site-more" href="/dashboard/blast-radius/">See it on our three contracts <span aria-hidden="true">→</span></a></p>`,
    artefact: `<div class="figure">
            <p class="figure-label">of the rent</p>
            <p class="figure-value">98%</p>
            <p class="figure-caption">
              is that one shared code entry — 8,116,648 of 8,264,289 stroops, across all four of
              guinea-pig A's entries. Scanning only its instance and code, the same entry is 99%:
              identical rent, different denominator. The scope travels with the number.
            </p>
          </div>`,
  });

  const capture = feature({
    flip: true,
    eyebrow: 'What the tool actually prints',
    heading: 'The honest parts are the persuasive parts',
    body: `<p>
              A real scan of guinea-pig A. It reports what it read, says that a single-contract scan
              cannot settle whether the code entry is shared, and says that storage it was not given
              keys for is unread.
            </p>`,
    link: `<p class="provenance">${ctx.capture.provenance}</p>`,
    artefact: `<div class="terminal">${esc(ctx.capture.text)}</div>`,
  });

  const death = feature({
    eyebrow: 'What it is for',
    heading: 'One of ours expired, and we watched it happen.',
    body: `<p>
              Guinea-pig B was calibrated once on 5 September and then left alone — no extension, no
              watch, nothing keeping it alive. It declined on schedule and its instance entry is
              archived. Its timeline stays up after the event, because a record of what happened is
              evidence and not a status display.
            </p>`,
    link: `<p><a class="site-more" href="/dashboard/decay/">The recorded decay, dot by dot <span aria-hidden="true">→</span></a></p>`,
    artefact: `<div class="ended">
            <p class="ended-label">guinea-pig B · instance</p>
            <p class="ended-word">expired</p>
            <dl class="ended-facts">
              <div><dt>on</dt><dd class="mono">${esc(dateLong(b.endsOn))}</dd></div>
              <div><dt>at ledger</dt><dd class="mono">${fmt(b.instance)}</dd></div>
            </dl>
          </div>`,
  });

  const kinds = `<section class="plain">
        <div class="site-wrap">
          <p class="eyebrow">The four kinds of entry</p>
          <h2>Three are recoverable. One is not.</h2>
          <p class="lead">
            The shared code entry above is one of four kinds, and they do not end the same way.
            Which kind an entry is decides whether running out is a bill or a burial.
          </p>
          <div class="kinds">
            <div class="kind">
              <p class="kind-name">instance</p>
              <p class="kind-holds">The contract's own state pointer.</p>
              <p><span class="chip warning"><span class="shape"></span>archived</span></p>
            </div>
            <div class="kind">
              <p class="kind-name">code</p>
              <p class="kind-holds">The compiled Wasm. Every contract built from it shares this one entry.</p>
              <p><span class="chip warning"><span class="shape"></span>archived</span></p>
            </div>
            <div class="kind">
              <p class="kind-name">persistent</p>
              <p class="kind-holds">Durable stored values.</p>
              <p><span class="chip warning"><span class="shape"></span>archived</span></p>
            </div>
            <div class="kind inverted">
              <p class="kind-name">temporary</p>
              <p class="kind-holds">Disposable stored values. Gone permanently, with no restore.</p>
              <p><span class="chip expired"><span class="shape"></span>deleted</span></p>
            </div>
          </div>
          <p class="note">
            Read from the network's own configuration: a temporary entry's minimum is 720 ledgers,
            about an hour. Our own temporary entry had 688 left when it was first sampled.
          </p>
        </div>
      </section>`;

  const how = `<section class="plain">
        <div class="site-wrap">
          <p class="eyebrow">How it works</p>
          <h2>Scan, watch, extend</h2>
          <div class="how">
            <div>
              <p class="how-name">Scan</p>
              <p>
                Read a contract's entries through Soroban RPC: what remains, what expires first,
                what it costs to keep alive, and whether the code entry is shared — or whether that
                cannot be determined.
              </p>
            </div>
            <div>
              <p class="how-name">Watch</p>
              <p>
                A scheduled job re-reads the entries you configure and alerts before they cross the
                thresholds: seven days for a warning, one day to act.
              </p>
            </div>
            <div>
              <p class="how-name">Extend</p>
              <p>
                Evergreen has no authority over your contract. Extending a TTL needs no permission
                from anyone — it is a property of the chain, not a promise from us. It can pay rent,
                and nothing else.
              </p>
            </div>
          </div>
        </div>
      </section>`;

  const closing = `<section class="closing">
        <div class="site-wrap">
          <h2>Make TTL something you configure once instead of remember.</h2>
          <p class="hero-actions">
            <a class="site-cta" href="/dashboard/">Open dashboard <span aria-hidden="true">→</span></a>
          </p>
        </div>
      </section>`;

  return [hero, blastRadius, capture, death, kinds, how, closing].join('\n');
}
