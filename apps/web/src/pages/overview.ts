/**
 * Overview (components.md § "Dashboard revamp"). One `GET /watchlist` picks
 * the state: signed out, signed in with nothing watched, or the summary.
 * Then, for the summary, this browser reads the chain for rows the engine
 * has not observed yet, and the allowance of the payer (or the first linked
 * wallet) to the engine. The side panel is driven by `?c=<contractId>`.
 */
import { readAllowance, type ReadResult } from '../lib/allowance';
import { apiRequest } from '../lib/api';
import { isValidContractId, scanOne, type ScanResult } from '../lib/evergreen';
import { readSession } from '../lib/login';
import { factsHtml, listHtml, nextHtml, panelHtml, type AllowanceFact } from '../lib/overview-view';
import { addOutcomeHtml, addToWatchlist, removeFromWatchlist } from '../lib/watchlist';
import {
  noWatchlistSentence,
  removeOutcomeText,
  rowFor,
  type Row,
  type WatchItem,
} from '../lib/watchlist-view';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let items: WatchItem[] = [];
const scans = new Map<string, ScanResult>();
let allowance: AllowanceFact = { kind: 'reading' };

const rows = (): Row[] => items.map((i) => rowFor(i, new Date(), scans.get(i.contractId)));
const openId = (): string | undefined => new URLSearchParams(location.search).get('c') ?? undefined;

function show(id: 'ov-signed-out' | 'ov-add' | 'ov-summary' | undefined): void {
  for (const s of ['ov-signed-out', 'ov-add', 'ov-summary'] as const) $(s).hidden = s !== id;
}

function renderSummary(): void {
  const all = rows();
  const open = openId();
  $('ov-next').innerHTML = nextHtml(all);
  $('ov-facts').innerHTML = factsHtml(all, allowance);
  $('ov-list').innerHTML = listHtml(all, open);
  renderPanel(all, open);
}

function renderPanel(all: readonly Row[], open: string | undefined): void {
  const panel = $('side-panel');
  const row = open === undefined ? undefined : all.find((r) => r.item.contractId === open);
  if (row === undefined) {
    panel.hidden = true;
    panel.innerHTML = '';
    document.body.classList.remove('panel-open');
    return;
  }
  panel.innerHTML = panelHtml(row);
  panel.setAttribute('aria-label', row.item.label ?? row.item.contractId);
  panel.hidden = false;
  document.body.classList.add('panel-open');
}

/** Opening is a URL change, so a reload or a shared link reopens the same panel. */
function setOpen(id: string | undefined): void {
  const url = new URL(location.href);
  if (id === undefined) url.searchParams.delete('c');
  else url.searchParams.set('c', id);
  history.replaceState(null, '', url);
  const all = rows();
  $('ov-list').innerHTML = listHtml(all, id);
  renderPanel(all, id);
  if (id !== undefined) $('side-panel').querySelector<HTMLElement>('[data-panel-close]')?.focus();
}

function toggle(id: string): void {
  setOpen(openId() === id ? undefined : id);
}

function fromRead(wallet: string, read: ReadResult): AllowanceFact {
  if (read.kind !== 'read') return { kind: 'unread' };
  const { amountStroops, liveUntilLedger, observedAtLedger } = read.raw;
  const amount = BigInt(amountStroops);
  if (amount > 0n && liveUntilLedger !== null && liveUntilLedger > observedAtLedger)
    return { kind: 'live', wallet, amountStroops: amount, liveUntilLedger, observedAtLedger };
  return { kind: 'none', wallet };
}

