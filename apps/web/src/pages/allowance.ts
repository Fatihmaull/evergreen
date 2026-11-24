/**
 * /allowance/ in the browser: connect, read, size, review, approve, read back,
 * turn autopilot on, revoke (PH2-E3-05, components.md § "B, C, D").
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
 * Approve stays disabled while the spender or the retry margin is unset (any
 * non-testnet build), and until a linked wallet is connected and read. Every
 * reason is printed. A disabled control here is the feature,
 * built, and not configured.
 *
 * Turn on autopilot (step D) appears only after the chain reads back exactly
 * what was signed, or reads a live allowance at least the cap. Both need the
 * spender, which only a testnet build has.
 */
import { esc, short } from '../lib/format';
import { apiRequest } from '../lib/api';
import { ENGINE_SPENDER, readAllowance, type ReadResult } from '../lib/allowance';
import {
  capContracts,
  capRows,
  capRowsHtml,
  parseLedgers,
  rowRentHtml,
  rowUsable,
  settingsProblem,
  type CapRow,
} from '../lib/allowance-candidates';
import { quoteRent, scanOne, verifiedServer, type ScanResult } from '../lib/evergreen';
import { readSession } from '../lib/login';
import type { WatchItem } from '../lib/watchlist-view';
import { createApprover } from '../lib/allowance-approve';
import {
  allowanceFactsHtml,
  allowanceNextHtml,
  type AllowanceSummary,
} from '../lib/allowance-summary';
import {
  ALLOWANCE_RETRY_MARGIN_STROOPS,
  estimateAllowanceCap,
  maxLiveUntilLedger,
  parseHostedActions,
  parseRentLines,
  refusalForApprove,
  type CapEstimate,
} from '../lib/allowance-cap';
import {
  approveOffReasons,
  autopilotOnOutcomeHtml,
  autopilotRowsHtml,
  budgetProblem,
  coverageSentence,
  defaultBudget,
  liveCovers,
  parseStroops,
  budgetFigure,
  readBack,
  readBackHtml,
  submittedHtml,
  reviewPanelHtml,
  standingLineHtml,
  type AutopilotRow,
} from '../lib/allowance-review';
import { createRevoker } from '../lib/allowance-revoke';
import { turnAutopilotOn } from '../lib/autopilot-on';
import { readAllowanceHistory } from '../lib/allowance-status';
import {
  SPENDER_UNSET_TEXT,
  approveOutcomeHtml,
  capHtml,
  reminderHtml,
  revokeOutcomeHtml,
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
let lastRead: ReadResult | undefined;
/** What the last approve asked for, kept so the read-back can compare. */
let signed: { amountStroops: bigint; liveUntilLedger: number } | undefined;
let readBackMatched = false;
/** Whether the connected wallet is one of the account's linked wallets. */
let linked = false;
let autopilotRows: { row: AutopilotRow; contractId: string; capIndex: number }[] = [];
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
    account === undefined || !linked || !approver.available || refusal !== undefined;
}

function showWhyApproveIsOff(): void {
  const reasons = approveOffReasons({
    spenderSet: ENGINE_SPENDER !== undefined,
    marginSet: ALLOWANCE_RETRY_MARGIN_STROOPS !== undefined,
    connected: account !== undefined,
    read: observedAtLedger !== undefined,
    linked,
    capNamed: cap?.amountStroops !== undefined,
  });
  $('approve-disclosure').innerHTML = reasons
    .map((reason) => `<p class="small muted">${esc(reason)}</p>`)
    .join('');
}

/** The review panel and, under it, every reason the sign button is off. */
function showReview(): void {
  $('review').innerHTML = reviewPanelHtml({
    cap,
    currentAmountStroops,
    liveUntilLedger: observedAtLedger === undefined ? undefined : liveUntilFor(observedAtLedger),
    observedAtLedger,
    spender: ENGINE_SPENDER,
  });
  showWhyApproveIsOff();
}

if (ENGINE_SPENDER === undefined) {
  $('revoke-result').innerHTML = `<p class="small muted">${esc(SPENDER_UNSET_TEXT)}</p>`;
}
showReview();

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
  await readStanding(account);
});

