/**
 * /support/ — "Support Evergreen" (PH2-E3-07): an opt-in payment of an amount
 * the user types, from their wallet to the treasury address.
 *
 * NOT REGISTERED IN `build.mjs` YET. "Support Evergreen" is a never-claim in
 * `claims-and-copy.md` until the page ships, and the treasury address is unset
 * (PH2-E4-03, #381), so the page would have nothing it can do. Registering it
 * (a `PAGES` entry, the nav link, the dashboard route, the copy row) waits on
 * that decision.
 */
export const meta = {
  title: 'Support Evergreen — Evergreen',
  description:
    'Send Evergreen a payment of an amount you choose, from your own wallet, to the treasury address. Stellar testnet.',
  active: '/support/',
  eyebrow: 'Optional · Stellar testnet',
  heading: 'Support Evergreen',
  lead: 'An optional payment of an amount you choose, from your wallet to Evergreen’s treasury address. It is separate from everything else: it does not change how your contracts are watched or extended. Your wallet asks you to sign, and the payment is submitted to testnet.',
};

export function render() {
  return `<p id="unset-note" class="small muted" hidden></p>
    <section id="wallet-step" class="stack">
      <h2 class="section">1 · Wallet</h2>
      <div class="card card-pad stack">
        <div class="row"><button id="connect-button" class="secondary" type="button">Connect Freighter</button></div>
        <div id="wallet-result" aria-live="polite"></div>
      </div>
    </section>
    <section id="amount-step" class="stack">
      <h2 id="amount-heading" class="section">2 · Amount</h2>
      <div id="amount-card" class="card card-pad stack">
        <p id="to-line" class="small muted">To <span id="treasury" class="mono">the treasury address (not published yet)</span></p>
        <label id="amount-label" class="small" for="amount-input">Amount in XLM</label>
        <input id="amount-input" class="mono" type="text" inputmode="decimal" autocomplete="off" value="" />
        <div class="row"><button id="send-button" type="button">Send payment</button></div>
        <div id="send-result" aria-live="polite"></div>
      </div>
    </section>`;
}
