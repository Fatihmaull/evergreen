/** `/dashboard/watchlist/` — one `GET /watchlist`, plus one `DELETE` per Remove click (spec #350 §6, §9b). */
import { apiRequest } from '../lib/api';
import { scanOne, type ScanResult } from '../lib/evergreen';
import { removeFromWatchlist } from '../lib/watchlist';
import { removeOutcomeText, watchlistScreenHtml, type WatchItem } from '../lib/watchlist-view';

const out = document.getElementById('watchlist');
if (out !== null) {
  out.innerHTML = '<p class="muted">Asking the Evergreen API…</p>';
  void apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).then((outcome) => {
    out.innerHTML = watchlistScreenHtml(outcome);
    // Stage 1: the engine has stored no observation yet. Read the chain from
    // this browser for those rows, same scope as the item, so the binding
    // expiry has a value. A failed read leaves the row undetermined.
    if (outcome.kind !== 'ok' || !Array.isArray(outcome.data?.items)) return;
    const items = outcome.data.items as WatchItem[];
    const pending = items.filter((i) => i.lastObservation === null && i.network === 'testnet');
    if (pending.length === 0) return;
    const scans = new Map<string, ScanResult>();
    void Promise.all(
      pending.map((i) =>
        scanOne(i.contractId, 'dataKeys' in i.scope ? (i.scope.dataKeys as readonly string[]) : [])
          .then((s) => void scans.set(i.contractId, s))
          .catch(() => undefined),
      ),
    ).then(() => {
      if (scans.size > 0) out.innerHTML = watchlistScreenHtml(outcome, new Date(), scans);
    });
  });

  out.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;
    const btn = target.closest<HTMLButtonElement>('button[data-remove-contract]');
    if (btn === null || btn.disabled) return;
    const contractId = btn.dataset.removeContract ?? '';
    if (btn.dataset.removeNetwork !== 'testnet' || contractId === '') return;
    const row = btn.closest('tr');
    const status = row?.querySelector<HTMLElement>('[data-remove-status]') ?? null;
    btn.disabled = true;
    if (status !== null) status.textContent = 'Asking the Evergreen API…';
    void removeFromWatchlist('testnet', contractId)
      .catch(() => ({ kind: 'unavailable', reason: 'network' }) as const)
      .then((outcome) => {
        const text = removeOutcomeText(outcome);
        if (text === undefined) {
          row?.remove();
          return;
        }
        btn.disabled = false;
        if (status !== null) status.textContent = text;
      });
  });
}
