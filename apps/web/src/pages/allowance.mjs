/**
 * /allowance/ — the allowance a wallet has granted Evergreen's engine, and its
 * revoke (PH2-E3-05).
 *
 * This is the page that asks a wallet to sign something that is submitted
 * (#328 decision 1a): the revoke, `approve(0)`. It states the allowance's
 * limits rather than custody words (#328 decision 2a). While the engine's
 * spender address is unpublished the page reads nothing and the revoke cannot
 * run; it says so (Rakha, 2026-10-31).
 */
export const meta = {
  title: 'Allowance — Evergreen',
  description:
    'Read the native XLM allowance your wallet has granted Evergreen, and revoke it with one signature from your own wallet. Stellar testnet.',
  active: '/allowance/',
  eyebrow: 'Account · Stellar testnet',
  heading: 'Allowance',
  lead: 'An allowance lets Evergreen’s engine pull native XLM from your account, up to the amount you approved and only until the ledger you chose. On this page your wallet asks you to sign: revoking sets that allowance to zero, and the transaction is submitted to testnet.',
};

export function render() {
  return `<section class="stack">
      <h2 class="section">1 · Wallet</h2>
      <div class="card card-pad stack">
        <div class="row"><button id="connect-button" class="secondary" type="button">Connect Freighter</button></div>
        <div id="wallet-result" aria-live="polite"></div>
      </div>
    </section>
    <section class="stack">
      <h2 class="section">2 · What the chain says</h2>
      <div id="allowance-history" aria-live="polite"></div>
      <div id="allowance-read" aria-live="polite"><p class="muted">Connect a wallet to read its allowance.</p></div>
      <div id="reminders" aria-live="polite">
        <p class="small muted">Renewal reminders are at 30, 7 and 1 days before expiry. The expiry is not known yet, so those dates are undetermined. This page does not send them.</p>
      </div>
    </section>
    <section class="stack">
      <h2 class="section">3 · Size the cap</h2>
      <div class="card card-pad stack">
        <p class="small muted">
          The estimate is the simulated rent of one extend, for each contract, times how many hosted
          extends this cap should cover, plus the provisional fee on each extend. Rent and the fee stay
          on separate lines. A new approve replaces the cap: it does not add to it. One allowance covers
          every contract. A per-contract budget is not enforced on the chain.
        </p>
        <label class="field-label" for="rent-lines">Estimated rent for one extend, in stroops, one contract per line</label>
        <textarea id="rent-lines" class="mono" rows="4" spellcheck="false" autocomplete="off"></textarea>
        <label class="field-label" for="hosted-actions">Hosted extends this cap should cover</label>
        <input id="hosted-actions" class="mono" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" />
        <label class="field-label" for="budget-lines">Per-job budget in stroops, one contract per line, same order. Leave blank if you do not have it.</label>
        <textarea id="budget-lines" class="mono" rows="3" spellcheck="false" autocomplete="off"></textarea>
        <div class="row"><button id="estimate-button" class="secondary" type="button">Show the estimate</button></div>
        <div id="estimate-result" aria-live="polite"></div>
      </div>
    </section>
    <section class="stack">
      <h2 class="section">4 · Approve</h2>
      <div class="card card-pad stack">
        <p class="small muted">
          Approving asks your wallet to sign one <span class="mono">approve</span>. A new approve replaces
          the cap. It does not add to it. It authorises a payment, never access to a contract. The longest
          expiry this page offers is 3,110,399 ledgers after the ledger the allowance is read at, and it
          is shown as that ledger and a date before anything is signed.
        </p>
        <div id="approve-disclosure" aria-live="polite"></div>
        <div class="row"><button id="approve-button" type="button" disabled>Approve allowance</button></div>
        <div id="approve-result" aria-live="polite"></div>
      </div>
    </section>
    <section class="stack">
      <h2 class="section">5 · Revoke</h2>
      <div class="card card-pad stack">
        <p class="small muted">
          Revoking is one transaction, <span class="mono">approve</span> with amount 0, signed by your wallet and
          submitted to testnet. After it lands the engine can pull nothing. Unlinking a wallet from your account does
          not do this: the allowance stays on chain until it is revoked or reaches its expiry ledger.
        </p>
        <div class="row"><button id="revoke-button" type="button" disabled>Revoke allowance</button></div>
        <div id="revoke-result" aria-live="polite"></div>
      </div>
    </section>`;
}
