/**
 * `/dashboard/watchlist/` — one `GET /watchlist` and one `GET /me` (for the
 * linked wallets the autopilot cell needs), one chain read per payer wallet
 * (its allowance to the engine, components.md § A), plus one `DELETE` per Remove click
 * and one `PATCH` per autopilot Turn off (spec #350 §6, §9b; components.md § A).
 */
import { readAllowance, type ReadResult } from '../lib/allowance';
import { apiRequest } from '../lib/api';
import { scanOne, type ScanResult } from '../lib/evergreen';
import { readSession } from '../lib/login';
import { removeFromWatchlist, turnAutopilotOff } from '../lib/watchlist';
import {
  AUTOPILOT_OFF_TEXT,
  autopilotOffOutcomeText,
  removeOutcomeText,
  watchlistScreenHtml,
  type AutopilotContext,
  type PayerAllowance,
  type WatchItem,
} from '../lib/watchlist-view';

/** The chain read, reduced to what the row says. Live only when the expiry is ahead. */
function payerAllowance(read: ReadResult): PayerAllowance {
  if (read.kind !== 'read') return { kind: 'unread' };
  const { amountStroops, liveUntilLedger, observedAtLedger } = read.raw;
  if (BigInt(amountStroops) > 0n && liveUntilLedger !== null && liveUntilLedger > observedAtLedger)
    return { kind: 'live', liveUntilLedger, observedAtLedger };
  return { kind: 'missing' };
}

const out = document.getElementById('watchlist');
if (out !== null) {
  out.innerHTML = '<p class="muted">Asking the Evergreen API…</p>';
  void Promise.all([
    apiRequest<{ items?: unknown }>('/watchlist', { method: 'GET' }),
    // Only the wallet list is used. A failed read leaves it unknown, and the
    // cell then offers the turn-on path; /allowance/ checks the wallet itself.
    readSession().catch(() => undefined),
  ]).then(([outcome, session]) => {
    const linked: AutopilotContext =
      session?.kind === 'signed-in'
        ? { linkedWallets: session.me.wallets.map((w) => w.account) }
        : {};
    const scans = new Map<string, ScanResult>();
    const allowances = new Map<string, PayerAllowance>();
    const render = () =>
      (out.innerHTML = watchlistScreenHtml(outcome, new Date(), scans, { ...linked, allowances }));
    render();
    if (outcome.kind !== 'ok' || !Array.isArray(outcome.data?.items)) return;
    const items = outcome.data.items as WatchItem[];
    // Stage 1: the engine has stored no observation yet. Read the chain from
    // this browser for those rows, same scope as the item, so the binding
    // expiry has a value. A failed read leaves the row undetermined.
    const pending = items.filter((i) => i.lastObservation === null && i.network === 'testnet');
    const scanned = Promise.all(
      pending.map((i) =>
        scanOne(i.contractId, 'dataKeys' in i.scope ? (i.scope.dataKeys as readonly string[]) : [])
          .then((s) => void scans.set(i.contractId, s))
          .catch(() => undefined),
      ),
    );
    // Each payer's allowance to the engine, one chain read per wallet (§ A).
    const payers = new Set(
      items
        .filter((i) => i.network === 'testnet' && i.autopilot?.enabled === true)
        .map((i) => (i.autopilot as { payerWallet?: unknown }).payerWallet)
        .filter((p): p is string => typeof p === 'string'),
    );
    const read = Promise.all(
      [...payers].map((payer) =>
        readAllowance(payer)
          .catch((e: unknown) => ({ kind: 'read-failed', detail: String(e) }) as const)
          .then((r) => void allowances.set(payer, payerAllowance(r))),
      ),
    );
    void Promise.all([scanned, read]).then(() => {
      if (scans.size > 0 || allowances.size > 0) render();
    });
  });

  out.addEventListener('click', (ev) => {
    const target = ev.target;
    if (!(target instanceof HTMLElement)) return;

    // Turn on: no call here. The wallet signs on /allowance/ (components.md § A).
    const on = target.closest<HTMLButtonElement>('button[data-autopilot-on]');
    if (on !== null) {
      const id = on.dataset.autopilotContract ?? '';
      if (on.dataset.autopilotNetwork === 'testnet' && id !== '')
        window.location.assign(`/allowance/?for=${encodeURIComponent(id)}`);
      return;
    }

    const off = target.closest<HTMLButtonElement>('button[data-autopilot-off]');
    if (off !== null) {
      if (off.disabled) return;
      const id = off.dataset.autopilotContract ?? '';
      if (off.dataset.autopilotNetwork !== 'testnet' || id === '') return;
      const cell = off.closest<HTMLElement>('[data-autopilot-cell]');
      const status = cell?.querySelector<HTMLElement>('[data-autopilot-status]') ?? null;
      off.disabled = true;
      if (status !== null) status.textContent = 'Asking the Evergreen API…';
      void turnAutopilotOff('testnet', id)
        .catch(() => ({ kind: 'unavailable', reason: 'network' }) as const)
        .then((result) => {
          const text = autopilotOffOutcomeText(result);
          if (text === undefined) {
            if (cell !== null)
              cell.innerHTML = `<span class="small">Off</span> <span class="small muted" role="status">${AUTOPILOT_OFF_TEXT}</span>`;
            return;
          }
          off.disabled = false;
          if (status !== null) status.textContent = text;
        });
      return;
    }
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
