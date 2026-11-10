/**
 * `/dashboard/alerts/` — load preferences, then edit one optional kind.
 *
 * `SENDING_FACT` stays `unknown`. This file does not send mail.
 */
import { apiRequest } from '../lib/api';
import {
  isOptionalKind,
  loadPreferences,
  savePreference,
  type OptionalKind,
  type PreferenceItem,
} from '../lib/alert-preferences';
import {
  alertsHtml,
  NOT_SAVED_TEXT,
  SAVED_TEXT,
  SAVING_WORD,
  watchlistNoteHtml,
  type WatchlistFact,
} from '../lib/alert-preferences-view';

const root = document.getElementById('alerts');

function watchlistFact(data: unknown): WatchlistFact {
  if (
    typeof data !== 'object' ||
    data === null ||
    !Array.isArray((data as { items?: unknown }).items)
  ) {
    return 'unread';
  }
  const items = (data as { items: unknown[] }).items;
  return items.length === 0 ? 'empty' : 'named';
}

function paintWatchlist(fact: WatchlistFact): void {
  const slot = root?.querySelector('[data-watchlist-note]');
  if (slot) slot.innerHTML = watchlistNoteHtml(fact);
}

function wordFor(button: HTMLButtonElement): HTMLElement | null {
  return button.closest('.pref-row')?.querySelector<HTMLElement>('[data-word]') ?? null;
}

function statusFor(button: HTMLButtonElement): HTMLElement | null {
  return button.closest('.pref-row')?.querySelector<HTMLElement>('[data-status]') ?? null;
}

function showWord(button: HTMLButtonElement, enabled: boolean, busy: boolean): void {
  button.setAttribute('aria-checked', enabled ? 'true' : 'false');
  if (busy) button.setAttribute('aria-busy', 'true');
  else button.removeAttribute('aria-busy');
  const word = wordFor(button);
  if (word === null) return;
  if (busy) {
    word.textContent = SAVING_WORD;
    word.setAttribute('data-on', 'saving');
    return;
  }
  word.textContent = enabled ? 'on' : 'off';
  word.setAttribute('data-on', enabled ? 'true' : 'false');
}

if (root !== null) {
  root.innerHTML = alertsHtml({ kind: 'reading' });
  const confirmed = new Map<OptionalKind, boolean>();

  void loadPreferences().then((read) => {
    root.innerHTML = alertsHtml(read, { watchlist: 'pending' });
    if (read.kind !== 'ready') return;
    for (const item of read.items) {
      if (isOptionalKind(item.kind)) confirmed.set(item.kind, item.enabled);
    }

    void apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }).then((outcome) => {
      paintWatchlist(outcome.kind === 'ok' ? watchlistFact(outcome.data) : 'unread');
    });

    root.addEventListener('click', (ev) => {
      const target = ev.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest<HTMLButtonElement>('button[role="switch"]');
      if (button === null || button.getAttribute('aria-busy') === 'true') return;
      const kind = button.dataset.kind ?? '';
      if (!isOptionalKind(kind)) return;
      const previous = confirmed.get(kind);
      if (previous === undefined) return;
      const next = !previous;
      const status = statusFor(button);
      if (status !== null) status.textContent = '';
      showWord(button, next, true);
      void savePreference(kind, next).then((outcome) => {
        if (outcome.kind !== 'saved') {
          showWord(button, previous, false);
          if (status !== null) status.textContent = NOT_SAVED_TEXT;
          return;
        }
        const saved = outcome.items.find((item: PreferenceItem) => item.kind === kind);
        const enabled = saved?.enabled ?? previous;
        confirmed.set(kind, enabled);
        showWord(button, enabled, false);
        if (status !== null) status.textContent = SAVED_TEXT;
      });
    });
  });
}
