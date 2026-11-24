/**
 * /dashboard/activity/ — the engine's jobs and the fee ledger (components.md
 * § "Dashboard revamp", Activity). `GET /jobs` and `GET /ledger` are specified
 * in docs/API.md §7 but not built, so the page says so in one line and draws
 * no rows, no zeros and no placeholders (§ "Where the data comes from today").
 */
export const meta = {
  title: 'Activity — Evergreen',
  description: 'The extends Evergreen ran for your contracts, with rent and fee on separate lines.',
  active: '/dashboard/activity/',
  eyebrow: 'Activity · Stellar testnet',
  heading: 'Activity',
};

export function render() {
  return `<section class="empty">
      <p>Activity appears here once the engine reports jobs.</p>
      <p class="note">Until then each contract's last check is on <a href="/dashboard/watchlist/">Contracts</a>.</p>
    </section>`;
}
