/**
 * TTL decay (`/dashboard/decay/`). One `GET /watchlist`; this browser reads
 * the chain for rows the engine has not observed yet, as Overview does. The
 * charted row is `?c=` (else the one needing attention first).
 */
import { apiRequest } from '../lib/api';
import { bigChartHtml, selectedRow, stripsHtml } from '../lib/decay-view';
import { scanOne, type ScanResult } from '../lib/evergreen';
import { noWatchlistSentence, rowFor, type Row, type WatchItem } from '../lib/watchlist-view';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let items: WatchItem[] = [];
const scans = new Map<string, ScanResult>();
const rows = (): Row[] => items.map((i) => rowFor(i, new Date(), scans.get(i.contractId)));
const openId = (): string | undefined => new URLSearchParams(location.search).get('c') ?? undefined;

function render(): void {
  const all = rows();
  const sel = selectedRow(all, openId());
  if (sel === undefined) return;
  $('td-chart').innerHTML = bigChartHtml(sel);
  $('td-chart').hidden = false;
  $('td-strips').innerHTML = stripsHtml(all, sel.item.contractId);
  $('td-all').hidden = false;
}

function select(id: string): void {
  const url = new URL(location.href);
  url.searchParams.set('c', id);
  history.replaceState(null, '', url);
  render();
}

async function load(): Promise<void> {
  const outcome = await apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).catch(
    () => ({ kind: 'unavailable', reason: 'network' }) as const,
  );
  const status = $('td-status');
  if (outcome.kind === 'error' && outcome.code === 'UNAUTHENTICATED') {
    status.innerHTML =
      '<a href="/login/">Sign in</a> to chart your watched contracts. <a href="/dashboard/scanner/">The scanner</a> needs no session.';
    return;
  }
  if (outcome.kind !== 'ok' || !Array.isArray(outcome.data?.items)) {
    status.innerHTML = noWatchlistSentence(outcome);
    return;
  }
  items = (outcome.data.items as WatchItem[]).filter((i) => i.network === 'testnet');
  if (items.length === 0) {
    status.innerHTML =
      'Nothing watched yet. <a href="/dashboard/?add=1">Add a contract</a> to chart how its TTL runs down.';
    return;
  }
  status.hidden = true;
  render();
  const pending = items.filter((i) => i.lastObservation === null);
  await Promise.all(
    pending.map((i) =>
      scanOne(i.contractId, 'dataKeys' in i.scope ? (i.scope.dataKeys as readonly string[]) : [])
        .then((s) => void scans.set(i.contractId, s))
        .catch(() => undefined),
    ),
  );
  if (pending.length > 0) render();
}

document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  const row = t.closest<HTMLElement>('li[data-open]');
  if (row !== null && t.closest('a') === null) select(row.dataset.open ?? '');
});

document.addEventListener('keydown', (ev) => {
  const t = ev.target;
  if (
    (ev.key === 'Enter' || ev.key === ' ') &&
    t instanceof HTMLElement &&
    t.matches('li[data-open]')
  ) {
    ev.preventDefault();
    select(t.dataset.open ?? '');
  }
});

void load();
