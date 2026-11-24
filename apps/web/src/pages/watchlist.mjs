/**
 * /dashboard/watchlist/ — Contracts (components.md § "Dashboard revamp",
 * Contracts). The watchlist, renamed; the URL stays so old links work. One
 * line per contract with filter pills and a name/ID filter, and the side
 * panel for detail. Every state is drawn by `watchlist.ts` from the API.
 */
export const meta = {
  title: 'Contracts — Evergreen',
  description:
    'Your watched Soroban testnet contracts, one line each, ordered by what needs attention first, with healthy, at risk and undetermined kept apart.',
  active: '/dashboard/watchlist/',
  eyebrow: 'Contracts · Stellar testnet',
  heading: 'Contracts',
  script: '/assets/watchlist.js',
  bare: true,
  panel: true,
};

export function render() {
  return `<div class="ov-head">
      <div>
        <p class="eyebrow">Contracts · Stellar testnet</p>
        <h1>Contracts</h1>
      </div>
      <div class="actions"><a class="pill" href="/dashboard/?add=1">Add contract</a></div>
    </div>
    <p class="note" id="cl-status" role="status">Asking the Evergreen API…</p>
    <noscript><p class="note">This page needs JavaScript to ask the Evergreen API.</p></noscript>
    <div id="cl-body" hidden>
      <div class="toolbar">
        <nav class="filters" id="cl-filters" aria-label="Filter"></nav>
        <input id="cl-q" class="search" type="search" placeholder="Filter by name or ID" aria-label="Filter by name or ID" autocomplete="off" />
      </div>
      <div id="cl-list"></div>
      <p class="note" id="cl-count"></p>
    </div>`;
}
