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
      <h2 class="section">Check your own contract</h2>
      <p class="muted">
        Scanning is a permissionless read. Paste any testnet contract ID into
        <a href="/dashboard/scanner/">the scanner</a> — no wallet, no signup —
        or <a href="/dashboard/blast-radius/">scan several together</a> when they share a Wasm.
      </p>
    </section>`;
}
