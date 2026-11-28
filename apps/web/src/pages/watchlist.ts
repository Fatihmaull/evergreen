/**
 * Contracts (`/dashboard/watchlist/`). One `GET /watchlist`, this browser's
 * chain read for rows the engine has not observed yet, filters in the URL
 * (`?state=`), and the shared side panel (`?c=`). Remove and Turn off live in
 * the panel (`panel-controller.ts`); turning on goes to /allowance/, where
 * the wallet signs (components.md § A).
 */
import { apiRequest } from '../lib/api';
import { scanOne, type ScanResult } from '../lib/evergreen';
import { rememberedScan, rememberScan } from '../lib/scan-share';
import { signedOutDemoHtml } from '../lib/signed-out-demo';
import { formatCount } from '../lib/format';
import {
  filtersHtml,
  listHtml,
  matchesFilter,
  panelHtml,
  type JobsFact,
  type StateFilter,
} from '../lib/overview-view';
import { readRecentJobs } from '../lib/recent-jobs';
import { mountExtendNow } from '../lib/extend-now-controller';
import { mountPanel, openIdFromUrl } from '../lib/panel-controller';
import { noWatchlistSentence, rowFor, type Row, type WatchItem } from '../lib/watchlist-view';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let items: WatchItem[] = [];
const scans = new Map<string, ScanResult>();
let jobs: JobsFact = { kind: 'reading' };
const FILTERS: readonly StateFilter[] = ['all', 'at-risk', 'undetermined', 'archived'];

const rows = (): Row[] => items.map((i) => rowFor(i, new Date(), scans.get(i.contractId)));
const filter = (): StateFilter => {
  const f = new URLSearchParams(location.search).get('state');
  return FILTERS.includes(f as StateFilter) ? (f as StateFilter) : 'all';
};
const visible = (): Row[] => {
  const q = $<HTMLInputElement>('cl-q').value;
  return rows().filter((r) => matchesFilter(r, filter(), q));
};

function renderList(open = openIdFromUrl()): void {
  const shown = visible();
  $('cl-list').innerHTML =
    shown.length === 0
      ? '<p class="note">No contract matches this filter.</p>'
      : listHtml(shown, open, { limit: Infinity, wide: true });
  $('cl-count').textContent =
    `${formatCount(items.length)} ${items.length === 1 ? 'contract' : 'contracts'}. Ordered by what needs attention first.`;
}

function render(): void {
  $('cl-filters').innerHTML = filtersHtml(rows(), filter());
  renderList();
  panel.render();
}

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
    render();
  },
});

const panel = mountPanel({
  rows,
  renderList,
  panelHtml: (r) => panelHtml(r, 'contracts', jobs),
  removed: (id) => {
    items = items.filter((i) => i.contractId !== id);
    render();
  },
  renamed: (id, label) => {
    items = items.map((i) => (i.contractId === id ? { ...i, label } : i));
    render();
  },
  autopilotOff: (id) => {
    items = items.map((i) => (i.contractId === id ? { ...i, autopilot: { enabled: false } } : i));
    render();
  },
});

$('cl-filters').addEventListener('click', (ev) => {
  const a = (ev.target as HTMLElement).closest<HTMLAnchorElement>('a[data-filter]');
  if (a === null) return;
  ev.preventDefault();
  const url = new URL(location.href);
  const f = a.dataset.filter as StateFilter;
  if (f === 'all') url.searchParams.delete('state');
  else url.searchParams.set('state', f);
  history.replaceState(null, '', url);
  render();
});
$('cl-q').addEventListener('input', () => renderList());

async function load(): Promise<void> {
  const outcome = await apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).catch(
    () => ({ kind: 'unavailable', reason: 'network' }) as const,
  );
  const status = $('cl-status');
  if (outcome.kind === 'error' && outcome.code === 'UNAUTHENTICATED') {
    status.innerHTML = `${signedOutDemoHtml('Contracts')} Sign in to save contracts and turn on autopilot. You can <a href="/dashboard/scanner/">scan one now</a> with no account. <a href="/login/">Sign in</a>`;
    return;
  }
  if (outcome.kind !== 'ok' || !Array.isArray(outcome.data?.items)) {
    status.innerHTML = noWatchlistSentence(outcome);
    return;
  }
  items = outcome.data.items as WatchItem[];
  if (items.length === 0) {
    status.innerHTML = 'Nothing watched yet. <a href="/dashboard/">Add your first contract</a>.';
    return;
  }
  for (const i of items) {
    const shared = rememberedScan(i.contractId);
    if (shared !== undefined) scans.set(i.contractId, shared);
  }
  status.hidden = true;
  $('cl-body').hidden = false;
  render();
  void readRecentJobs().then((j) => {
    jobs = j;
    panel.render();
  });
  const pending = items.filter((i) => i.lastObservation === null && i.network === 'testnet');
  await Promise.all(
    pending.map((i) =>
      scanOne(i.contractId, 'dataKeys' in i.scope ? (i.scope.dataKeys as readonly string[]) : [])
        .then((s) => {
          scans.set(i.contractId, s);
          rememberScan(i.contractId, s);
        })
        .catch(() => undefined),
    ),
  );
  if (scans.size > 0) render();
}

void load();
