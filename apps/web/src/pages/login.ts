/**
 * /login/ in the browser.
 *
 * WHAT THIS PAGE MAY KNOW, AND WHERE IT KEEPS IT. Everything from a signed-in
 * call lives in this module's variables for the life of the page, and nowhere
 * else: no `localStorage`, no `sessionStorage`, no IndexedDB (API spec #350,
 * "Never `localStorage`"). The session itself is an `HttpOnly` cookie the page
 * cannot read. `test/login-page.test.ts` holds this file to that.
 *
 * WHAT IT CALLS. Only routes #350 states, with only the fields #350 states:
 * `GET /me`, `POST /auth/email/start { email }`, `POST /auth/email/verify
 * { email, code }`, `POST /wallets/challenge { account }`, `POST /wallets
 * { challengeXdr }`. The calls live in `lib/login.ts`, on the shared
 * `lib/api.ts` client, so the page branches on §9's `code` and nothing else.
 *
 * WHERE. Relative `/api/v1/...` on this origin, and never an absolute host.
 * The Pages Function proxies `/api/*` to the API Worker over a service binding
 * (#350 decision B, base path `/api/v1`; CEF on #361), so the session cookie is
 * same-origin. A direct `*.workers.dev` call would be cross-site and the
 * `SameSite=Lax` cookie would not be sent. `API_BASE` in `lib/api.ts` is the one place it lands.
 *
 * WHEN IT IS NOT THERE. Any answer that is not one of #350's answers for that
 * route — a 404 from Pages, an HTML page, JSON without the error envelope, an
 * unknown code, a network error — is reported as `undetermined` with what was
 * received. Nothing is assumed: not "signed out",
 * not "sent".
 *
 * NO MONEY. This page imports `lib/wallet.ts` only; `build.mjs` refuses the
 * build if `wallet-money.ts` reaches this bundle (`LOGIN_FORBIDDEN`).
 */
import { API_BASE } from '../lib/api';
import { esc, short } from '../lib/format';
import {
  linkWallet as postWallet,
  readSession,
  requestChallenge,
  startEmail as postEmailStart,
  verifyEmail as postEmailVerify,
  type Me,
} from '../lib/login';
import { NETWORK } from '../lib/network';
import { createWallet, isWalletFailure, type WalletFailure } from '../lib/wallet';
import { freighterPort } from '../lib/wallet-freighter';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

/** In memory, for the page's life. Cleared on any UNAUTHENTICATED. */
let me: Me | undefined;
let pendingEmail: string | undefined;
let connected: string | undefined;

function undetermined(what: string, detail: string): string {
  return `<div class="panel undetermined"><p><span class="chip undetermined"><span class="shape"></span>undetermined</span> ${esc(
    what,
  )}</p><p class="small muted">${esc(detail)}. The account service (<span class="mono">${esc(
    API_BASE,
  )}</span>) answers these when it is deployed; until then this page cannot tell.</p></div>`;
}

function note(html: string): string {
  return `<div class="panel note"><p>${html}</p></div>`;
}

function signedOut(): void {
  me = undefined;
  $('session').innerHTML = note('You are not signed in.');
}

function renderSession(): void {
  const out = $('session');
  if (me) {
    const linked = me.wallets.map((w) => `<span class="mono">${esc(short(w.account))}</span>`);
    out.innerHTML = note(
      `Signed in as <strong>${esc(me.user.email)}</strong>. ${
        linked.length ? `Linked: ${linked.join(', ')}.` : 'No wallet linked.'
      }`,
    );
  }
}

async function loadMe(): Promise<void> {
  const r = await readSession();
  if (r.kind === 'signed-in') {
    me = r.me;
    renderSession();
  } else if (r.kind === 'signed-out') {
    signedOut();
  } else {
    me = undefined;
    $('session').innerHTML = undetermined('Whether you are signed in.', r.detail);
  }
}

async function startEmail(event: Event): Promise<void> {
  event.preventDefault();
  const email = $<HTMLInputElement>('email').value.trim();
  const out = $('email-result');
  const button = $<HTMLButtonElement>('email-button');
  button.disabled = true;
  try {
    const r = await postEmailStart(email);
    if (r.kind === 'sent') {
      pendingEmail = email;
      const codeForm = $('code-form');
      codeForm.hidden = false;
      // `.stack > *` sets display, which beats the `hidden` attribute.
      codeForm.style.display = '';
      out.innerHTML = note(
        `If <strong>${esc(email)}</strong> can receive mail, a code is on its way. The answer is the same whether or not an account exists.`,
      );
    } else if (r.kind === 'rate-limited') {
      out.innerHTML = note(
        r.retryAfterSeconds === undefined
          ? 'Too many codes asked for. Wait, then try again.'
          : `Too many codes asked for. Try again in ${Math.ceil(r.retryAfterSeconds / 60)} min.`,
      );
    } else {
      out.innerHTML = undetermined('Whether a code was sent.', r.detail);
    }
  } finally {
    button.disabled = false;
  }
}

