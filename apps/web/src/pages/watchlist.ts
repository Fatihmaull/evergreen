/** `/dashboard/watchlist/` — one `GET /watchlist`, plus one `DELETE` per Remove click (spec #350 §6, §9b). */
import { apiRequest } from '../lib/api';
import { removeFromWatchlist } from '../lib/watchlist';
import { removeOutcomeText, watchlistScreenHtml } from '../lib/watchlist-view';

const out = document.getElementById('watchlist');
if (out !== null) {
  out.innerHTML = '<p class="muted">Asking the Evergreen API…</p>';
  void apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).then((outcome) => {
    out.innerHTML = watchlistScreenHtml(outcome);
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