async function load(): Promise<void> {
  const outcome = await apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).catch(
    () => ({ kind: 'unavailable', reason: 'network' }) as const,
  );
  const status = $('ov-status');
  if (outcome.kind === 'error' && outcome.code === 'UNAUTHENTICATED') {
    status.hidden = true;
    $('ov-heading').textContent = 'What expires first, read from the chain';
    show('ov-signed-out');
    return;
  }
  if (outcome.kind !== 'ok' || !Array.isArray(outcome.data?.items)) {
    // About the API, not any contract: the sentence the Contracts screen uses.
    status.innerHTML = noWatchlistSentence(outcome);
    show('ov-signed-out');
    $('ov-heading').textContent = 'What expires first, read from the chain';
    return;
  }
  status.hidden = true;
  items = outcome.data.items as WatchItem[];
  if (items.length === 0) {
    show('ov-add');
    return;
  }
  $('ov-actions').hidden = false;
  $('add-h').textContent = 'Add a contract';
  show('ov-summary');
  renderSummary();

  // Rows the engine has not observed yet: this browser reads their expiry.
  const pending = items.filter((i) => i.lastObservation === null && i.network === 'testnet');
  const scanned = Promise.all(
    pending.map((i) =>
      scanOne(i.contractId, 'dataKeys' in i.scope ? (i.scope.dataKeys as readonly string[]) : [])
        .then((s) => void scans.set(i.contractId, s))
        .catch(() => undefined),
    ),
  );

  // The allowance: the payer autopilot names, else the first linked wallet.
  const payer = items
    .map((i) => (i.autopilot?.enabled === true ? i.autopilot.payerWallet : undefined))
    .find((p): p is string => typeof p === 'string');
  const wallet =
    payer ??
    (await readSession()
      .then((s) => (s.kind === 'signed-in' ? s.me.wallets[0]?.account : undefined))
      .catch(() => undefined));
  const read =
    wallet === undefined
      ? Promise.resolve((allowance = { kind: 'no-wallet' }))
      : readAllowance(wallet)
          .catch((e: unknown) => ({ kind: 'read-failed', detail: String(e) }) as const)
          .then((r) => (allowance = fromRead(wallet, r)));
  await Promise.all([scanned, read]);
  renderSummary();
}

// Rows and Open: the whole row opens the panel; clicking the open row closes it.
document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!(t instanceof HTMLElement)) return;
  if (t.closest('[data-panel-close]')) {
    setOpen(undefined);
    return;
  }
  const opener = t.closest<HTMLElement>('[data-open]');
  if (opener !== null && opener.closest('a') === null) {
    toggle(opener.dataset.open ?? '');
    return;
  }
  const remove = t.closest<HTMLButtonElement>('button[data-remove]');
  if (remove !== null && !remove.disabled) {
    const id = remove.dataset.remove ?? '';
    const out = remove.parentElement?.querySelector<HTMLElement>('[data-remove-status]');
    remove.disabled = true;
    if (out) out.textContent = 'Asking the Evergreen API…';
    void removeFromWatchlist('testnet', id)
      .catch(() => ({ kind: 'unavailable', reason: 'network' }) as const)
      .then((o) => {
        const text = removeOutcomeText(o);
        if (text === undefined) {
          items = items.filter((i) => i.contractId !== id);
          setOpen(undefined);
          if (items.length === 0) {
            $('ov-actions').hidden = true;
            show('ov-add');
          } else renderSummary();
          return;
        }
        remove.disabled = false;
        if (out) out.textContent = text;
      });
  }
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && openId() !== undefined) {
    setOpen(undefined);
    return;
  }
  const t = ev.target;
  if (
    (ev.key === 'Enter' || ev.key === ' ') &&
    t instanceof HTMLTableRowElement &&
    t.dataset.open
  ) {
    ev.preventDefault();
    toggle(t.dataset.open);
  }
});

$('add-toggle').addEventListener('click', () => {
  const add = $('ov-add');
  add.hidden = !add.hidden;
  $('add-toggle').setAttribute('aria-expanded', String(!add.hidden));
  if (!add.hidden) $<HTMLInputElement>('add-id').focus();
});

$('add-form').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const id = $<HTMLInputElement>('add-id').value.trim();
  const label = $<HTMLInputElement>('add-label').value.trim();
  const out = $('add-result');
  if (!isValidContractId(id)) {
    out.innerHTML = `<p class="note">That is not a contract ID. A contract ID starts with C and is 56 characters.</p>`;
    return;
  }
  const button = $<HTMLButtonElement>('add-button');
  button.disabled = true;
  out.innerHTML = '<p class="note">Asking the Evergreen API…</p>';
  void addToWatchlist({
    network: 'testnet',
    contractId: id,
    scope: { noDataKeys: true },
    ...(label === '' ? {} : { label }),
  })
    .catch(() => ({ kind: 'unavailable', reason: 'network' }) as const)
    .then((o) => {
      button.disabled = false;
      out.innerHTML = addOutcomeHtml(o, id);
      if (o.kind === 'added' || o.kind === 'already-present') {
        // Reload the summary from the API so the new row is the API's, not ours.
        location.assign(`/dashboard/?c=${encodeURIComponent(id)}`);
      }
    });
});

void load();