async function verifyEmail(event: Event): Promise<void> {
  event.preventDefault();
  const out = $('email-result');
  const r = await postEmailVerify(pendingEmail ?? '', $<HTMLInputElement>('code').value.trim());
  if (r.kind === 'verified') {
    out.innerHTML = '';
    await loadMe();
  } else if (r.kind === 'code-invalid') {
    out.innerHTML = note(
      'That code did not work. It may be wrong, used or expired. Ask for a new one.',
    );
  } else {
    out.innerHTML = undetermined('Whether you are signed in.', r.detail);
  }
}

/** The sentence for each kind. Copy lives here, on the screen, not in the primitive (#327). */
function walletSentence(f: WalletFailure): string {
  switch (f.kind) {
    case 'not-installed':
      return 'Freighter is not installed in this browser, or this page cannot see it.';
    case 'locked':
      return 'Freighter is locked. Unlock it and try again.';
    case 'not-connected':
      return 'Freighter did not share an account with this page. It may be locked or not yet allowed; this page cannot tell which.';
    case 'wrong-network':
      return `Freighter is on a different network (it reports “${esc(f.reported)}”). Switch it to testnet.`;
    case 'account-mismatch':
      return `Freighter's active account is <span class="mono">${esc(short(f.reported))}</span>, not <span class="mono">${esc(short(f.expected))}</span>. Switch account, or connect again.`;
    case 'rejected':
      return 'You declined in Freighter. Nothing was signed.';
    case 'timeout':
      return 'Freighter did not answer in time. Nothing was signed by this page.';
    case 'unavailable':
      return `Freighter could not be reached: ${esc(f.detail)}.`;
  }
}

const wallet = createWallet(freighterPort());

async function connectWallet(): Promise<void> {
  const out = $('wallet-result');
  const r = await wallet.connect();
  if (isWalletFailure(r)) {
    out.innerHTML = note(walletSentence(r));
    return;
  }
  const network = await wallet.assertTestnet();
  if (network !== true) {
    out.innerHTML = note(walletSentence(network));
    return;
  }
  connected = r.account;
  out.innerHTML = note(
    `Connected: <span class="mono">${esc(r.account)}</span>, on testnet. Not linked yet: linking needs you to be signed in, and a signature.`,
  );
}

async function linkWallet(): Promise<void> {
  const out = $('wallet-result');
  if (!connected) {
    out.innerHTML = note('Connect Freighter first.');
    return;
  }
  if (!me) {
    out.innerHTML = note('Sign in with your email first: a wallet is linked to an account.');
    return;
  }
  const challenge = await requestChallenge(connected, me.csrfToken);
  if (challenge.kind === 'signed-out') {
    signedOut();
    out.innerHTML = note('Your session ended. Sign in again, then link.');
    return;
  }
  if (challenge.kind !== 'challenge') {
    out.innerHTML = undetermined('Whether a sign-in challenge can be issued.', challenge.detail);
    return;
  }
  const { challengeXdr, networkPassphrase } = challenge.challenge;
  if (networkPassphrase !== NETWORK.passphrase) {
    out.innerHTML = note(
      'The service issued a challenge for a different network than this site reads. Nothing was signed.',
    );
    return;
  }
  const signed = await wallet.signTransaction(challengeXdr, {
    networkPassphrase,
    address: connected,
  });
  if (isWalletFailure(signed)) {
    out.innerHTML = note(walletSentence(signed));
    return;
  }
  const linked = await postWallet(signed.signedXdr, me.csrfToken);
  switch (linked.kind) {
    case 'linked':
      out.innerHTML = note(`Linked: <span class="mono">${esc(connected)}</span>.`);
      await loadMe();
      return;
    case 'linked-elsewhere':
      out.innerHTML = note('This wallet is already linked to a different account.');
      return;
    case 'challenge-invalid':
      out.innerHTML = note('The signing request expired. Try linking again.');
      return;
    case 'csrf-failed':
      out.innerHTML = note('This page was open too long. Reload and try again.');
      return;
    case 'signed-out':
      signedOut();
      out.innerHTML = note('Your session ended. Sign in again, then link.');
      return;
    case 'undetermined':
      out.innerHTML = undetermined('Whether the wallet was linked.', linked.detail);
  }
}

$('email-form').addEventListener('submit', (e) => void startEmail(e));
$('code-form').addEventListener('submit', (e) => void verifyEmail(e));
$('connect-button').addEventListener('click', () => void connectWallet());
$('link-button').addEventListener('click', () => void linkWallet());
void loadMe();
