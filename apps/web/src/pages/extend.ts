/**
 * /extend/ in the revamp shell: one line per watched contract and the shared
 * side panel. Extend now is the panel's primary button when autopilot is on.
 * Nothing is queued when the page loads. No wallet.
 */
import { apiRequest } from '../lib/api';
import { esc } from '../lib/format';
import { oneExtendQuoteHtml, routerNoteHtml } from '../lib/extend-view';
import { listHtml, panelHtml } from '../lib/overview-view';
import { mountPanel, openIdFromUrl } from '../lib/panel-controller';
import { rowFor, type Row, type WatchItem } from '../lib/watchlist-view';

const $ = <T extends HTMLElement>(id: string): T => document.getElementById(id) as T;

const note = document.getElementById('router-note');
if (note !== null) note.innerHTML = routerNoteHtml();

let items: WatchItem[] = [];
const rows = (): Row[] => items.map((item) => rowFor(item, new Date()));

function renderList(open = openIdFromUrl()): void {
  const list = document.getElementById('extend-list');
  if (list === null) return;
  list.innerHTML =
    rows().length === 0
      ? '<p class="note">No contract on the watchlist. Nothing was queued.</p>'
      : listHtml(rows(), open, { limit: Infinity, wide: true });
}

const panel = mountPanel({
  rows,
  renderList,
  panelHtml: (row) => panelHtml(row, 'contracts'),
  removed: (id) => {
    items = items.filter((item) => item.contractId !== id);
    renderList();
    panel.render();
  },
  autopilotOff: (id) => {
    items = items.map((item) =>
      item.contractId === id ? { ...item, autopilot: { enabled: false } } : item,
    );
    renderList();
    panel.render();
  },
});

void apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).then((outcome) => {
  const status = $('extend-status');
  if (outcome.kind === 'unavailable') {
    status.textContent = 'The watchlist did not answer. Nothing was queued.';
    return;
  }
  if (outcome.kind === 'error') {
    status.innerHTML =
      outcome.code === 'UNAUTHENTICATED'
        ? 'Not signed in. <a href="/login/">Sign in</a>. Nothing was queued.'
        : 'The watchlist answered in a shape this page will not read. Nothing was queued.';
    return;
  }
  if (!Array.isArray(outcome.data?.items)) {
    status.textContent =
      'The watchlist answered in a shape this page will not read. Nothing was queued.';
    return;
  }
  items = outcome.data.items as WatchItem[];
  status.hidden = true;
  renderList();
  panel.render();
});

document.getElementById('estimate-button')?.addEventListener('click', () => {
  const raw = ($<HTMLInputElement>('rent-stroops').value ?? '').trim();
  const out = document.getElementById('estimate-result');
  if (out === null) return;
  if (raw === '') {
    out.innerHTML = oneExtendQuoteHtml(undefined);
    return;
  }
  if (!/^\d+$/.test(raw)) {
    out.innerHTML = `<p class="small">${esc('Enter a whole number of stroops, or leave the field blank.')}</p>`;
    return;
  }
  out.innerHTML = oneExtendQuoteHtml(BigInt(raw));
});
