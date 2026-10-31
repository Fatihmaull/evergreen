/**
 * /allowance/ in the browser: connect, read, revoke (PH2-E3-05).
 *
 * Imports `wallet-money.ts` (through `allowance-revoke.ts`), so this is not a
 * login page and must never be flagged as one (`LOGIN_FORBIDDEN`).
 * Nothing is stored: no browser storage of any kind.
 */
import { esc, short } from '../lib/format';
import { ENGINE_SPENDER, readAllowance } from '../lib/allowance';
import { createRevoker } from '../lib/allowance-revoke';
import { SPENDER_UNSET_TEXT, readHtml, revokeOutcomeHtml } from '../lib/allowance-view';
import { createWallet, isWalletFailure } from '../lib/wallet';
import { freighterPort } from '../lib/wallet-freighter';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const wallet = createWallet(freighterPort());
const revoker = createRevoker({ wallet });
let account: string | undefined;

function syncRevokeButton(): void {
  $<HTMLButtonElement>('revoke-button').disabled = account === undefined || !revoker.available;
}

if (ENGINE_SPENDER === undefined) {
  $('revoke-result').innerHTML = `<p class="small muted">${esc(SPENDER_UNSET_TEXT)}</p>`;
}

$('connect-button').addEventListener('click', async () => {
  const connected = await wallet.connect();
  if (isWalletFailure(connected)) {
    $('wallet-result').innerHTML = revokeOutcomeHtml(connected);
    return;
  }
  const net = await wallet.assertTestnet();
  if (net !== true) {
    $('wallet-result').innerHTML = revokeOutcomeHtml(net);
    return;
  }
  account = connected.account;
  $('wallet-result').innerHTML = `<p class="small">Connected <span class="mono" title="${esc(
    account,
  )}">${esc(short(account))}</span>.</p>`;
  $('allowance-read').innerHTML = '<p class="muted">Reading the chain…</p>';
  $('allowance-read').innerHTML = readHtml(await readAllowance(account));
  syncRevokeButton();
});

$('revoke-button').addEventListener('click', async () => {
  if (account === undefined || !revoker.available) return;
  $<HTMLButtonElement>('revoke-button').disabled = true;
  $('revoke-result').innerHTML = '<p class="muted">Waiting for your wallet…</p>';
  $('revoke-result').innerHTML = revokeOutcomeHtml(await revoker.revoke(account));
  syncRevokeButton();
});
