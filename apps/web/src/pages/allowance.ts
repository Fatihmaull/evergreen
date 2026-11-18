/**
 * /allowance/ in the browser: connect, read, estimate, approve, revoke (PH2-E3-05).
 *
 * Imports `wallet-money.ts` (through the approve and revoke modules), so this is
 * not a login page and must never be flagged as one (`LOGIN_FORBIDDEN`).
 * Nothing is stored: no browser storage of any kind.
 *
 * Approve stays disabled while the spender is unpublished or the safety margin
 * is unset. Both reasons are printed. A disabled control here is the feature,
 * built, and not configured.
 */
import { esc, short } from '../lib/format';
import { ENGINE_SPENDER, readAllowance } from '../lib/allowance';
import { createApprover } from '../lib/allowance-approve';
import {
  ALLOWANCE_RETRY_MARGIN_STROOPS,
  actionFitsBudget,
  estimateAllowanceCap,
  maxLiveUntilLedger,
  parseBudgetLines,
  parseHostedActions,
  parseRentLines,
  refusalForApprove,
  type CapEstimate,
} from '../lib/allowance-cap';
import { createRevoker } from '../lib/allowance-revoke';
import { readAllowanceHistory } from '../lib/allowance-status';
import {
  SPENDER_UNSET_TEXT,
  approveDisclosureHtml,
  approveOutcomeHtml,
  capHtml,
  readHtml,
  reminderHtml,
  revokeOutcomeHtml,
  standingHtml,
} from '../lib/allowance-view';
import { createWallet, isWalletFailure } from '../lib/wallet';
import { freighterPort } from '../lib/wallet-freighter';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const wallet = createWallet(freighterPort());
const revoker = createRevoker({ wallet });
const approver = createApprover({ wallet });
let account: string | undefined;
let observedAtLedger: number | undefined;
let currentAmountStroops: string | undefined;
let cap: CapEstimate | undefined;

function liveUntilFor(observed: number): number {
  return maxLiveUntilLedger(observed);
}

function syncRevokeButton(): void {
  $<HTMLButtonElement>('revoke-button').disabled = account === undefined || !revoker.available;
}

function syncApproveButton(): void {
  const amount = cap?.amountStroops;
  const expiry = observedAtLedger === undefined ? undefined : liveUntilFor(observedAtLedger);
  const refusal = refusalForApprove({
    spender: ENGINE_SPENDER,
    amountStroops: amount,
    liveUntilLedger: expiry ?? 0,
    observedAtLedger: observedAtLedger ?? 0,
  });
  $<HTMLButtonElement>('approve-button').disabled =
    account === undefined || !approver.available || refusal !== undefined;
}

function showWhyApproveIsOff(): void {
  const reasons: string[] = [];
  if (ENGINE_SPENDER === undefined) reasons.push(SPENDER_UNSET_TEXT);
  if (cap?.amountStroops === undefined) {
    reasons.push(
      'The safety margin is not set, so this page will not name an allowance amount and will not ask you to sign one.',
    );
  }
  if (account !== undefined && observedAtLedger === undefined && ENGINE_SPENDER !== undefined) {
    reasons.push(
      'The allowance has not been read, so the expiry ledger and its date are not known.',
    );
  }
  $('approve-disclosure').innerHTML = reasons
    .map((reason) => `<p class="small muted">${esc(reason)}</p>`)
    .join('');
}

if (ENGINE_SPENDER === undefined) {
  $('revoke-result').innerHTML = `<p class="small muted">${esc(SPENDER_UNSET_TEXT)}</p>`;
}
showWhyApproveIsOff();

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
  const read = await readAllowance(account);
  $('allowance-read').innerHTML = readHtml(read);
  if (read.kind === 'read') {
    observedAtLedger = read.raw.observedAtLedger;
    currentAmountStroops = read.raw.amountStroops;
    $('reminders').innerHTML =
      read.raw.liveUntilLedger === null
        ? reminderHtml(undefined)
        : reminderHtml({
            liveUntilLedger: read.raw.liveUntilLedger,
            observedAtLedger: read.raw.observedAtLedger,
          });
  } else {
    observedAtLedger = undefined;
    currentAmountStroops = undefined;
    $('reminders').innerHTML = reminderHtml(undefined);
  }
  $('allowance-history').innerHTML = standingHtml(await readAllowanceHistory(account));
  syncRevokeButton();
  syncApproveButton();
  showDisclosure();
});

