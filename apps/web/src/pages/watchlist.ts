/** `/dashboard/watchlist/` — one `GET /watchlist`, nothing else (spec #350 §9b). */
import { apiRequest } from '../lib/api';
import { watchlistScreenHtml } from '../lib/watchlist-view';

const out = document.getElementById('watchlist');
if (out !== null) {
  out.innerHTML = '<p class="muted">Asking the Evergreen API…</p>';
  void apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).then((outcome) => {
    out.innerHTML = watchlistScreenHtml(outcome);
  });
}
