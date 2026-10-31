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
      <div id="allowance-read" aria-live="polite"><p class="muted">Connect a wallet to read its allowance.</p></div>
    </section>
    <section class="stack">
      <h2 class="section">3 · Revoke</h2>
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
