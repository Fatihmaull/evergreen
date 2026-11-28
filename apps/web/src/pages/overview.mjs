/**
 * /dashboard/ — Overview (components.md § "Dashboard revamp", Fatih
 * 2026-11-24). A summary of the person's own contracts, never ours: the one
 * that needs attention first, four facts, one line per contract, and a side
 * panel for detail. Signed out it is the scan field and one line; signed in
 * with nothing watched it is the Add field.
 *
 * Every state is in the static page, hidden, and `overview.ts` shows the one
 * the API's answer selects. Nothing here is a figure: the figures are drawn
 * from `GET /watchlist` and the chain in the browser.
 */
export const meta = {
  title: 'Overview — Evergreen',
  description:
    'Your Soroban testnet contracts at a glance: the one that expires first, autopilot, the allowance left, and one line per contract. Scan any contract with no wallet and no signup.',
  active: '/dashboard/',
  eyebrow: 'Overview · Stellar testnet',
  heading: 'Your contracts',
  script: '/assets/overview.js',
  bare: true,
  panel: true,
};

export function render() {
  return `<div class="ov-head">
      <div>
        <p class="eyebrow">Overview · Stellar testnet</p>
        <h1 id="ov-heading">Your contracts</h1>
      </div>
      <div class="actions" id="ov-actions" hidden>
        <a class="pill secondary" href="/dashboard/scanner/">Scan a contract</a>
        <button type="button" id="add-toggle" aria-controls="ov-add" aria-expanded="false">Add contract</button>
      </div>
    </div>
    <p class="note" id="ov-status" role="status">Asking the Evergreen API…</p>
    <noscript><p class="note">This page needs JavaScript to ask the Evergreen API. <a href="/dashboard/scanner/">The scanner</a> reads the chain directly.</p></noscript>

    <section id="ov-signed-out" class="stack" hidden aria-label="Scan">
      <form class="scan-row" action="/dashboard/scanner/" method="get">
        <label class="skip" for="ov-scan-id">Contract ID</label>
        <input id="ov-scan-id" name="id" class="search wide mono" type="text" placeholder="Paste a testnet contract ID, C…" spellcheck="false" autocomplete="off" />
        <button type="submit">Scan</button>
      </form>
      <p class="note">No wallet, no signup to scan.</p>
      <section class="block" aria-label="Example, not your contracts">
        <div class="block-head">
          <h2>How a contract looks</h2>
          <span class="chip undetermined"><span class="shape"></span>example</span>
        </div>
        <p class="note">This is not a contract of yours. A scan above reads a real one. Sign in to save it.</p>
        <ol class="checklist">
          <li>Add the contract</li>
          <li>Evergreen reads its expiry</li>
          <li>Open it to see status, <abbr class="term" title="How many ledgers a Soroban entry stays live before it is archived or deleted.">TTL</abbr>, and Extend now</li>
          <li>Turn on <abbr class="term" title="Evergreen extending a watched contract on a schedule, paid from your allowance.">autopilot</abbr></li>
        </ol>
        <p><a class="pill secondary" href="/login/">Sign in</a></p>
      </section>
    </section>

    <section id="ov-add" class="empty" hidden aria-labelledby="add-h">
      <h2 id="add-h">Add your first contract</h2>
      <form class="scan-row" id="add-form">
        <label class="skip" for="add-id">Contract ID</label>
        <input id="add-id" class="search wide mono" type="text" placeholder="Contract ID, C…" spellcheck="false" autocomplete="off" required />
        <label class="skip" for="add-label">Label</label>
        <input id="add-label" class="search" type="text" placeholder="Label (optional)" maxlength="64" autocomplete="off" />
        <button type="submit" id="add-button">Add</button>
      </form>
      <div id="add-result" aria-live="polite"></div>
      <ol class="checklist">
        <li>Add a contract, with the form above</li>
        <li>This browser reads its expiry, so the row is not left as not scanned</li>
        <li>Open it on <a href="/dashboard/watchlist/">Contracts</a> for status and Extend now</li>
        <li>Turn on autopilot from <a href="/dashboard/allowance/">Autopilot and allowance</a></li>
      </ol>
      <p class="note">Not sure of the ID? <a href="/dashboard/scanner/">Scan first</a>.</p>
    </section>

    <div id="ov-summary" hidden>
      <p class="note" id="ov-setup" hidden></p>
      <section class="next" id="ov-next" aria-label="Needs attention first"></section>
      <section class="facts" id="ov-facts" aria-label="Summary"></section>
      <section class="block" aria-labelledby="contracts-h">
        <div class="block-head">
          <h2 id="contracts-h">Contracts</h2>
          <a href="/dashboard/watchlist/">All contracts</a>
        </div>
        <div id="ov-list"></div>
      </section>
      <section class="block" aria-labelledby="activity-h">
        <div class="block-head">
          <h2 id="activity-h">Recent activity</h2>
          <a href="/dashboard/activity/">All activity</a>
        </div>
        <div id="ov-activity"><p class="note">reading…</p></div>
      </section>
    </div>`;
}
