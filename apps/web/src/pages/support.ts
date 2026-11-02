/**
 * /support/ in the browser: connect, type an amount, send, receipt (PH2-E3-07).
 *
 * Imports `wallet-money.ts` (through `support.ts`), so it is never a login page.
 * Nothing is stored. The send control is not shown while the treasury is unset
 * (`claims-and-copy.md`: no disabled control stands in for a missing feature).
 */
import { esc } from '../lib/format';
import { TREASURY_ADDRESS, createTipper, parseXlmAmount } from '../lib/support';
import { TREASURY_UNSET_TEXT, tipOutcomeHtml } from '../lib/support-view';
import { createWallet, isWalletFailure } from '../lib/wallet';
import { freighterPort } from '../lib/wallet-freighter';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const wallet = createWallet(freighterPort());
const tipper = createTipper({ wallet });
let account: string | undefined;

if (TREASURY_ADDRESS === undefined) {
  $('send-button').hidden = true;
  $('amount-input').hidden = true;
  $('send-result').innerHTML = `<p class="small muted">${esc(TREASURY_UNSET_TEXT)}</p>`;
} else {
  $('treasury').textContent = TREASURY_ADDRESS;
}

$('connect-button').addEventListener('click', async () => {
  const connected = await wallet.connect();
  if (isWalletFailure(connected)) {
    $('wallet-result').innerHTML = tipOutcomeHtml(connected);
    return;
  }
  const net = await wallet.assertTestnet();
  if (net !== true) {
    $('wallet-result').innerHTML = tipOutcomeHtml(net);
    return;
  }
  account = connected.account;
  $('wallet-result').innerHTML =
    `<p class="small">Connected <span class="mono">${esc(account)}</span>.</p>`;
});

$('send-button').addEventListener('click', async () => {
  if (account === undefined) {
    $('send-result').innerHTML = '<p class="small muted">Connect a wallet first.</p>';
    return;
  }
  if (!tipper.available || TREASURY_ADDRESS === undefined) return;
  const input = $<HTMLInputElement>('amount-input').value;
  const parsed = parseXlmAmount(input);
  $<HTMLButtonElement>('send-button').disabled = true;
  $('send-result').innerHTML = '<p class="muted">Waiting for your wallet…</p>';
  const outcome = await tipper.send(account, input);
  $('send-result').innerHTML = tipOutcomeHtml(
    outcome,
    parsed.ok ? { stroops: parsed.stroops, to: TREASURY_ADDRESS } : undefined,
  );
  $<HTMLButtonElement>('send-button').disabled = !tipper.available;
});
