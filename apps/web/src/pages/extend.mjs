/**
 * /extend/ — one-click Extend now (PH2-E3-04).
 *
 * A click asks the API to queue one hosted job. This page does not sign a
 * transaction, does not build a router invocation, and does not offer a second
 * signature. The jobs route is not mounted, so a click reports that and queues
 * nothing until it is.
 */
export const meta = {
  title: 'Extend now — Evergreen',
  description:
    'Ask Evergreen’s engine to extend one watched contract from the allowance you already signed. Stellar testnet. This page does not ask your wallet to sign the extend.',
  active: '/extend/',
  eyebrow: 'Account · Stellar testnet',
  heading: 'Extend now',
  lead: 'One click queues one hosted extend for a contract whose autopilot is on. Your wallet is not asked to sign it: the engine uses the allowance you already approved. Nothing is queued when this page loads.',
};

export function render() {
  return `<section class="stack">
      <h2 class="section">1 · Watched contracts</h2>
      <div id="extend-rows" aria-live="polite"><p class="muted">Asking the Evergreen API…</p></div>
    </section>
    <section class="stack">
      <h2 class="section">2 · One extend</h2>
      <div class="card card-pad stack">
        <p class="small muted">One click is one extend. Enter the simulated rent of that extend, in stroops, to see the rent and the provisional fee on separate lines. Leave it blank and both stay undetermined. This does not queue anything.</p>
        <label class="field-label" for="rent-stroops">Rent of one extend, stroops</label>
        <input id="rent-stroops" class="mono" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" />
        <div class="row"><button id="estimate-button" class="secondary" type="button">Show the estimate</button></div>
        <div id="estimate-result" aria-live="polite"></div>
      </div>
    </section>
    <section class="stack">
      <h2 class="section">3 · Without an allowance</h2>
      <div id="router-note" class="card card-pad stack"></div>
    </section>`;
}
