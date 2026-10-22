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
 * { challengeXdr }`. #350 is unmerged; if it changes, this changes.
 *
 * WHERE. `/api/*` on this origin, the Pages Function proxy of decision B
 * (#350 §1, ADR-003 amendment). The proxy's exact shape — whether it strips
 * `/api` before forwarding — is UNDETERMINED and open with CEF; `API_BASE` is
 * the one place it lands.
 *
 * WHEN IT IS NOT THERE. Any answer that is not one of #350's answers for that
 * route — a 404 from Pages, an HTML page, a network error — is reported as
 * `undetermined` with what was received. Nothing is assumed: not "signed out",
 * not "sent".
 *
 * NO MONEY. This page imports `lib/wallet.ts` only; `build.mjs` refuses the
 * build if `wallet-money.ts` reaches this bundle (`LOGIN_FORBIDDEN`).
 */
import { esc, short } from '../lib/format';
import { NETWORK } from '../lib/network';
import { createWallet, isWalletFailure, type WalletFailure } from '../lib/wallet';
import { freighterPort } from '../lib/wallet-freighter';

const API_BASE = '/api';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

interface Me {
  user: { id: string; email: string; createdAt: string };
  wallets: { account: string }[];
  csrfToken: string;
}

/** In memory, for the page's life. Cleared on any UNAUTHENTICATED. */
let me: Me | undefined;
let pendingEmail: string | undefined;
let connected: string | undefined;

type Answer =
  | { kind: 'json'; status: number; body: Record<string, unknown> }
  | { kind: 'undetermined'; detail: string };

async function api(path: string, init: RequestInit = {}): Promise<Answer> {
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      ...init,
      credentials: 'same-origin',
      headers: {
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(me && init.method && init.method !== 'GET' ? { 'X-Evergreen-CSRF': me.csrfToken } : {}),
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    return { kind: 'undetermined', detail: `no response (${(error as Error).message})` };
  }
  if (res.status === 202 || res.status === 204)
    return { kind: 'json', status: res.status, body: {} };
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) {
    return {
      kind: 'undetermined',
      detail: `HTTP ${res.status}, ${res.headers.get('content-type') ?? 'no content type'} — not the account service's answer`,
    };
  }
  try {
    return {
      kind: 'json',
      status: res.status,
      body: (await res.json()) as Record<string, unknown>,
    };
  } catch {
    return { kind: 'undetermined', detail: `HTTP ${res.status} with a body that is not JSON` };
  }
}

function code(a: Answer): string | undefined {
  if (a.kind !== 'json') return undefined;
  const error = a.body.error as { code?: unknown } | undefined;
  return typeof error?.code === 'string' ? error.code : undefined;
}

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
  const a = await api('/me');
  const out = $('session');
  if (a.kind === 'json' && a.status === 200) {
    me = a.body as unknown as Me;
    renderSession();
  } else if (a.kind === 'json' && (a.status === 401 || code(a) === 'UNAUTHENTICATED')) {
    me = undefined;
    out.innerHTML = note('You are not signed in.');
  } else {
    me = undefined;
    out.innerHTML = undetermined(
      'Whether you are signed in.',
      a.kind === 'undetermined' ? a.detail : `HTTP ${a.status}${code(a) ? ` ${code(a)}` : ''}`,
    );
  }
}

async function startEmail(event: Event): Promise<void> {
  event.preventDefault();
  const email = $<HTMLInputElement>('email').value.trim();
  const out = $('email-result');
  const button = $<HTMLButtonElement>('email-button');
  button.disabled = true;
  try {
    const a = await api('/auth/email/start', { method: 'POST', body: JSON.stringify({ email }) });
    if (a.kind === 'json' && a.status === 202) {
      pendingEmail = email;
      const codeForm = $('code-form');
      codeForm.hidden = false;
      // `.stack > *` sets display, which beats the `hidden` attribute.
      codeForm.style.display = '';
      out.innerHTML = note(
        `If <strong>${esc(email)}</strong> can receive mail, a code is on its way. The answer is the same whether or not an account exists.`,
      );
    } else if (code(a) === 'RATE_LIMITED') {
      out.innerHTML = note('Too many codes asked for. Wait, then try again.');
    } else {
      out.innerHTML = undetermined(
        'Whether a code was sent.',
        a.kind === 'undetermined' ? a.detail : `HTTP ${a.status}${code(a) ? ` ${code(a)}` : ''}`,
      );
    }
  } finally {
    button.disabled = false;
  }
}

async function verifyEmail(event: Event): Promise<void> {
  event.preventDefault();
  const out = $('email-result');
  const a = await api('/auth/email/verify', {
    method: 'POST',
    body: JSON.stringify({ email: pendingEmail, code: $<HTMLInputElement>('code').value.trim() }),
  });
  if (a.kind === 'json' && a.status === 200) {
    out.innerHTML = '';
    await loadMe();
  } else if (code(a) === 'CODE_INVALID') {
    out.innerHTML = note(
      'That code did not work. It may be wrong, used or expired. Ask for a new one.',
    );
  } else {
    out.innerHTML = undetermined(
      'Whether you are signed in.',
      a.kind === 'undetermined' ? a.detail : `HTTP ${a.status}${code(a) ? ` ${code(a)}` : ''}`,
    );
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
  const challenge = await api('/wallets/challenge', {
    method: 'POST',
    body: JSON.stringify({ account: connected }),
  });
  if (challenge.kind !== 'json' || challenge.status !== 200) {
    out.innerHTML = undetermined(
      'Whether a sign-in challenge can be issued.',
      challenge.kind === 'undetermined' ? challenge.detail : `HTTP ${challenge.status}`,
    );
    return;
  }
  const { challengeXdr, networkPassphrase } = challenge.body as {
    challengeXdr: string;
    networkPassphrase: string;
  };
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
  const linked = await api('/wallets', {
    method: 'POST',
    body: JSON.stringify({ challengeXdr: signed.signedXdr }),
  });
  if (linked.kind === 'json' && (linked.status === 201 || linked.status === 200)) {
    out.innerHTML = note(`Linked: <span class="mono">${esc(connected)}</span>.`);
    await loadMe();
  } else if (code(linked) === 'WALLET_LINKED_ELSEWHERE') {
    out.innerHTML = note('This wallet is already linked to a different account.');
  } else if (code(linked) === 'CHALLENGE_INVALID') {
    out.innerHTML = note('The signing request expired. Try linking again.');
  } else {
    out.innerHTML = undetermined(
      'Whether the wallet was linked.',
      linked.kind === 'undetermined' ? linked.detail : `HTTP ${linked.status}`,
    );
  }
}

$('email-form').addEventListener('submit', (e) => void startEmail(e));
$('code-form').addEventListener('submit', (e) => void verifyEmail(e));
$('connect-button').addEventListener('click', () => void connectWallet());
$('link-button').addEventListener('click', () => void linkWallet());
void loadMe();
