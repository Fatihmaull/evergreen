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
      <p class="example-flag">Example layout, not a live reading. A real scan fills the figure.</p>
      <section class="next" aria-label="Example: what expires first">
        <div>
          <p class="label">Example · ends first</p>
          <p class="who">A contract you watch</p>
          <p><span class="next-figure ink">—</span><span class="next-unit">ledgers left</span></p>
          <p class="caption">about how long it has left · binds on the earliest entry · example data, not yours</p>
        </div>
      </section>
      <form class="scan-row" action="/dashboard/scanner/" method="get">
        <label class="skip" for="ov-scan-id">Contract ID</label>
        <input id="ov-scan-id" name="id" class="search wide mono" type="text" placeholder="Paste a testnet contract ID, C…" spellcheck="false" autocomplete="off" />
        <button type="submit">Scan</button>
      </form>
      <p class="note">No wallet, no signup to scan. You can still try a contract ID.</p>
      <section class="signin-line" aria-label="Sign in">
        <p>Sign in to watch your own contracts and turn on <abbr class="term" title="Evergreen extending a watched contract on a schedule, paid from your allowance.">autopilot</abbr>.</p>
        <a class="pill secondary" href="/login/">Sign in</a>
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
      <section class="block" aria-labelledby="setup-empty-h">
        <p class="setup-h" id="setup-empty-h">Set up · 1 of 4</p>
        <ol class="steps setup">
          <li><span class="step-state">Done</span><span>Signed in</span><span></span></li>
          <li class="now"><span class="step-state">Now</span><span>Add a contract</span><span class="step-action">the form above</span></li>
          <li class="waiting"><span class="step-state">Waiting</span><span>Set an allowance</span><span class="step-action">after a contract</span></li>
          <li class="waiting"><span class="step-state">Waiting</span><span>Turn on autopilot</span><span class="step-action">after the allowance</span></li>
        </ol>
      </section>
      <p class="note">Not sure of the ID? <a href="/dashboard/scanner/">Scan first</a>. <abbr class="term" title="How many ledgers a Soroban entry stays live before it is archived or deleted.">TTL</abbr> is that lifetime, counted in ledgers.</p>
    </section>

    <div id="ov-summary" hidden>
      <div id="ov-setup" hidden></div>
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
