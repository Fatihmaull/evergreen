/**
 * /allowance/ — the allowance a wallet has granted Evergreen's engine, and its
 * revoke (PH2-E3-05).
 *
 * Three steps and a Stop (components.md § "B, C, D"): the standing line, 1
 * Wallet, 2 Cap, 3 Review and sign, then Turn on autopilot once the chain
 * reads back what was signed. Stop (the revoke, `approve(0)`) sits below a
 * hairline as the secondary, reverse action (#328 decision 1a). It states the allowance's
 * limits rather than custody words (#328 decision 2a). While the engine's
 * spender address is unpublished the page reads nothing and the revoke cannot
 * run; it says so (Rakha, 2026-10-31).
 */
export const meta = {
  title: 'Allowance — Evergreen',
  description:
    'Read the native XLM allowance your wallet has granted Evergreen, size and approve one for autopilot, and revoke it with one signature from your own wallet. Stellar testnet.',
  active: '/allowance/',
  eyebrow: 'Account · Stellar testnet',
  heading: 'Allowance',
  lead: 'An allowance lets Evergreen’s engine pull native XLM from your wallet, up to a cap and until a ledger you approve. Your wallet signs it. Signing in with email cannot move XLM.',
};

export function render() {
  return `<section class="stack">
      <div id="standing" aria-live="polite"><p class="standing-line">Connect a wallet to read its allowance.</p></div>
      <div id="reminders" aria-live="polite">
        <p class="small muted">Renewal reminders are at 30, 7 and 1 days before expiry. The expiry is not known yet, so those dates are undetermined. This page does not send them.</p>
      </div>
    </section>
    <section class="stack">
      <h2 class="section">1 · Wallet</h2>
      <div class="row"><button id="connect-button" class="secondary" type="button">Connect Freighter</button></div>
      <div id="wallet-result" aria-live="polite"></div>
    </section>
    <section class="stack">
      <h2 class="section">2 · Cap</h2>
      <p class="small muted">
        The contracts on your watchlist that this wallet can pay for. Rent is simulated in this browser
        for one extend of each. The cap is that rent times how many extends it should cover, plus the
        provisional fee and the retry margin on each extend. Rent and the fee stay on separate lines.
        One allowance covers every contract.
      </p>
      <div id="cap-rows" aria-live="polite"><p class="small muted">Connect a wallet to list the contracts it can pay for.</p></div>
      <label class="field-label" for="hosted-actions">Extends to cover, per contract</label>
      <input id="hosted-actions" class="mono" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" value="2" />
      <p class="small muted">Each extend is one pull: rent, the Evergreen fee and the retry margin.</p>
      <details>
        <summary>Enter rent by hand</summary>
        <p class="small muted">For a contract that is not on your watchlist. Estimated rent for one extend, in stroops, one contract per line.</p>
        <textarea id="rent-lines" class="mono" rows="3" spellcheck="false" autocomplete="off"></textarea>
      </details>
      <div id="estimate-result" aria-live="polite"></div>
    </section>
    <section class="stack">
      <h2 class="section">3 · Review and sign</h2>
      <div class="card card-pad stack">
        <div id="review" aria-live="polite"></div>
        <div id="approve-disclosure" aria-live="polite"></div>
        <div id="sign-row" class="row"><button id="approve-button" type="button" disabled>Sign approve in Freighter →</button></div>
        <p id="sign-help" class="small muted">
          Your wallet shows the same amount and ledger. If it does not, reject it there.
          A new approve replaces the cap: it does not add to it, and it is never access to a contract.
          The longest expiry this page offers is 3,110,399 ledgers after the ledger the allowance is read at.
        </p>
        <div id="approve-result" aria-live="polite"></div>
      </div>
    </section>
    <section id="autopilot-step" class="stack" hidden>
      <h2 class="section">Turn on autopilot</h2>
      <div id="autopilot-rows" aria-live="polite"></div>
      <div class="row"><button id="autopilot-button" type="button">Turn on autopilot for these contracts →</button></div>
      <div id="autopilot-result" aria-live="polite"></div>
    </section>
    <section class="stack stop-section">
      <h2 class="section">Stop</h2>
      <p class="small muted">
        Revoking is one transaction, <span class="mono">approve</span> with amount 0, signed by your wallet and
        submitted to testnet. After it lands the engine can pull nothing. Unlinking a wallet from your account does
        not do this: the allowance stays on chain until it is revoked or reaches its expiry ledger.
      </p>
      <div class="row"><button id="revoke-button" class="secondary" type="button" disabled>Revoke allowance</button></div>
      <div id="revoke-result" aria-live="polite"></div>
    </section>`;
}
