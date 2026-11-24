/**
 * /dashboard/activity/ — the engine's jobs and the fee ledger (components.md
 * § "Dashboard revamp", Activity). `activity.ts` draws every figure from
 * `GET /jobs` and `GET /ledger` (docs/API.md §7, PH2-E2-08): four facts for
 * 30 days, filter pills, one line per job, and a side panel with the job's
 * steps. Nothing here is a figure.
 */
export const meta = {
  title: 'Activity — Evergreen',
  description: 'The extends Evergreen ran for your contracts, with rent and fee on separate lines.',
  active: '/dashboard/activity/',
  eyebrow: 'Activity · Stellar testnet',
  heading: 'Activity',
  script: '/assets/activity.js',
  bare: true,
  panel: true,
};

export function render() {
  return `<div class="ov-head">
      <div>
        <p class="eyebrow">Activity · Stellar testnet</p>
        <h1>Activity</h1>
      </div>
    </div>
    <p class="note" id="ac-status" role="status">Asking the Evergreen API…</p>
    <noscript><p class="note">This page needs JavaScript to ask the Evergreen API.</p></noscript>
    <div id="ac-body" hidden>
      <section class="facts" id="ac-facts" aria-label="Last 30 days"></section>
      <div class="toolbar">
        <nav class="filters" id="ac-filters" aria-label="Filter"></nav>
      </div>
      <div id="ac-list"></div>
      <p class="note"><button type="button" class="linkish" id="ac-older" hidden>Older activity</button></p>
    </div>`;
}