/** The standing line and the reminders, from one chain read and the history route. */
async function readStanding(from: string): Promise<void> {
  $('standing').innerHTML = standingLineHtml({ kind: 'reading' });
  const read = await readAllowance(from);
  lastRead = read;
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
  showSummary(from, read);
  // The history only tells a zero apart; a spender-unset read needs none.
  const history = read.kind === 'read' ? await readAllowanceHistory(from) : undefined;
  $('standing').innerHTML = standingLineHtml({
    kind: 'read',
    read,
    ...(history === undefined ? {} : { history }),
  });
  syncRevokeButton();
  syncApproveButton();
  refreshAllRows();
  showReview();
  syncAutopilotStep();
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
  linked = false;
  if (session?.kind !== 'signed-in') {
    rows = [];
    out.innerHTML =
      '<p class="small">This browser is not signed in, so no watchlist is listed. <a href="/login/">Sign in</a> to size the cap from your contracts, or enter rent by hand below.</p>';
    estimate();
    return;
  }
  if (!session.me.wallets.some((w) => w.account === connected)) {
    rows = [];
    const why =
      'This wallet is not linked to your account, so autopilot cannot name it as payer. Link it on <a href="/login/">the Sign in page</a>.';
    // Step 1 stops here: an allowance from an unlinked wallet is one nothing can use.
    $('wallet-result').insertAdjacentHTML('beforeend', `<p class="small">${why}</p>`);
    out.innerHTML = `<p class="small">${why}</p>`;
    estimate();
    return;
  }
  linked = true;
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

function extendsToCover(): bigint | undefined {
  return parseHostedActions($<HTMLInputElement>('hosted-actions').value);
}

/**
 * Redraw one row's rent cell and box in place. The inputs are left alone, so
 * a value being typed elsewhere keeps its text and focus.
 */
function refreshRow(index: number): void {
  const row = rows[index];
  const tr = $('cap-rows').querySelector<HTMLElement>(`tr[data-cap-index="${index}"]`);
  if (row === undefined || tr === null) return;
  const cell = tr.querySelector<HTMLElement>('[data-cap-rent]');
  const ends = observedAtLedger === undefined ? undefined : liveUntilFor(observedAtLedger);
  if (cell !== null)
    cell.innerHTML = rowRentHtml(row, coverageSentence(row, extendsToCover(), ends));
  const box = tr.querySelector<HTMLInputElement>('input[data-cap-row]');
  if (box !== null) {
    const usable = rowUsable(row);
    box.disabled = !usable;
    box.checked = usable && row.checked;
  }
}

function refreshAllRows(): void {
  rows.forEach((_, index) => refreshRow(index));
}

/** One scan per contract, kept, so changing Extend to re-prices without re-reading. */
const scans = new Map<string, Promise<ScanResult>>();

async function simulate(index: number): Promise<void> {
  const row = rows[index];
  if (row === undefined) return;
  const extendTo = row.extendToLedgers;
  if (settingsProblem(row) !== undefined || extendTo === undefined) {
    refreshRow(index);
    estimate();
    return;
  }
  rows[index] = { ...row, rent: { kind: 'simulating' } };
  refreshRow(index);
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
  refreshRow(index);
  estimate();
}

/** Runs on every change. Updating is not motion: the numbers replace. */
function estimate(): void {
  const result = $('estimate-result');
  const actions = extendsToCover();
  if (actions === undefined) {
    cap = undefined;
    result.innerHTML =
      '<p class="small">Enter how many extends this cap should cover, as a whole number above zero.</p>';
    afterEstimate();
    return;
  }
  const contracts = capContracts(rows, actions);
  const typed = $<HTMLTextAreaElement>('rent-lines').value;
  if (typed.trim() !== '') {
    const rents = parseRentLines(typed);
    if (!rents.ok) {
      cap = undefined;
      result.innerHTML = `<p class="small">${esc(rents.detail)}</p>`;
      afterEstimate();
      return;
    }
    for (const simulatedRentStroops of rents.rents)
      contracts.push({ simulatedRentStroops, hostedActions: actions });
  }
  if (contracts.length === 0) {
    cap = undefined;
    result.innerHTML =
      '<p class="small muted">Choose at least one contract, or enter rent by hand, to see the estimate.</p>';
    afterEstimate();
    return;
  }
  cap = estimateAllowanceCap(contracts, ALLOWANCE_RETRY_MARGIN_STROOPS);
  result.innerHTML = capHtml(cap);
  afterEstimate();
}

/**
 * After a successful approve the result takes the button's place (spec §
 * "After signing"). The button and its help come back only for a new
 * approve: a cap that is not the one just signed.
 */
function syncSignControls(): void {
  const done = signed !== undefined && cap?.amountStroops === signed.amountStroops;
  $('sign-row').hidden = done;
  $('sign-help').hidden = done;
}

function afterEstimate(): void {
  syncApproveButton();
  syncSignControls();
  showReview();
  syncAutopilotStep();
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
    refreshRow(index);
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
$('hosted-actions').addEventListener('input', () => {
  refreshAllRows();
  estimate();
});
$('rent-lines').addEventListener('input', estimate);

$('approve-button').addEventListener('click', async () => {
  if (
    account === undefined ||
    observedAtLedger === undefined ||
    currentAmountStroops === undefined ||
    cap?.amountStroops === undefined ||
    !linked ||
    !approver.available
  ) {
    return;
  }
  const terms = {
    amountStroops: cap.amountStroops,
    liveUntilLedger: liveUntilFor(observedAtLedger),
  };
  $<HTMLButtonElement>('approve-button').disabled = true;
  $('approve-result').innerHTML = '<p class="muted">Waiting for your wallet…</p>';
  const outcome = await approver.approve(account, {
    ...terms,
    observedAtLedger,
    shownCurrentStroops: currentAmountStroops,
  });
  syncApproveButton();
  if ('kind' in outcome) {
    $('approve-result').innerHTML = approveOutcomeHtml(outcome);
    return;
  }
  // Included in a ledger: read the chain back and compare with what was signed.
  signed = terms;
  syncSignControls();
  $('approve-result').innerHTML =
    submittedHtml(outcome) + '<p class="small muted">Reading the allowance back…</p>';
  await readStanding(account);
  const back = readBack(lastRead ?? { kind: 'read-failed', detail: 'not read' }, signed);
  readBackMatched = back.kind === 'matches';
  $('approve-result').innerHTML = submittedHtml(outcome) + readBackHtml(back, signed);
  syncAutopilotStep();
});

/**
 * Step D shows only after a matching read-back, or when the chain already
 * reads a live allowance at least the cap. The rows are the checked contracts
 * from step 2, with their Act below and Extend to unchanged.
 */
function syncAutopilotStep(): void {
  const section = $('autopilot-step');
  const ready =
    account !== undefined &&
    linked &&
    (readBackMatched || (lastRead !== undefined && liveCovers(lastRead, cap)));
  const actions = extendsToCover();
  if (!ready || actions === undefined) {
    section.hidden = true;
    autopilotRows = [];
    return;
  }
  const next: typeof autopilotRows = [];
  rows.forEach((r, capIndex) => {
    if (!r.checked || !rowUsable(r) || r.rent.kind !== 'ok') return;
    const budget = defaultBudget(
      r.rent.stroops,
      actions,
      ALLOWANCE_RETRY_MARGIN_STROOPS,
      cap?.amountStroops,
    );
    if (budget === undefined) return;
    next.push({
      capIndex,
      contractId: r.item.contractId,
      row: {
        contractId: r.item.contractId,
        label: r.item.label,
        thresholdLedgers: r.thresholdLedgers!,
        extendToLedgers: r.extendToLedgers!,
        ...budget,
      },
    });
  });
  if (next.length === 0) {
    section.hidden = true;
    autopilotRows = [];
    return;
  }
  autopilotRows = next;
  $('autopilot-rows').innerHTML = autopilotRowsHtml(next.map((n) => n.row));
  $('autopilot-result').innerHTML = '';
  section.hidden = false;
}

$('autopilot-button').addEventListener('click', async () => {
  if (account === undefined || !linked) return;
  const payer = account;
  const button = $<HTMLButtonElement>('autopilot-button');
  button.disabled = true;
  const table = $('autopilot-rows');
  let succeeded = 0;
  let failed = 0;
  for (const [index, entry] of autopilotRows.entries()) {
    const tr = table.querySelector<HTMLElement>(`tr[data-auto-index="${index}"]`);
    const out = tr?.querySelector<HTMLElement>('[data-auto-result]');
    const perJob = parseStroops(
      tr?.querySelector<HTMLInputElement>(`input[data-auto-per-job]`)?.value ?? '',
    );
    const per30 = parseStroops(
      tr?.querySelector<HTMLInputElement>(`input[data-auto-per-30]`)?.value ?? '',
    );
    const problem = budgetProblem(perJob, per30);
    if (problem !== undefined || perJob === undefined || per30 === undefined) {
      if (out) out.innerHTML = `<span class="crit-ink">${esc(problem ?? '')}</span>`;
      failed += 1;
      continue;
    }
    if (out) out.innerHTML = '<span class="muted">Asking the Evergreen API…</span>';
    const outcome = await turnAutopilotOn('testnet', entry.contractId, {
      payerWallet: payer,
      thresholdLedgers: entry.row.thresholdLedgers,
      extendToLedgers: entry.row.extendToLedgers,
      perJobMaxStroops: perJob,
      per30DaysMaxStroops: per30,
    });
    if (out) out.innerHTML = autopilotOnOutcomeHtml(outcome);
    if (outcome.kind === 'on') succeeded += 1;
    else failed += 1;
  }
  const summary =
    succeeded === 0
      ? `<p class="small">Autopilot was not turned on for any contract. Each row says why.</p>`
      : `<p class="small">Autopilot is on for ${succeeded} of ${succeeded + failed} ${
          succeeded + failed === 1 ? 'contract' : 'contracts'
        }.${failed > 0 ? ' The others are still off; each row says why.' : ''} <a href="/dashboard/watchlist/">Back to the watchlist →</a></p>`;
  $('autopilot-result').innerHTML = summary;
  button.disabled = false;
});

$('autopilot-rows').addEventListener('input', (ev) => {
  const field = ev.target;
  if (!(field instanceof HTMLInputElement)) return;
  if (field.dataset.autoPerJob === undefined && field.dataset.autoPer30 === undefined) return;
  const line = field.parentElement?.querySelector<HTMLElement>('[data-auto-fmt]');
  if (line) line.textContent = budgetFigure(parseStroops(field.value));
});

/**
 * `Use N`: the floor the API named for one row. The value changes where the
 * person can see it (step 2's Act below and this row), never silently.
 */
$('autopilot-rows').addEventListener('click', (ev) => {
  const target = ev.target;
  if (!(target instanceof HTMLButtonElement) || target.dataset.autoUseFloor === undefined) return;
  const floor = Number(target.dataset.autoUseFloor);
  const tr = target.closest<HTMLElement>('tr[data-auto-index]');
  const entry = autopilotRows[Number(tr?.dataset.autoIndex)];
  if (entry === undefined || !Number.isInteger(floor)) return;
  const row = rows[entry.capIndex];
  if (row === undefined) return;
  rows[entry.capIndex] = { ...row, thresholdLedgers: floor };
  const field = $('cap-rows').querySelector<HTMLInputElement>(
    `input[data-cap-threshold="${entry.capIndex}"]`,
  );
  if (field !== null) field.value = String(floor);
  refreshRow(entry.capIndex);
  estimate();
});

$('revoke-button').addEventListener('click', async () => {
  if (account === undefined || !revoker.available) return;
  $<HTMLButtonElement>('revoke-button').disabled = true;
  $('revoke-result').innerHTML = '<p class="muted">Waiting for your wallet…</p>';
  $('revoke-result').innerHTML = revokeOutcomeHtml(await revoker.revoke(account));
  syncRevokeButton();
});

/**
 * The summary at the top (components.md § Allowance): one chain read of the
 * wallet's allowance to the engine. The flow below opens by itself when
 * there is no live allowance, or when a contract sent the person here.
 */
function showSummary(wallet: string | undefined, read: ReadResult | undefined): void {
  let s: AllowanceSummary;
  if (wallet === undefined) s = { kind: 'no-wallet' };
  else if (read === undefined || read.kind !== 'read') s = { kind: 'unread', wallet };
  else {
    const { amountStroops, liveUntilLedger, observedAtLedger } = read.raw;
    const amount = BigInt(amountStroops);
    s =
      amount > 0n && liveUntilLedger !== null && liveUntilLedger > observedAtLedger
        ? { kind: 'live', wallet, amountStroops: amount, liveUntilLedger, observedAtLedger }
        : { kind: 'none', wallet };
  }
  $('al-next').innerHTML = allowanceNextHtml(s);
  // No wallet: the facts say nothing yet, so they go (DES, 2026-11-24).
  $('al-facts').hidden = s.kind === 'no-wallet';
  // Stop shows when there may be something to revoke: a live allowance, or
  // one the chain did not answer for (undetermined is not "none").
  $('stop-section').hidden = s.kind === 'no-wallet' || s.kind === 'none';
  const flow = $<HTMLDetailsElement>('al-flow');
  if (s.kind === 'none' || new URLSearchParams(location.search).has('for')) flow.open = true;
  if (wallet !== undefined) void showBalance(wallet);
}

/** The wallet's native balance, read from the chain; the cell is left out if the read fails. */
async function showBalance(wallet: string): Promise<void> {
  try {
    const server = await verifiedServer();
    const entry = (await server.getAccountEntry(wallet)) as unknown as {
      balance: bigint | number | string | (() => { toString(): string });
    };
    const raw =
      typeof entry.balance === 'function' ? entry.balance().toString() : String(entry.balance);
    if (!/^\d+$/.test(raw)) return;
    $('al-facts').innerHTML = allowanceFactsHtml(ENGINE_SPENDER, BigInt(raw));
  } catch {
    // Leave the cell out: an unread balance is never shown as zero.
  }
}

$('al-next').addEventListener('click', (ev) => {
  if (!(ev.target instanceof Element) || ev.target.closest('[data-connect]') === null) return;
  $<HTMLDetailsElement>('al-flow').open = true;
  $('connect-button').click();
});

$('al-facts').innerHTML = allowanceFactsHtml(ENGINE_SPENDER);
void readSession()
  .then((session) => (session.kind === 'signed-in' ? session.me.wallets[0]?.account : undefined))
  .catch(() => undefined)
  .then(async (wallet) => {
    if (account !== undefined) return; // the connect flow already read it
    const read =
      wallet === undefined
        ? undefined
        : await readAllowance(wallet).catch(
            (e: unknown) => ({ kind: 'read-failed', detail: String(e) }) as const,
          );
    if (account === undefined) showSummary(wallet, read);
  });
