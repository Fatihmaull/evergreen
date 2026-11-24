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
  eyebrow: 'Allowance · Stellar testnet',
  heading: 'Allowance',
  bare: true,
};

export function render() {
  return `<div class="ov-head">
      <div>
        <p class="eyebrow">Allowance · Stellar testnet</p>
        <h1>Allowance</h1>
      </div>
    </div>
    <section class="next" id="al-next" aria-label="Left to pull"><div><p class="label">Left to pull</p><p class="caption">Reading the allowance…</p></div></section>
    <section class="facts" id="al-facts" aria-label="Allowance facts"></section>
    <p class="note">Your wallet signs every allowance. Signing in with email cannot move XLM.</p>
    <details id="al-flow" class="block">
      <summary>Change cap</summary>
      <div class="stack al-flow-body">
    <section class="stack">
      <div id="standing" aria-live="polite"><p class="standing-line">Connect a wallet to read its allowance.</p></div>
    </section>
    <section class="stack">
      <h2 class="section">1 · Wallet</h2>
      <div class="row"><button id="connect-button" class="secondary" type="button">Connect Freighter</button></div>
      <div id="wallet-result" aria-live="polite"></div>
    </section>
    <section class="stack">
      <h2 class="section">2 · Cap</h2>
      <p class="small muted">One allowance covers every contract on your watchlist that this wallet pays for.</p>
      <div id="cap-rows" aria-live="polite"><p class="small muted">Connect a wallet to list the contracts it can pay for.</p></div>
      <label class="field-label" for="hosted-actions">Extends to cover, per contract</label>
      <input id="hosted-actions" class="mono" type="text" inputmode="numeric" autocomplete="off" spellcheck="false" value="2" />
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
        <p id="sign-help" class="small muted">Your wallet shows the same amount and ledger. If it does not, reject it there.</p>
        <div id="approve-result" aria-live="polite"></div>
      </div>
    </section>
    <section id="autopilot-step" class="stack" hidden>
      <h2 class="section">Turn on autopilot</h2>
      <div id="autopilot-rows" aria-live="polite"></div>
      <div class="row"><button id="autopilot-button" type="button">Turn on autopilot for these contracts →</button></div>
      <div id="autopilot-result" aria-live="polite"></div>
    </section>
      </div>
    </details>
    <section class="stack stop-section">
      <h2 class="section">Stop</h2>
      <p class="small muted">Revoking is one <span class="mono">approve</span> with amount 0, signed by your wallet. After it lands the engine can pull nothing.</p>
      <div class="row"><button id="revoke-button" class="secondary" type="button" disabled>Revoke allowance</button></div>
      <div id="revoke-result" aria-live="polite"></div>
    </section>
    <details class="block al-how">
      <summary>How this works</summary>
      <div class="stack">
        <div id="reminders" aria-live="polite">
          <p class="small muted">Renewal reminders are at 30, 7 and 1 days before expiry. The expiry is not known yet, so those dates are undetermined. This page does not send them.</p>
        </div>
        <p class="small muted">Rent is simulated in this browser for one extend of each contract. The cap is that rent times how many extends it should cover, plus the provisional fee and the retry margin on each extend. Rent and the fee stay on separate lines. Each extend is one pull: rent, the Evergreen fee and the retry margin.</p>
        <p class="small muted">A new approve replaces the cap: it does not add to it, and it is never access to a contract. The longest expiry this page offers is 3,110,399 ledgers after the ledger the allowance is read at.</p>
        <p class="small muted">The revoke is submitted to testnet. Unlinking a wallet from your account does not revoke: the allowance stays on chain until it is revoked or reaches its expiry ledger.</p>
      </div>
    </details>`;
}
