/**
 * The Extend now dialog, shared by Overview and Contracts. A click on
 * `[data-extend-now]` in the side panel opens it; it simulates the rent of one
 * extend in this browser, reads the payer's allowance, and only then offers
 * Confirm (`extend-now.ts`). One Idempotency-Key is made when the dialog
 * opens and reused for every Confirm inside it, so a double click or a retry
 * after a dropped answer cannot queue a second job.
 */
import { readAllowance } from './allowance';
import { extendToFor } from './allowance-candidates';
import { quoteRent, scanOne } from './evergreen';
import {
  coverage,
  estimateExtendNow,
  extendNowDialogHtml,
  extendNowGate,
  extendNowResult,
  requestExtendNow,
  type DialogState,
} from './extend-now';
import type { Row, WatchItem } from './watchlist-view';

export interface ExtendNowHost {
  rows(): readonly Row[];
  /** After the API queued a job: the row's `usedToday` went up. */
  queued(contractId: string): void;
}

function newKey(): string {
  return crypto.randomUUID();
}

export function mountExtendNow(host: ExtendNowHost): void {
  const dialog = document.createElement('dialog');
  dialog.className = 'extend-now';
  dialog.setAttribute('aria-labelledby', 'en-title');
  const body = document.createElement('div');
  dialog.append(body);
  document.body.append(dialog);

  let item: WatchItem | undefined;
  let state: DialogState = { phase: 'estimating' };
  let key = '';
  let run = 0;

  const draw = (): void => {
    if (item === undefined) return;
    body.innerHTML = extendNowDialogHtml(item, state);
    body.querySelector('h2')?.setAttribute('id', 'en-title');
  };
  const set = (s: DialogState): void => {
    state = s;
    draw();
  };

  async function open(row: Row): Promise<void> {
    const gate = extendNowGate(row);
    if (gate.kind !== 'ready') return;
    item = row.item;
    key = newKey();
    const mine = ++run;
    set({ phase: 'estimating' });
    if (!dialog.open) dialog.showModal();
    const extendBy = extendToFor(row.item);
    const keys = 'dataKeys' in row.item.scope ? row.item.scope.dataKeys : [];
    const [quote, read] = await Promise.all([
      scanOne(row.item.contractId, keys as readonly string[])
        .then((scan) => quoteRent(scan, extendBy))
        .catch(() => undefined),
      readAllowance(gate.payer).catch(() => undefined),
    ]);
    if (mine !== run) return;
    if (quote === undefined) {
      set({ phase: 'no-estimate', why: 'The rent of one extend could not be simulated just now.' });
      return;
    }
    if (quote.excluded.length > 0) {
      set({
        phase: 'no-estimate',
        why: `The rent could only be simulated for part of this contract (${quote.excluded.length} entr${quote.excluded.length === 1 ? 'y' : 'ies'} left out).`,
      });
      return;
    }
    const estimate = estimateExtendNow(BigInt(quote.totalRentStroops));
    if (estimate === undefined) {
      set({
        phase: 'no-estimate',
        why: 'This network has no retry margin set, so the pull cannot be sized.',
      });
      return;
    }
    set({
      phase: 'confirm',
      estimate,
      extendByLedgers: extendBy,
      payer: gate.payer,
      coverage: coverage(estimate.totalStroops, read),
    });
  }

  async function confirm(): Promise<void> {
    if (item === undefined || state.phase !== 'confirm' || state.sending === true) return;
    if (state.coverage.kind !== 'covered') return;
    const contractId = item.contractId;
    const mine = run;
    set({ ...state, sending: true });
    const outcome = await requestExtendNow(contractId, key).catch(
      () => ({ kind: 'unavailable', reason: 'network' }) as const,
    );
    const next = extendNowResult(outcome);
    // Queued is queued even if the dialog was closed meanwhile: the row must say so.
    if (next.phase === 'queued') host.queued(contractId);
    if (mine !== run) return;
    set(next);
  }

  document.addEventListener('click', (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement)) return;
    const opener = t.closest<HTMLButtonElement>('button[data-extend-now]');
    if (opener !== null && !opener.disabled) {
      const row = host.rows().find((r) => r.item.contractId === opener.dataset.extendNow);
      if (row !== undefined) void open(row);
      return;
    }
    if (!dialog.contains(t)) return;
    if (t.closest('[data-en-close]')) {
      run += 1;
      dialog.close();
      return;
    }
    if (t.closest('button[data-en-confirm]')) void confirm();
  });
  dialog.addEventListener('cancel', () => {
    run += 1;
  });
}
