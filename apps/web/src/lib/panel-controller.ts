/**
 * The side panel, shared by Overview and Contracts (components.md § "Dashboard
 * revamp", Side panel). It opens on a row click or `Open`, and closes with
 * Close, Escape, or a second click on the open row. The URL carries
 * `?c=<contractId>`, so a reload or a shared link reopens it. Opening is not
 * motion: the panel appears, no slide.
 *
 * The page owns the data; this owns the URL, the panel element and the
 * clicks. Remove and Turn off are here because both live in the panel.
 */
import { removeFromWatchlist, turnAutopilotOff } from './watchlist';
import { autopilotOffOutcomeText, removeOutcomeText, type Row } from './watchlist-view';

export interface PanelHost {
  /** Every row the page knows, in any order. */
  rows(): readonly Row[];
  /** Redraw the list (the open row is marked) — not the panel. */
  renderList(openId: string | undefined): void;
  /** The panel's HTML for one row. */
  panelHtml(row: Row): string;
  /** After a 204 from `DELETE`: drop the row and redraw. */
  removed(contractId: string): void;
  /** After `PATCH` turned autopilot off: reload the row's state. */
  autopilotOff(contractId: string): void;
}

export function openIdFromUrl(): string | undefined {
  return new URLSearchParams(location.search).get('c') ?? undefined;
}

export function mountPanel(host: PanelHost): { render(): void; setOpen(id?: string): void } {
  const panel = document.getElementById('side-panel');
  if (panel === null) throw new Error('mountPanel: the page has no #side-panel');

  const render = (): void => {
    const open = openIdFromUrl();
    const row =
      open === undefined ? undefined : host.rows().find((r) => r.item.contractId === open);
    if (row === undefined) {
      panel.hidden = true;
      panel.innerHTML = '';
      document.body.classList.remove('panel-open');
      return;
    }
    panel.innerHTML = host.panelHtml(row);
    panel.setAttribute('aria-label', row.item.label ?? row.item.contractId);
    panel.hidden = false;
    document.body.classList.add('panel-open');
  };

  const setOpen = (id?: string): void => {
    const url = new URL(location.href);
    if (id === undefined) url.searchParams.delete('c');
    else url.searchParams.set('c', id);
    history.replaceState(null, '', url);
    host.renderList(id);
    render();
    if (id !== undefined) panel.querySelector<HTMLElement>('[data-panel-close]')?.focus();
  };

  const toggle = (id: string): void => setOpen(openIdFromUrl() === id ? undefined : id);

  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.closest('[data-panel-close]')) {
      setOpen(undefined);
      return;
    }
    const opener = t.closest<HTMLElement>('[data-open]');
    if (opener !== null && t.closest('a') === null) {
      toggle(opener.dataset.open ?? '');
      return;
    }
    const remove = t.closest<HTMLButtonElement>('button[data-remove]');
    if (remove !== null && !remove.disabled) {
      const id = remove.dataset.remove ?? '';
      const out = panel.querySelector<HTMLElement>('[data-panel-status]');
      remove.disabled = true;
      if (out) out.textContent = 'Asking the Evergreen API…';
      void removeFromWatchlist('testnet', id)
        .catch(() => ({ kind: 'unavailable', reason: 'network' }) as const)
        .then((o) => {
          const text = removeOutcomeText(o);
          if (text === undefined) {
            setOpen(undefined);
            host.removed(id);
            return;
          }
          remove.disabled = false;
          if (out) out.textContent = text;
        });
      return;
    }
    const off = t.closest<HTMLButtonElement>('button[data-autopilot-off]');
    if (off !== null && !off.disabled) {
      const id = off.dataset.autopilotOff ?? '';
      const out = panel.querySelector<HTMLElement>('[data-panel-status]');
      off.disabled = true;
      if (out) out.textContent = 'Asking the Evergreen API…';
      void turnAutopilotOff('testnet', id)
        .catch(() => ({ kind: 'unavailable', reason: 'network' }) as const)
        .then((o) => {
          const text = autopilotOffOutcomeText(o);
          if (text === undefined) {
            host.autopilotOff(id);
            return;
          }
          off.disabled = false;
          if (out) out.textContent = text;
        });
    }
  });

  document.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && openIdFromUrl() !== undefined) {
      setOpen(undefined);
      return;
    }
    const t = ev.target;
    if (
      (ev.key === 'Enter' || ev.key === ' ') &&
      t instanceof HTMLTableRowElement &&
      t.dataset.open
    ) {
      ev.preventDefault();
      toggle(t.dataset.open);
    }
  });

  return { render, setOpen };
}
