/**
 * /login/ — email sign-in and wallet linking (PH2-E3-01).
 *
 * The API this page calls (`PH2-E2-04`) is implemented in `apps/api/src/auth`.
 * Where it is not fully configured its auth routes answer
 * `503 UPSTREAM_UNAVAILABLE` (`docs/API.md` §1), and the page says nothing was
 * sent. When the page cannot read an answer from the API at all (a 404, an HTML
 * page, a network error, an unknown code), it renders `undetermined`, never a
 * mocked success and never a disabled control standing in for one
 * (`claims-and-copy.md`, "Wallet connect, sign-in, accounts"). The one disabled
 * control is the "Email me a code" button during a `Retry-After` countdown the
 * server asked for.
 */
export const meta = {
  title: 'Sign in — Evergreen',
  description:
    'Sign in with your email to keep a watchlist, and link a Freighter wallet by signing a sign-in challenge. Stellar testnet.',
  active: '/login/',
  eyebrow: 'Settings',
  heading: 'Sign in',
  bare: true,
};

export function render() {
  return `<div class="ov-head">
      <div>
        <p class="eyebrow">Settings</p>
        <h1 id="account-h">Sign in</h1>
      </div>
      <div class="actions" id="account-actions"></div>
    </div>
    <div id="session" aria-live="polite"><p class="note">Checking whether you are signed in…</p></div>
    <section class="block stack" id="email-section" aria-labelledby="email-h">
      <div class="block-head"><h2 id="email-h">Email</h2></div>
      <form class="stack" id="email-form">
        <div class="scan-row">
          <label class="skip" for="email">Email address</label>
          <input id="email" class="search wide" type="email" autocomplete="email" spellcheck="false" required placeholder="Email address" />
          <button id="email-button" type="submit">Email me a code</button>
        </div>
        <p class="note">A one-time code, valid for a limited time and usable once.</p>
      </form>
      <form class="stack" id="code-form" hidden style="display: none">
        <div class="scan-row">
          <label class="skip" for="code">The code from the email</label>
          <input id="code" class="search" type="text" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" required placeholder="The code from the email" />
          <button id="code-button" type="submit">Sign in</button>
        </div>
      </form>
      <div id="email-result" aria-live="polite"></div>
    </section>
    <section class="block stack" id="wallet-section" aria-labelledby="wallets-h">
      <div class="block-head">
        <h2 id="wallets-h">Wallets</h2>
        <div class="actions">
          <button id="connect-button" class="secondary" type="button">Connect Freighter</button>
          <button id="link-button" type="button">Link this wallet</button>
        </div>
      </div>
      <div id="wallet-list"></div>
      <div id="wallet-result" aria-live="polite"></div>
      <p class="note">Linking needs your wallet's signature. Signing in with email cannot move XLM.</p>
      <details>
        <summary>What linking signs</summary>
        <div class="stack">
          <p class="note">Only a signature from your own wallet ever can move XLM. Signing in again does not resume anything that spends: autopilot and allowances need a new signature from your wallet first.</p>
          <p class="note">You can add contracts to your watchlist with the email sign-in alone. A linked wallet is needed only for autopilot and allowances.</p>
          <p class="note">Linking proves you control a Stellar account. Freighter will ask you to sign a sign-in challenge: a transaction with sequence number 0, which the network rejects, so it cannot move anything. Nothing on this page asks your wallet to sign a payment, an allowance or an extension.</p>
          <p class="note" id="unlink-allowance-note">Unlinking a wallet from your account does not revoke the allowance it granted Evergreen’s engine: the allowance stays on chain until it is revoked or reaches its expiry ledger. <a href="/allowance/">Revoke it on the allowance page</a>.</p>
        </div>
      </details>
    </section>`;
}
