/** /dashboard/ — Overview. Stat strip and contract cards, read live in the browser. */
export const meta = {
  title: 'Overview — Evergreen',
  description:
    'Remaining TTL for our three testnet contracts, read live. No wallet, no signup. Read-only.',
  active: '/dashboard/',
  eyebrow: 'Overview · Stellar testnet',
  heading: 'Three contracts, one shared code entry',
  lead: 'Remaining ledgers per contract, read live from testnet when it loads. When the live read fails, the snapshot committed with this build stands in — labelled with its ledger, never presented as current.',
  script: '/assets/overview.js',
};

export function render() {
  return `<section>
      <div class="stat-strip" id="strip" aria-live="polite">
        <p class="muted">Reading the chain…</p>
      </div>
    </section>
    <section>
      <h2 class="section">Our contracts</h2>
      <p class="small muted" id="ours-note">Reading the chain…</p>
      <div class="contract-grid" id="ours"></div>
      <p class="small muted">
        Three contracts deployed from one Wasm, so all three depend on a single code entry —
        <a href="/dashboard/blast-radius/">see the dependency graph</a>, or
        <a href="/dashboard/contracts/">what each contract is for</a>.
        Their remaining TTL over time is on <a href="/dashboard/decay/">the decay chart</a>.
      </p>
    </section>
    <section>
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
    </section>
    <section><div id="result" aria-live="polite"></div></section>`;
}
