/**
 * /extend/ — one-click Extend now (PH2-E3-04), in the revamp shell.
 *
 * The sidebar does not list this page: the action lives in the contract side
 * panel (components.md § Side panel). This URL is the deep link. A click
 * queues one job. It does not sign, and it does not offer a second signature.
 */
export const meta = {
  title: 'Extend now — Evergreen',
  description:
    'Queue one hosted extend for a watched testnet contract. This page does not ask the wallet to sign.',
  active: '/dashboard/watchlist/',
  eyebrow: 'Contracts · Stellar testnet',
  heading: 'Extend now',
  bare: true,
  panel: true,
};

export function render() {
  return `<div class="ov-head">
      <div>
        <p class="eyebrow">Contracts · Stellar testnet</p>
        <h1>Extend now</h1>
      </div>
    </div>
    <div id="router-note"></div>
    <p class="note" id="extend-status" role="status">Asking the Evergreen API…</p>
    <div id="extend-list"></div>
    <section class="stack">
      <h2 class="section">One extend</h2>
      <div class="card card-pad stack">
        <p class="small muted">One click is one extend. Enter the simulated rent of that extend, in stroops. Rent, the provisional fee and the pull are separate lines. This does not queue anything.</p>
        <label class="field-label" for="rent-stroops">Rent of one extend, stroops</label>
        <input id="rent-stroops" class="mono" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" />
        <div class="row"><button id="estimate-button" class="secondary" type="button">Show the estimate</button></div>
        <div id="estimate-result" aria-live="polite"></div>
      </div>
    </section>`;
}
