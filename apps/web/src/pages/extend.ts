/**
 * /extend/ in the browser. Loads the watchlist, and queues one job per click.
 * No wallet. No storage. A key is kept in memory for the page, one per
 * contract, so a second click is the same intent.
 */
import { apiRequest } from '../lib/api';
import { esc } from '../lib/format';
import { extendRows, queueExtendNow, type ExtendRow } from '../lib/extend-job';
import { oneExtendQuoteHtml, queueHtml, routerNoteHtml, rowHtml } from '../lib/extend-view';

const rowsEl = document.getElementById('extend-rows');
const note = document.getElementById('router-note');
if (note !== null) note.innerHTML = routerNoteHtml();

const keys = new Map<string, string>();

function keyFor(contractId: string): string {
  const existing = keys.get(contractId);
  if (existing !== undefined) return existing;
  const created = crypto.randomUUID();
  keys.set(contractId, created);
  return created;
}

if (rowsEl !== null) {
  void apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).then((outcome) => {
    if (outcome.kind === 'unavailable') {
      rowsEl.innerHTML =
        '<p class="small">The watchlist did not answer, so this page has no contracts to extend. Nothing was queued.</p>';
      return;
    }
    if (outcome.kind === 'error') {
      rowsEl.innerHTML =
        outcome.code === 'UNAUTHENTICATED'
          ? '<p class="small">Not signed in. <a href="/login/">Sign in</a> to see the contracts this account watches. Nothing was queued.</p>'
          : '<p class="small">The watchlist answered in a shape this page will not read. Nothing was queued.</p>';
      return;
    }
    const parsed = extendRows(outcome.data?.items);
    if (parsed.rows.length === 0) {
      rowsEl.innerHTML =
        '<p class="small">No testnet contract on the watchlist. Nothing was queued.</p>';
      return;
    }
    const unread =
      parsed.unreadable === 0
        ? ''
        : `<p class="small muted">${parsed.unreadable} row${parsed.unreadable === 1 ? '' : 's'} could not be read and ${parsed.unreadable === 1 ? 'is' : 'are'} not listed.</p>`;
    rowsEl.innerHTML = unread + parsed.rows.map((row) => rowHtml(row)).join('');
    const byId = new Map<string, ExtendRow>(parsed.rows.map((row) => [row.contractId, row]));
    rowsEl.addEventListener('click', (event) => {
      const button = (event.target as Element | null)?.closest?.('button.extend-now');
      if (!(button instanceof HTMLButtonElement) || button.disabled) return;
      const contractId = button.dataset['contract'];
      const row = contractId === undefined ? undefined : byId.get(contractId);
      if (row === undefined || !row.autopilot) return;
      if (
        row.limitPerDay !== undefined &&
        row.usedToday !== undefined &&
        row.usedToday >= row.limitPerDay
      ) {
        return;
      }
      button.disabled = true;
      const result = rowsEl.querySelector(
        `.extend-result[data-contract="${CSS.escape(contractId ?? '')}"]`,
      );
      if (result !== null)
        result.innerHTML = '<p class="muted">Asking the API to queue one extend…</p>';
      void queueExtendNow(row.contractId, keyFor(row.contractId)).then((queued) => {
        if (result !== null) result.innerHTML = queueHtml(queued);
        // An unreadable success may already be a job. Anything else can be
        // asked again, and the same key is sent so a retry is not a second intent.
        button.disabled =
          queued.kind === 'queued' ||
          (queued.kind === 'not-queued' && queued.reason === 'unrecognised');
      });
    });
  });
}

const estimate = document.getElementById('estimate-button');
estimate?.addEventListener('click', () => {
  const raw =
    (document.getElementById('rent-stroops') as HTMLInputElement | null)?.value.trim() ?? '';
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