function showDisclosure(): void {
  const amount = cap?.amountStroops;
  if (
    amount === undefined ||
    ENGINE_SPENDER === undefined ||
    observedAtLedger === undefined ||
    currentAmountStroops === undefined ||
    cap === undefined
  ) {
    showWhyApproveIsOff();
    return;
  }
  $('approve-disclosure').innerHTML = approveDisclosureHtml({
    amountStroops: amount,
    spender: ENGINE_SPENDER,
    liveUntilLedger: liveUntilFor(observedAtLedger),
    observedAtLedger,
    currentAmountStroops,
    rentStroops: cap.rentStroops,
    feeStroops: cap.feeStroops,
  });
}

$('estimate-button').addEventListener('click', () => {
  const rents = parseRentLines($<HTMLTextAreaElement>('rent-lines').value);
  if (!rents.ok) {
    cap = undefined;
    $('estimate-result').innerHTML = `<p class="small">${esc(rents.detail)}</p>`;
    syncApproveButton();
    showDisclosure();
    return;
  }
  const actions = parseHostedActions($<HTMLInputElement>('hosted-actions').value);
  if (actions === undefined) {
    cap = undefined;
    $('estimate-result').innerHTML =
      '<p class="small">Enter how many hosted extends this cap should cover, as a whole number above zero.</p>';
    syncApproveButton();
    showDisclosure();
    return;
  }
  const budgets = parseBudgetLines(
    $<HTMLTextAreaElement>('budget-lines').value,
    rents.rents.length,
  );
  if (!budgets.ok) {
    cap = undefined;
    $('estimate-result').innerHTML = `<p class="small">${esc(budgets.detail)}</p>`;
    syncApproveButton();
    showDisclosure();
    return;
  }
  cap = estimateAllowanceCap(
    rents.rents.map((simulatedRentStroops) => ({ simulatedRentStroops, hostedActions: actions })),
    ALLOWANCE_RETRY_MARGIN_STROOPS,
  );
  const fits =
    budgets.budgets === undefined
      ? []
      : rents.rents.map((rent, index) =>
          actionFitsBudget(budgets.budgets?.[index] ?? 0n, rent, ALLOWANCE_RETRY_MARGIN_STROOPS),
        );
  $('estimate-result').innerHTML = capHtml(cap, fits);
  syncApproveButton();
  showDisclosure();
});

$('approve-button').addEventListener('click', async () => {
  if (
    account === undefined ||
    observedAtLedger === undefined ||
    currentAmountStroops === undefined ||
    !approver.available
  ) {
    return;
  }
  $<HTMLButtonElement>('approve-button').disabled = true;
  $('approve-result').innerHTML = '<p class="muted">Waiting for your wallet…</p>';
  $('approve-result').innerHTML = approveOutcomeHtml(
    await approver.approve(account, {
      amountStroops: cap?.amountStroops,
      liveUntilLedger: liveUntilFor(observedAtLedger),
      observedAtLedger,
      shownCurrentStroops: currentAmountStroops,
    }),
  );
  syncApproveButton();
});

$('revoke-button').addEventListener('click', async () => {
  if (account === undefined || !revoker.available) return;
  $<HTMLButtonElement>('revoke-button').disabled = true;
  $('revoke-result').innerHTML = '<p class="muted">Waiting for your wallet…</p>';
  $('revoke-result').innerHTML = revokeOutcomeHtml(await revoker.revoke(account));
  syncRevokeButton();
});
