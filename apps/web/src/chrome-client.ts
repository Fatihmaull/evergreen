/**
 * The only script the shell loads on every page: fill in the live ledger in
 * the status bar, on a phone bring the active nav item into view, and label
 * the sign-in item "Account" when a session exists. No SDK, no core, nothing
 * signed.
 *
 * TWO READS, not one, and the first is the network. A URL that says testnet
 * proves nothing about what it serves, and this script runs on every page of a
 * site whose footer says "Testnet only." A ledger number from another network rendered under that
 * sentence is the product's own failure mode — a confident figure with nothing
 * behind it. Rakha found the gap on #345.
 *
 * The URL and the expected passphrase arrive as `define`d literals rather than
 * through `lib/network.ts`, which would pull `resolveNetwork` and core's
 * network table into this bundle: that took it from 495 B to 1.3 KB, and made
 * the first line of this comment false. `build.mjs` reads both from
 * `packages/core/src/networks.ts` and refuses if that file moves, so there is
 * still no passphrase typed anywhere in `apps/`.
 */
import { glossaryHtml } from './lib/glossary';

declare const __EVERGREEN_RPC_URL__: string;
declare const __EVERGREEN_PASSPHRASE__: string;

const RPC_URL = typeof __EVERGREEN_RPC_URL__ === 'undefined' ? '' : __EVERGREEN_RPC_URL__;
const PASSPHRASE = typeof __EVERGREEN_PASSPHRASE__ === 'undefined' ? '' : __EVERGREEN_PASSPHRASE__;

async function call(method: string): Promise<unknown> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: method, method }),
  });
  return ((await response.json()) as { result?: unknown }).result;
}

async function fillLiveLedger(): Promise<void> {
  const slot = document.querySelector('[data-live-ledger]');
  if (!slot) return;
  try {
    const network = (await call('getNetwork')) as { passphrase?: string } | undefined;
    if (network?.passphrase !== PASSPHRASE) {
      // Say which failure this is. "unavailable" would read as a flaky RPC and
      // send someone looking in the wrong place for an afternoon.
      slot.textContent = 'wrong network';
      return;
    }
    const health = (await call('getHealth')) as { latestLedger?: number } | undefined;
    const latest = health?.latestLedger;
    if (typeof latest !== 'number') throw new Error('no latestLedger in response');
    slot.textContent = latest.toLocaleString('en-US');
  } catch {
    slot.textContent = 'unavailable';
  }
}

/**
 * Below 960px the sidebar nav is one strip that scrolls sideways. It opened at
 * its left end on every page, so on Watchlist, Alerts or Allowance the item
 * marking where you are was off screen. Centre it in the strip. The strip
 * scrolls only itself, never the page, and on a desktop (no overflow) this
 * does nothing.
 */
function revealActiveNavItem(): void {
  const active = document.querySelector<HTMLElement>('.sidebar nav .nav-item.active');
  const strip = active?.closest('nav');
  if (!active || !strip || strip.scrollWidth <= strip.clientWidth) return;
  const item = active.getBoundingClientRect();
  const box = strip.getBoundingClientRect();
  strip.scrollLeft += item.left - box.left - (box.width - item.width) / 2;
}

/**
 * The nav says "Sign in" in the static page. Signed in, the same page is where
 * you sign out and manage wallets, so the item reads "Account" (coordinator,
 * 2026-11-23). One `GET /me`, only on pages that carry that item. Anything but
 * a 200 with a session body leaves "Sign in": a failed read is not a session.
 */
async function labelAccountItem(): Promise<void> {
  const item = document.querySelector<HTMLElement>('.sidebar a.nav-item[href="/login/"]');
  if (!item) return;
  try {
    const res = await fetch('/api/v1/me', {
      credentials: 'same-origin',
      headers: { Accept: 'application/json' },
    });
    if (res.status !== 200) return;
    const body = (await res.json()) as { csrfToken?: unknown } | null;
    if (typeof body?.csrfToken === 'string' && body.csrfToken !== '') item.textContent = 'Account';
  } catch {
    // Leave "Sign in".
  }
}

function wireDrawer(): void {
  const toggle = document.querySelector<HTMLButtonElement>('.nav-toggle');
  const backdrop = document.querySelector<HTMLElement>('.nav-backdrop');
  if (!toggle) return;
  const set = (open: boolean): void => {
    document.body.classList.toggle('nav-open', open);
    toggle.setAttribute('aria-expanded', String(open));
    if (backdrop) backdrop.hidden = !open;
  };
  toggle.addEventListener('click', () => set(!document.body.classList.contains('nav-open')));
  backdrop?.addEventListener('click', () => set(false));
  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') set(false);
  });
}

const glossary = document.getElementById('glossary-slot');
if (glossary) glossary.innerHTML = glossaryHtml();

wireDrawer();
revealActiveNavItem();
void fillLiveLedger();
void labelAccountItem();
