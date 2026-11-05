/**
 * /docs/account/ — the email account, the optional wallet link and the
 * watchlist, as they are today (K26, Fatih, 2026-11-05).
 *
 * EVERY SENTENCE HERE IS CHECKED AGAINST CODE OR A PRODUCTION RUN, and the two
 * statements that can go stale (what a watchlist row shows, and what the
 * Autopilot column can do) carry the date and the commit they were read at.
 * Sources: `lib/login-view.ts`, `lib/login.ts`, `pages/login.mjs`,
 * `lib/watchlist.ts`, `lib/watchlist-view.ts`, `lib/allowance-view.ts`,
 * `docs/API.md` §3 to §6, and the production runs in
 * `docs/evidence/2026-10-29-e3-partB/`, `2026-10-30-e3-step5b/` and
 * `2026-11-04-e3-step5c/`.
 *
 * It says nothing about what the hosted engine will do. The one thing it
 * names as missing, it names as missing.
 */

export const meta = {
  title: 'Account and watchlist',
  description:
    'The optional email sign-in, linking a wallet by signature, and the watchlist: what each does today and what it does not.',
  heading: 'Account and watchlist',
  lead: 'An email sign-in, an optional wallet link and a watchlist. What each one does today, and what it does not.',
};

export function render() {
  return `
    <h2 id="optional">You do not need any of this to scan</h2>
    <p>
      Scanning is a permissionless read: no wallet, no signup, no account. Everything on this page
      is optional, runs on Stellar testnet only, and starts at
      <a class="site-more" href="/login/">Sign in</a>.
    </p>

    <h2 id="sign-in">Sign in with your email</h2>
    <ol>
      <li>Open <a href="/login/">Sign in</a> and enter your email address.</li>
      <li>Press <strong>Email me a code</strong>. A one-time code is sent to that address. It is valid for a limited time and works once.</li>
      <li>Enter the code. The page then reads <em>Signed in as</em> and your address.</li>
    </ol>
    <p>
      Your email is your account. There is no password. If the code cannot be sent, the page says
      so and names no cause, because it does not know one. <strong>Signing in with email cannot
      move XLM.</strong> Only a signature from your own wallet, on a screen that says what it
      moves, ever can. <strong>Sign out</strong> is on the same page.
    </p>

    <h2 id="wallet">Link a wallet, if you want to</h2>
    <p>
      You can add contracts to your watchlist with the email sign-in alone. A linked wallet is
      needed only for autopilot and allowances.
    </p>
    <p>
      To link one, set Freighter to testnet, press <strong>Connect Freighter</strong>, then
      <strong>Link this wallet</strong> and approve the signature. What you sign is a sign-in
      challenge: a transaction with sequence number 0, which the network rejects. <strong>It moves
      nothing and grants nothing</strong>: it is not a payment and it is not an allowance. If
      Freighter ever asks you to sign a payment on that page, decline it.
    </p>
    <p>
      <strong>Unlink</strong> sits beside each linked wallet on the same page.
      <strong>Unlinking does not revoke an allowance.</strong> It stays on the chain until you
      revoke it or it expires, and the page links
      <a href="/allowance/">the allowance page</a> for that. A wallet that a watched contract
      names as its payer cannot be unlinked; the page says so without naming the contract.
    </p>

    <h2 id="watchlist">The watchlist</h2>
    <p>
      Scan a contract in <a href="/dashboard/scanner/">the scanner</a>, then press
      <strong>Add to watchlist</strong>. It is added with the same data keys the scan used. A
      watchlist belongs to a signed-in session; signed out, the button answers <em>Not added</em>
      and links to sign-in. Your list is at <a href="/dashboard/watchlist/">Watchlist</a>, and each
      row has a <strong>Remove</strong> control.
    </p>
    <p>
      A watchlist holds at most <strong>50</strong> contracts per account. The API refuses a 51st
      and stores nothing; the page then says only that the API did not accept the request.
    </p>
    <p>
      Rows are ordered by <strong>binding expiry</strong>: the entry that expires first, which is
      usually the shared code entry rather than the instance. Health is one of three states, and
      undetermined is never shown as healthy. A scan without data keys covers the instance and the
      code entry only, and absence is not health.
    </p>

    <h3 id="rows">What a row says today</h3>
    <p class="note">
      As of 2026-11-05, on <span class="mono">origin/main</span> at
      <span class="mono">9ef4094</span>: nothing in the repository writes an engine observation for
      a watched contract. So every row's health reads <em>undetermined</em>, with the line <em>Not checked by the engine
      yet. The expiry beside it is this browser reading the chain now.</em> That expiry is the
      scanner's read, taken when you open the page. It is not an engine check, and the row says
      so. If this browser's own read of the chain did not complete, the row reads <em>Not scanned
      yet.</em> instead.
    </p>
    <p>
      When an engine observation exists, a row shows the engine's last scan with the ledger it was
      read at beside it, not a reading taken now. Until then, a watchlist row tells you what the
      scanner would tell you, kept in one place.
    </p>

    <h2 id="autopilot">Autopilot and the allowance</h2>
    <p class="note">
      As of 2026-11-05, on <span class="mono">origin/main</span> at
      <span class="mono">9ef4094</span>: the <strong>Autopilot</strong> column shows the setting
      the API holds for each row, and nothing more. <strong>No control on this site turns autopilot
      on, and no step on it grants an allowance.</strong>
    </p>
    <p>
      <a href="/allowance/">The allowance page</a> reads a wallet's allowance and can revoke one.
      Its <strong>Revoke allowance</strong> button stays disabled, with the reason printed beneath
      it, until the engine's spender address is published. An allowance lets the engine pull
      native XLM from your account, only up to the amount you approved and only until the ledger
      you chose.
    </p>

    <h2 id="not">What none of this does</h2>
    <ul>
      <li>Adding a contract to the watchlist does not extend it, and nothing on this site submits an extension for you.</li>
      <li>It does not send you alerts. What the engine alerts on, and what is not switched on, is on <a href="/docs/engine/notifications/">Notifications</a>.</li>
      <li>It does not work on mainnet. The site refuses to be built for another network.</li>
    </ul>
  `;
}
