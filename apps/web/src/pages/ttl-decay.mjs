/**
 * /dashboard/decay/ — TTL decay for the user's watched contracts
 * (components.md § "Dashboard revamp", TTL decay). One reading per contract
 * until the API keeps observations (PH2-E2-09): a dot and a dashed
 * projection, never a solid line. `ttl-decay.ts` draws every state. The
 * recorded evidence for our own test contracts moved to
 * /dashboard/decay/evidence/.
 */
export const meta = {
  title: 'TTL decay — Evergreen',
  description:
    'How many ledgers each watched Soroban testnet contract has left, from its last reading, projected to the ledger it ends.',
  active: '/dashboard/decay/',
  eyebrow: 'TTL decay · Stellar testnet',
  heading: 'TTL decay',
  script: '/assets/ttl-decay.js',
  bare: true,
};

export function render() {
  return `<div class="ov-head">
      <div>
        <p class="eyebrow">TTL decay · Stellar testnet</p>
        <h1>TTL decay</h1>
      </div>
    </div>
    <p class="note" id="td-status" role="status">Asking the Evergreen API…</p>
    <noscript><p class="note">This page needs JavaScript to ask the Evergreen API.</p></noscript>
    <section class="chart-card" id="td-chart" aria-labelledby="sel-h" hidden></section>
    <section class="block" id="td-all" aria-labelledby="all-h" hidden>
      <div class="block-head"><h2 id="all-h">All contracts</h2></div>
      <ul class="strips" id="td-strips"></ul>
      <p class="note">Each row has its own vertical scale and the same time axis; the line across is the autopilot threshold. Select a row to chart it above.</p>
    </section>`;
}
