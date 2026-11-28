/**
 * Blast radius (`/dashboard/blast-radius/`). One `GET /watchlist` names the
 * contracts; `?ids=` adds others for this view only. One `scanMany` reads
 * them together, which is the only way a shared code entry can be seen.
 * `?show=all` draws every entry, not just code; `?sel=` is the selected node
 * and opens the side panel.
 */
import { apiRequest } from '../lib/api';
import { signedOutDemoHtml } from '../lib/signed-out-demo';
import {
  blastPanelHtml,
  largestSharedHtml,
  mapSvg,
  sharedEntries,
  type MapShow,
} from '../lib/blast-view';
import { isValidContractId, report, scanMany, type ScanReport } from '../lib/evergreen';
import { esc } from '../lib/format';
import { NETWORK } from '../lib/network';
import { wireCopyButtons } from '../lib/ui';
import type { WatchItem } from '../lib/watchlist-view';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

let rep: ScanReport | undefined;
const labels = new Map<string, string>();
const watched = new Set<string>();

const params = (): URLSearchParams => new URLSearchParams(location.search);
const show = (): MapShow => (params().get('show') === 'all' ? 'all' : 'code');
const selected = (): string | undefined => params().get('sel') ?? undefined;
const extraIds = (): string[] =>
  (params().get('ids') ?? '')
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);

function setParam(name: string, value: string | undefined): void {
  const url = new URL(location.href);
  if (value === undefined) url.searchParams.delete(name);
  else url.searchParams.set(name, value);
  history.replaceState(null, '', url);
}

function filtersHtml(active: MapShow): string {
  const link = (v: MapShow, text: string): string => {
    const url = new URL(location.href);
    if (v === 'code') url.searchParams.delete('show');
    else url.searchParams.set('show', v);
    const on = v === active;
    return `<a class="filter${on ? ' active' : ''}" href="${esc(url.search || '?')}" data-show="${v}"${on ? ' aria-current="true"' : ''}>${text}</a>`;
  };
  return link('code', 'Code') + link('all', 'All entries');
}

function render(): void {
  if (rep === undefined) return;
  const sel = selected();
  const s = show();
  $('br-filters').innerHTML = filtersHtml(s);
  $('br-right-h').textContent = s === 'code' ? 'Code they run on' : 'Entries they need';
  $('br-svg').innerHTML = mapSvg(rep, labels, s, sel ?? sharedEntries(rep)[0]?.key);
  const panel = $('side-panel');
  const html = sel === undefined ? '' : blastPanelHtml(rep, labels, watched, sel);
  panel.innerHTML = html;
  panel.hidden = html === '';
  document.body.classList.toggle('panel-open', html !== '');
  wireCopyButtons(panel);
}

function select(id: string | undefined): void {
  setParam('sel', selected() === id ? undefined : id);
  render();
  if (selected() !== undefined)
    $('side-panel').querySelector<HTMLElement>('[data-panel-close]')?.focus();
}

async function scan(ids: readonly string[]): Promise<void> {
  const status = $('br-status');
  status.hidden = false;
  status.textContent = `Reading ${ids.length} contract${ids.length === 1 ? '' : 's'} from the chain…`;
  try {
    rep = report(await scanMany(ids));
  } catch (error) {
    status.innerHTML = `The chain could not be read: ${esc((error as Error).message)}. The endpoint is <span class="mono">${esc(NETWORK.rpcUrl)}</span>.`;
    return;
  }
  status.hidden = true;
  const next = $('br-next');
  next.innerHTML = largestSharedHtml(rep, labels);
  next.hidden = false;
  $('br-map').hidden = false;
  render();
}

function openAdd(): void {
  $('br-add').hidden = false;
  $('br-add-toggle').setAttribute('aria-expanded', 'true');
  $<HTMLTextAreaElement>('br-ids').focus();
}

async function load(): Promise<void> {
  const outcome = await apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).catch(
    () => ({ kind: 'unavailable', reason: 'network' }) as const,
  );
  if (outcome.kind === 'ok' && Array.isArray(outcome.data?.items)) {
    for (const i of outcome.data.items as WatchItem[]) {
      if (i.network !== 'testnet') continue;
      watched.add(i.contractId);
      if (i.label) labels.set(i.contractId, i.label);
    }
  }
  const extra = extraIds().filter(isValidContractId);
  $<HTMLTextAreaElement>('br-ids').value = extra.join('\n');
  const ids = [...new Set([...watched, ...extra])];
  if (ids.length === 0) {
    const signedOut = outcome.kind === 'error' && outcome.code === 'UNAUTHENTICATED';
    $('br-status').innerHTML = signedOut
      ? `${signedOutDemoHtml('Shared code')} <a href="/login/">Sign in</a> to draw your watched contracts, or add contract IDs to scan them together.`
      : 'No contracts to draw yet. Add contract IDs to scan them together.';
    openAdd();
    return;
  }
  await scan(ids);
}

$('br-add-toggle').addEventListener('click', () => {
  const add = $('br-add');
  if (add.hidden) openAdd();
  else {
    add.hidden = true;
    $('br-add-toggle').setAttribute('aria-expanded', 'false');
  }
});

$('br-add').addEventListener('submit', (ev) => {
  ev.preventDefault();
  const list = $<HTMLTextAreaElement>('br-ids')
    .value.split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  const bad = list.filter((id) => !isValidContractId(id));
  if (bad.length > 0) {
    $('br-count').textContent =
      `${bad.length} of these is not a contract ID. A contract ID starts with C and is 56 characters. Nothing was read.`;
    return;
  }
  $('br-count').textContent = '';
  setParam('ids', list.length === 0 ? undefined : list.join(','));
  setParam('sel', undefined);
  const ids = [...new Set([...watched, ...list])];
  if (ids.length === 0) return;
  void scan(ids);
});

document.addEventListener('click', (ev) => {
  const t = ev.target;
  if (!(t instanceof Element)) return;
  if (t.closest('[data-panel-close]')) return select(undefined);
  const show = t.closest<HTMLAnchorElement>('a[data-show]');
  if (show !== null) {
    ev.preventDefault();
    setParam('show', show.dataset.show === 'all' ? 'all' : undefined);
    return render();
  }
  const node = t.closest<Element>('[data-select]');
  if (node !== null) select(node.getAttribute('data-select') ?? undefined);
});

document.addEventListener('keydown', (ev) => {
  if (ev.key === 'Escape' && selected() !== undefined) return select(undefined);
  const t = ev.target;
  if (
    (ev.key === 'Enter' || ev.key === ' ') &&
    t instanceof Element &&
    t.matches('g[data-select]')
  ) {
    ev.preventDefault();
    select(t.getAttribute('data-select') ?? undefined);
  }
});

void load();
