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
import {
  factsHtml,
  listHtml,
  nextHtml,
  panelHtml,
  recentActivityHtml,
  type AllowanceFact,
  type JobsFact,
} from '../lib/overview-view';
import { namesOf, readRecentJobs } from '../lib/recent-jobs';
import { mountExtendNow } from '../lib/extend-now-controller';
import { mountPanel, openIdFromUrl } from '../lib/panel-controller';
import { rememberedScan } from '../lib/scan-share';
import { addOutcomeHtml, addToWatchlist } from '../lib/watchlist';
import { noWatchlistSentence, rowFor, type Row, type WatchItem } from '../lib/watchlist-view';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let items: WatchItem[] = [];
const scans = new Map<string, ScanResult>();
let allowance: AllowanceFact = { kind: 'reading' };
let jobs: JobsFact = { kind: 'reading' };

const rows = (): Row[] => items.map((i) => rowFor(i, new Date(), scans.get(i.contractId)));

const bumpUsed = (id: string): void => {
  items = items.map((i) =>
    i.contractId === id && i.extendNow
      ? {
          ...i,
          extendNow: {
            ...i.extendNow,
            usedToday: i.extendNow.usedToday + 1,
            resetsAt: new Date(Date.now() + 86_400_000).toISOString(),
          },
        }
      : i,
  );
};

mountExtendNow({
  rows,
  queued: (id) => {
    bumpUsed(id);
    renderSummary();
  },
});

const panel = mountPanel({
  rows,
  renderList: (open) => ($('ov-list').innerHTML = listHtml(rows(), open)),
  panelHtml: (r) => panelHtml(r, 'overview', jobs),
  removed: (id) => {
    items = items.filter((i) => i.contractId !== id);
    if (items.length === 0) {
      $('ov-actions').hidden = true;
      show('ov-add');
    } else renderSummary();
  },
  // Not offered on the Overview panel; Contracts has it.
  renamed: (id, label) => {
    items = items.map((i) => (i.contractId === id ? { ...i, label } : i));
    renderSummary();
  },
  autopilotOff: () => undefined,
});

function show(id: 'ov-signed-out' | 'ov-add' | 'ov-summary' | undefined): void {
  for (const s of ['ov-signed-out', 'ov-add', 'ov-summary'] as const) $(s).hidden = s !== id;
}

function renderSummary(): void {
  const all = rows();
  const setup = $('ov-setup');
  const anyAuto = all.some((r) => r.item.autopilot?.enabled === true);
  setup.hidden = anyAuto;
  if (!anyAuto) {
    setup.innerHTML =
      'Autopilot is off. <a href="/dashboard/allowance/">Set an allowance and turn it on</a>. Extend now stays on the contract and says why it is disabled.';
  }
  $('ov-next').innerHTML = nextHtml(all);
  $('ov-facts').innerHTML = factsHtml(all, allowance, new Date(), jobs);
  $('ov-activity').innerHTML = recentActivityHtml(jobs, namesOf(items));
  $('ov-list').innerHTML = listHtml(all, openIdFromUrl());
  panel.render();
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
  for (const i of items) {
    const shared = rememberedScan(i.contractId);
    if (shared !== undefined) scans.set(i.contractId, shared);
  }
  show('ov-summary');
  renderSummary();
  // Contracts' "Add contract" lands here with ?add=1.
  if (new URLSearchParams(location.search).has('add')) $('add-toggle').click();

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
  const ran = readRecentJobs().then((j) => {
    jobs = j;
    renderSummary();
  });
  await Promise.all([scanned, read, ran]);
  renderSummary();
}

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
