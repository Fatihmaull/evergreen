/**
 * /allowance/ in the browser: connect, read, estimate, approve, revoke (PH2-E3-05).
 *
 * The cap is prefilled from the watchlist (components.md § "B, C, D"): the
 * contracts this wallet can pay for, `?for=` first and checked, each with its
 * rent for one extend simulated in this browser. Typed rent is the fallback,
 * under "Enter rent by hand".
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
import { apiRequest } from '../lib/api';
import { ENGINE_SPENDER, readAllowance } from '../lib/allowance';
import {
  capContracts,
  capRows,
  capRowsHtml,
  parseLedgers,
  settingsProblem,
  type CapRow,
} from '../lib/allowance-candidates';
import { quoteRent, scanOne, type ScanResult } from '../lib/evergreen';
import { readSession } from '../lib/login';
import type { WatchItem } from '../lib/watchlist-view';
import { createApprover } from '../lib/allowance-approve';
import {
  ALLOWANCE_RETRY_MARGIN_STROOPS,
  estimateAllowanceCap,
  maxLiveUntilLedger,
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
let rows: CapRow[] = [];
const forContract = new URLSearchParams(window.location.search).get('for') ?? undefined;

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
  void loadCapRows(account);
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

/**
 * The watchlist rows this wallet can pay for, then one rent simulation per row.
 * Signed out, or a wallet that is not linked, lists nothing and says why: an
 * allowance from an unlinked wallet is one autopilot cannot name as payer.
 */
async function loadCapRows(connected: string): Promise<void> {
  const out = $('cap-rows');
  out.innerHTML = '<p class="small muted">Asking the Evergreen API…</p>';
  const [session, listed] = await Promise.all([
    readSession().catch(() => undefined),
    apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).catch(() => undefined),
  ]);
  if (session?.kind !== 'signed-in') {
    rows = [];
    out.innerHTML =
      '<p class="small">This browser is not signed in, so no watchlist is listed. <a href="/login/">Sign in</a> to size the cap from your contracts, or enter rent by hand below.</p>';
    estimate();
    return;
  }
  if (!session.me.wallets.some((w) => w.account === connected)) {
    rows = [];
    out.innerHTML =
      '<p class="small">This wallet is not linked to your account, so autopilot cannot name it as payer. Link it on <a href="/login/">the Sign in page</a>.</p>';
    estimate();
    return;
  }
  if (listed === undefined || listed.kind !== 'ok' || !Array.isArray(listed.data?.items)) {
    rows = [];
    out.innerHTML =
      '<p class="small">The watchlist could not be read, so no contract is listed. You can enter rent by hand below.</p>';
    estimate();
    return;
  }
  rows = capRows(listed.data.items as WatchItem[], connected, forContract);
  out.innerHTML = capRowsHtml(rows);
  await Promise.all(rows.map((_, index) => simulate(index)));
}

/** One scan per contract, kept, so changing Extend to re-prices without re-reading. */
const scans = new Map<string, Promise<ScanResult>>();

async function simulate(index: number): Promise<void> {
  const row = rows[index];
  if (row === undefined) return;
  const extendTo = row.extendToLedgers;
  if (settingsProblem(row) !== undefined || extendTo === undefined) {
    $('cap-rows').innerHTML = capRowsHtml(rows);
    estimate();
    return;
  }
  rows[index] = { ...row, rent: { kind: 'simulating' } };
  $('cap-rows').innerHTML = capRowsHtml(rows);
  let rent: CapRow['rent'];
  try {
    const id = row.item.contractId;
    if (!scans.has(id)) {
      const keys = 'dataKeys' in row.item.scope ? row.item.scope.dataKeys : [];
      scans.set(id, scanOne(id, keys));
    }
    const quote = await quoteRent(await scans.get(id)!, extendTo);
    rent =
      quote.excluded.length > 0
        ? { kind: 'partial', excluded: quote.excluded.length }
        : { kind: 'ok', stroops: BigInt(quote.totalRentStroops), atLedger: quote.pricedAtLedger };
  } catch {
    scans.delete(row.item.contractId);
    rent = { kind: 'failed' };
  }
  // A newer Extend to may have been typed while this one was pricing.
  if (rows[index]?.extendToLedgers !== extendTo) return;
  rows[index] = { ...rows[index]!, rent };
  $('cap-rows').innerHTML = capRowsHtml(rows);
  estimate();
}

/** Runs on every change. Updating is not motion: the numbers replace. */
function estimate(): void {
  const result = $('estimate-result');
  const actions = parseHostedActions($<HTMLInputElement>('hosted-actions').value);
  if (actions === undefined) {
    cap = undefined;
    result.innerHTML =
      '<p class="small">Enter how many extends this cap should cover, as a whole number above zero.</p>';
    syncApproveButton();
    showDisclosure();
    return;
  }
  const contracts = capContracts(rows, actions);
  const typed = $<HTMLTextAreaElement>('rent-lines').value;
  if (typed.trim() !== '') {
    const rents = parseRentLines(typed);
    if (!rents.ok) {
      cap = undefined;
      result.innerHTML = `<p class="small">${esc(rents.detail)}</p>`;
      syncApproveButton();
      showDisclosure();
      return;
    }
    for (const simulatedRentStroops of rents.rents)
      contracts.push({ simulatedRentStroops, hostedActions: actions });
  }
  if (contracts.length === 0) {
    cap = undefined;
    result.innerHTML =
      '<p class="small muted">Choose at least one contract, or enter rent by hand, to see the estimate.</p>';
    syncApproveButton();
    showDisclosure();
    return;
  }
  cap = estimateAllowanceCap(contracts, ALLOWANCE_RETRY_MARGIN_STROOPS);
  result.innerHTML = capHtml(cap);
  syncApproveButton();
  showDisclosure();
}

$('cap-rows').addEventListener('change', (ev) => {
  const field = ev.target;
  if (!(field instanceof HTMLInputElement)) return;
  if (field.dataset.capRow !== undefined) {
    const index = Number(field.dataset.capRow);
    const row = rows[index];
    if (row === undefined) return;
    rows[index] = { ...row, checked: field.checked };
    estimate();
    return;
  }
  if (field.dataset.capThreshold !== undefined) {
    const index = Number(field.dataset.capThreshold);
    const row = rows[index];
    if (row === undefined) return;
    rows[index] = { ...row, thresholdLedgers: parseLedgers(field.value) };
    // Act below does not change the rent of one extend, only whether the row is usable.
    $('cap-rows').innerHTML = capRowsHtml(rows);
    estimate();
    return;
  }
  if (field.dataset.capExtendTo !== undefined) {
    const index = Number(field.dataset.capExtendTo);
    const row = rows[index];
    if (row === undefined) return;
    rows[index] = { ...row, extendToLedgers: parseLedgers(field.value) };
    void simulate(index);
  }
});
$('hosted-actions').addEventListener('input', estimate);
$('rent-lines').addEventListener('input', estimate);

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
