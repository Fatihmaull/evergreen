/**
 * Activity (`/dashboard/activity/`). Reads `GET /jobs` and `GET /ledger` page
 * by page until the 30-day window is covered (the facts need every row in it),
 * and `GET /watchlist` for contract labels. Filters live in the URL (`?show=`),
 * and the open job in `?j=`, so a reload or a shared link reopens the panel.
 */
import { apiRequest } from '../lib/api';
import { signedOutDemoHtml } from '../lib/signed-out-demo';
import {
  DAY_MS,
  factsHtml,
  filtersHtml,
  listHtml,
  matches,
  moneyByJob,
  panelHtml,
  type ActivityFilter,
  type ApiJob,
  type ApiLedgerRow,
} from '../lib/activity-view';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;
const PAGE = 100;
/** At most this many pages per read: enough for 1,000 rows in 30 days. Past it, facts say so. */
const MAX_PAGES = 10;

interface PageBody<T> {
  items?: T[];
  nextCursor?: string | null;
}

let jobs: ApiJob[] = [];
let ledger: ApiLedgerRow[] = [];
let jobsCursor: string | null = null;
let ledgerCursor: string | null = null;
let complete = false;
/** False when a `GET /ledger` read failed: rent and fee are then unknown, not absent. */
let ledgerRead = true;
const labels = new Map<string, string>();

type Read<T> = { ok: true; items: T[]; next: string | null } | { ok: false; signedOut: boolean };

async function page<T>(path: string, cursor: string | null): Promise<Read<T>> {
  const q = `${path}?limit=${PAGE}${cursor === null ? '' : `&cursor=${encodeURIComponent(cursor)}`}`;
  const out = await apiRequest<PageBody<T>>(q, { method: 'GET' }).catch(
    () => ({ kind: 'unavailable', reason: 'network' }) as const,
  );
  if (out.kind === 'error' && out.code === 'UNAUTHENTICATED') return { ok: false, signedOut: true };
  if (out.kind !== 'ok' || !Array.isArray(out.data?.items)) return { ok: false, signedOut: false };
  const next = typeof out.data.nextCursor === 'string' ? out.data.nextCursor : null;
  return { ok: true, items: out.data.items, next };
}

/** Reads ledger pages until rows older than `since` are reached, or history ends. */
async function ledgerUntil(since: number): Promise<boolean> {
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const last = ledger[ledger.length - 1];
    if (last !== undefined && (ledgerCursor === null || Date.parse(last.recordedAt) < since)) {
      return true;
    }
    const r = await page<ApiLedgerRow>('/ledger', ledgerCursor);
    if (!r.ok) return false;
    ledger = [...ledger, ...r.items];
    ledgerCursor = r.next;
    if (r.next === null) return true;
  }
  return false;
}

const filter = (): ActivityFilter => {
  const f = new URLSearchParams(location.search).get('show');
  return f === 'extends' || f === 'failed' ? f : 'all';
};
const openId = (): string | undefined => new URLSearchParams(location.search).get('j') ?? undefined;

function setParam(key: string, value: string | undefined): void {
  const url = new URL(location.href);
  if (value === undefined) url.searchParams.delete(key);
  else url.searchParams.set(key, value);
  history.replaceState(null, '', url);
}

function render(): void {
  const money = moneyByJob(ledger);
  const f = filter();
  const open = openId();
  $('ac-facts').innerHTML = factsHtml({ jobs, ledger, complete });
  $('ac-filters').innerHTML = filtersHtml(jobs, f);
  const shown = jobs.filter((j) => matches(j, f));
  $('ac-list').innerHTML =
    shown.length === 0
      ? '<p class="note">No job matches this filter.</p>'
      : `${
          ledgerRead
            ? ''
            : '<p class="note unavailable">The fee ledger did not answer, so rent and fee are not shown.</p>'
        }${listHtml(shown, money, labels, open)}`;
  $('ac-older').hidden = jobsCursor === null;

  const panel = $('side-panel');
  const job = open === undefined ? undefined : jobs.find((j) => j.id === open);
  panel.innerHTML = job === undefined ? '' : panelHtml(job, money.get(job.id) ?? {}, labels);
  panel.hidden = job === undefined;
  document.body.classList.toggle('panel-open', job !== undefined);
}

function select(id: string | undefined): void {
  setParam('j', openId() === id ? undefined : id);
  render();
  if (openId() !== undefined)
    $('side-panel').querySelector<HTMLElement>('[data-panel-close]')?.focus();
}

document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  if (t.closest('[data-panel-close]')) return select(undefined);
  const pill = t.closest<HTMLAnchorElement>('a[data-filter]');
  if (pill !== null) {
    ev.preventDefault();
    setParam('show', pill.dataset.filter === 'all' ? undefined : pill.dataset.filter);
    return render();
  }
  const row = t.closest<HTMLElement>('[data-open]');
  if (row !== null && t.closest('a') === null) select(row.dataset.open);
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && openId() !== undefined) return select(undefined);
  const t = ev.target;
  if ((ev.key === 'Enter' || ev.key === ' ') && t instanceof HTMLElement && t.dataset.open) {
    ev.preventDefault();
    select(t.dataset.open);
  }
});

$('ac-older').addEventListener('click', () => {
  void (async () => {
    const button = $<HTMLButtonElement>('ac-older');
    button.disabled = true;
    const r = await page<ApiJob>('/jobs', jobsCursor);
    if (r.ok) {
      jobs = [...jobs, ...r.items];
      jobsCursor = r.next;
      const oldest = jobs[jobs.length - 1];
      if (oldest !== undefined) await ledgerUntil(Date.parse(oldest.createdAt));
    }
    button.disabled = false;
    render();
  })();
});

async function load(): Promise<void> {
  const status = $('ac-status');
  const since = Date.now() - 30 * DAY_MS;

  const watch = apiRequest<{ items?: { contractId: string; label?: string }[] }>('/watchlist', {
    method: 'GET',
  }).catch(() => undefined);

  let covered = false;
  for (let i = 0; i < MAX_PAGES; i += 1) {
    const r = await page<ApiJob>('/jobs', jobsCursor);
    if (!r.ok) {
      status.innerHTML = r.signedOut
        ? `${signedOutDemoHtml('Activity')} Sign in to see what Evergreen ran for your contracts. The scanner needs no account. <a href="/dashboard/scanner/">Scan a contract</a> · <a href="/login/">Sign in</a>`
        : 'The Evergreen API did not answer, so there is no activity to show. This says nothing about your contracts: it is about us.';
      return;
    }
    jobs = [...jobs, ...r.items];
    jobsCursor = r.next;
    const last = jobs[jobs.length - 1];
    if (r.next === null || (last !== undefined && Date.parse(last.createdAt) < since)) {
      covered = true;
      break;
    }
  }

  const w = await watch;
  if (w?.kind === 'ok' && Array.isArray(w.data?.items)) {
    for (const it of w.data.items) if (it.label) labels.set(it.contractId, it.label);
  }

  if (jobs.length === 0) {
    status.innerHTML =
      'No jobs yet. A job appears here when autopilot extends one of your contracts. <a href="/dashboard/watchlist/">Contracts</a>';
    return;
  }
  const oldest = jobs[jobs.length - 1];
  const ledgerOk = await ledgerUntil(Math.min(since, Date.parse(oldest?.createdAt ?? '')));
  ledgerRead = ledgerOk || ledger.length > 0;
  complete = covered && ledgerOk;
  status.hidden = true;
  $('ac-body').hidden = false;
  render();
}

void load();
