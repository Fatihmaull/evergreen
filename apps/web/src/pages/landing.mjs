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
  navTone: 'dark',
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
  /**
   * The hero's artefact slot.
   *
   * A 28px headline is not a small headline — it is a caption for something
   * large directly beneath it. Take the artefact away and the result is not a
   * restrained hero, it is an empty one, and the page opens with nothing to
   * look at. This reserves the space at the right ratio so that dropping the
   * image in later changes nothing about the layout.
   *
   * Empty it is a hairline and nothing else: no placeholder text, no icon, no
   * dashed border, no shimmer. A slot that advertises its own emptiness is
   * worse than one that simply waits.
   *
   * To fill it, put the file at `apps/web/src/assets/hero.<ext>` with its
   * alternative text at `apps/web/src/assets/hero.txt`. The build finds it,
   * and refuses to build an image with no alternative text rather than ship
   * one the screen reader cannot describe.
   */
  const art = ctx.heroImage;
  const heroArt = !art
    ? ''
    : art.video
      ? /**
         * Muted, looping, inline, and with no controls: it is an artefact, not
         * a player. `preload="metadata"` plus the poster means the slot is
         * filled on first paint and the file downloads after, rather than the
         * page opening on an empty rectangle on a slow connection.
         */
        `<video class="hero-media" autoplay muted loop playsinline preload="metadata"
            poster="${esc(art.poster)}" aria-label="${esc(art.alt)}"
          >${
            art.small
              ? `<source src="${esc(art.small)}" type="video/mp4" media="(max-width: 700px)" />`
              : ''
          }<source src="${esc(art.src)}" type="video/mp4" /></video>`
      : `<img class="hero-media" src="${esc(art.src)}" alt="${esc(art.alt)}" />`;

  /**
   * Reduced motion is a setting a person chose, and a 20-second loop behind the
   * first thing they read is exactly what they turned off. CSS cannot stop an
   * autoplaying video, so this is the one script on the page — five lines, and
   * without it the video simply plays, which is what every visitor gets today.
   */
  const motionScript = art?.video
    ? `<script>
      (function () {
        var v = document.querySelector('.hero-media');
        if (!v || !window.matchMedia) return;
        // The media attribute on a source inside a video is in the spec, but
        // browsers do not agree on it, so it is a hint rather than the
        // mechanism. This is the mechanism: pick the narrow file before
        // playback when the browser settled on the wrong one. Without
        // JavaScript a phone downloads the full file, which works and is only
        // heavier.
        var small = v.querySelector('source[media]');
        if (small && window.matchMedia('(max-width: 700px)').matches && v.currentSrc.indexOf(small.src) === -1) {
          v.src = small.src;
          v.load();
        }
        var m = window.matchMedia('(prefers-reduced-motion: reduce)');
        var apply = function () { if (m.matches) { v.pause(); v.removeAttribute('loop'); } else { v.play().catch(function () {}); } };
        apply();
        m.addEventListener('change', apply);
      })();
    </script>`
    : '';

  const b = ctx.knownEnds[B];
  if (!b || typeof b.instance !== 'number' || typeof b.endsOn !== 'string') {
    throw new Error(
      "the landing states guinea-pig B's final ledger and date; ops/crossing-schedule.json no longer carries them",
    );
  }

  const hero = `<section class="hero">
        <div class="site-wrap">
          <h1>Your contract expires. You just don't know when.</h1>
          <p class="lead">
            Soroban state runs on a timer measured in ledgers, about five seconds each, and nothing
            tells you it is running out.
          </p>
          <p class="hero-actions">
            <a class="site-cta" href="/dashboard/">Open dashboard <span aria-hidden="true">→</span></a>
            <a class="site-more" href="https://github.com/Fatihmaull/evergreen">The code on GitHub <span aria-hidden="true">→</span></a>
          </p>
          <div class="hero-art">${heroArt}</div>
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
              The real expiry is therefore the earliest entry, which is rarely the obvious one, and
              it is shared by every contract built from the same Wasm. That is the failure this
              exists to catch: a fleet of contracts reported healthy right up until they stop
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

  /**
   * The closing call to action.
   *
   * The command is the README's quickstart, verbatim, and it is runnable: it
   * scans guinea-pig A on testnet and needs no key, no account and no install.
   * It can be shown at all only because `@evergreen-stellar/cli@0.1.0` was
   * verified from a clean machine on 2026-09-25 — see
   * `docs/evidence/2026-09-25-published-package-verification/`. Before that
   * evidence existed, W4-D22-04 forbade an install line on this page.
   *
   * No protocol version and no invented domain. The reference this was
   * modelled on offered `curl … | sh` from a host we do not own.
   */
  const command = `npx ${ctx.cli.packageName}@${ctx.cli.version} scan <contract-id>`;

  const closing = `<section class="closing">
        <div class="site-wrap closing-inner">
          <h2>Ready to safeguard your Soroban contracts?</h2>
          <p class="lead">
            Open the dashboard, run the CLI against any contract, or read the evidence we recorded
            doing it. Stellar testnet, read-only, no key and no account.
          </p>
          <div class="command">
            <span class="command-prompt" aria-hidden="true">$</span>
            <code>${esc(command)}</code>
            <button class="command-copy" type="button" data-copy="${esc(command)}" hidden>Copy</button>
          </div>
          <p class="hero-actions">
            <a class="site-cta" href="/dashboard/">Open dashboard <span aria-hidden="true">→</span></a>
            <a class="site-ghost" href="https://github.com/Fatihmaull/evergreen">View on GitHub</a>
          </p>
        </div>
      </section>`;

  return [hero, blastRadius, capture, death, kinds, how, closing, motionScript].join('\n');
}
