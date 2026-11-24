/** /dashboard/watchlist/ — the contracts a signed-in user watches (PH2-E3-02). */
export const meta = {
  title: 'Watchlist — Evergreen',
  description:
    'Watched Soroban testnet contracts, ordered by the entry that expires first, with healthy, at risk and undetermined kept apart.',
  active: '/dashboard/watchlist/',
  eyebrow: 'Watchlist · Stellar testnet',
  heading: 'Watchlist',
  lead: 'Each contract is listed by its binding expiry: the entry that expires first, which is usually the shared code entry rather than the instance. Health is one of three states, and undetermined is never shown as healthy.',
  script: '/assets/watchlist.js',
};

export function render() {
  return `<section><div id="watchlist" aria-live="polite"><noscript><p class="muted">This page needs JavaScript to ask the Evergreen API.</p></noscript></div></section>`;
}
