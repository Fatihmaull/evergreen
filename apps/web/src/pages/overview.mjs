/**
 * /dashboard/ — Overview. Leads with what a visitor came for: scan any
 * contract, then (signed in) a summary of their own watchlist. Our three
 * testnet contracts follow as a worked example, no longer the page's subject
 * (Fatih, 2026-11-23: real adoption, Q4).
 */
export const meta = {
  title: 'Overview — Evergreen',
  description:
    'Scan any Soroban testnet contract for its TTL, keep a watchlist when signed in, and see three of our own contracts as a worked example. No wallet, no signup to scan.',
  active: '/dashboard/',
  eyebrow: 'Overview · Stellar testnet',
  heading: 'What expires first, read from the chain',
  lead: 'Scan any testnet contract with no wallet and no signup. Signed in, your watchlist is summarised below it. Our own three contracts close the page as a worked example.',
  script: '/assets/overview.js',
};

export function render() {
  return `<section>
      <h2 class="section">Scan any contract</h2>
      <p class="muted">
        A permissionless read — no wallet, no signup. Paste any testnet contract ID for its TTL health, the entry
        that binds its expiry, and what extending would cost. Several contracts that share a Wasm belong on
        <a href="/dashboard/blast-radius/">Blast Radius</a>.
      </p>
      <form class="card card-pad stack" id="scan-form">
        <div>
          <label class="field-label" for="contract-id">Testnet contract address</label>
          <input id="contract-id" type="text" spellcheck="false" autocomplete="off" placeholder="C…" />
        </div>
        <div class="row">
          <button id="scan-button" type="submit">Scan</button>
          <button id="example-button" class="secondary" type="button">Use guinea-pig A</button>
        </div>
        <details>
          <summary>Data keys — optional, and what they change</summary>
          <p class="small muted">
            Contract storage cannot be enumerated: a scan reads the keys it is handed. Without any, only the
            instance and code entries are visible, and the result says so. One base64
            <span class="mono">LedgerKey</span> per line.
          </p>
          <textarea id="data-keys" spellcheck="false" placeholder="AAAABgAAAAE…"></textarea>
        </details>
      </form>
      <div id="result" aria-live="polite"></div>
    </section>
    <section>
      <h2 class="section">Your watchlist</h2>
      <div id="wl-summary" class="stack" aria-live="polite"><p class="muted">Asking the Evergreen API…</p><noscript><p class="muted">This needs JavaScript to ask the Evergreen API.</p></noscript></div>
    </section>
    <section>
      <h2 class="section">Worked example: our three testnet contracts</h2>
      <p class="small muted" id="ours-note">Reading the chain…</p>
      <div class="stat-strip" id="strip" aria-live="polite">
        <p class="muted">Reading the chain…</p>
      </div>
      <div class="contract-grid" id="ours"></div>
      <p class="small muted">
        Three contracts deployed from one Wasm, so all three depend on a single code entry —
        <a href="/dashboard/blast-radius/">see the dependency graph</a>, or
        <a href="/dashboard/contracts/">what each contract is for</a>.
        Their remaining TTL over time is on <a href="/dashboard/decay/">the decay chart</a>.
      </p>
    </section>`;
}
