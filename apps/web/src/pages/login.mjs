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
  eyebrow: 'Account · Stellar testnet',
  heading: 'Sign in',
  lead: 'Your email is your account. A wallet is linked by signing a sign-in challenge, which cannot be submitted to the network. Signing in with email cannot move XLM: only a signature from your own wallet, on a screen that says what it moves, ever can. Signing in again does not resume anything that spends: autopilot and allowances need a new signature from your wallet first.',
};

export function render() {
  return `<section class="stack">
      <div id="session" aria-live="polite"><p class="muted">Checking whether you are signed in…</p></div>
    </section>
    <section class="stack">
      <h2 class="section">1 · Email</h2>
      <form class="card card-pad stack" id="email-form">
        <div>
          <label class="field-label" for="email">Email address</label>
          <input id="email" type="email" autocomplete="email" spellcheck="false" required />
        </div>
        <div class="row">
          <button id="email-button" type="submit">Email me a code</button>
          <span class="small muted">A one-time code, valid for a limited time and usable once.</span>
        </div>
      </form>
      <form class="card card-pad stack" id="code-form" hidden style="display: none">
        <div>
          <label class="field-label" for="code">The code from the email</label>
          <input id="code" type="text" inputmode="numeric" autocomplete="one-time-code" spellcheck="false" required />
        </div>
        <div class="row"><button id="code-button" type="submit">Sign in</button></div>
      </form>
      <div id="email-result" aria-live="polite"></div>
    </section>
    <section class="stack">
      <h2 class="section">2 · Wallet</h2>
      <div class="card card-pad stack">
        <p class="small muted">
          Linking proves you control a Stellar account. Freighter will ask you to sign a sign-in challenge: a
          transaction with sequence number 0, which the network rejects, so it cannot move anything. Nothing on
          this page asks your wallet to sign a payment, an allowance or an extension.
        </p>
        <div class="row">
          <button id="connect-button" class="secondary" type="button">Connect Freighter</button>
          <button id="link-button" type="button">Link this wallet</button>
        </div>
      </div>
      <div id="wallet-result" aria-live="polite"></div>
    </section>`;
}
