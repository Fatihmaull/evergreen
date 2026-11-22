/**
 * The allowance screen's copy (PH2-E3-05). Every outcome has its own sentence.
 *
 * The chain-read renderer does not say revoked, none, expired or stopped: the
 * chain cannot tell those apart (docs/API.md §7). `standingHtml` says them
 * only from a parsed history body, and an expired status is the word Stopped.
 *
 * Rent and the fee are separate lines. The fee is the provisional
 * `hostedFeeStroops` figure, labeled estimate. A summed rent-plus-fee is not
 * printed. The allowance amount, when the margin is set, is its own line
 * because that is the number a signature would authorise.
 */
import { esc, exactXlm, short, approxDate } from './format';
import { nativeSac, type ReadResult } from './allowance';
import type { RevokeOutcome } from './allowance-revoke';
import type { ApproveOutcome } from './allowance-approve';
import type { BudgetFit, CapEstimate } from './allowance-cap';
import { reminderInstants } from './allowance-cap';
import type { AllowanceHistory } from './allowance-status';
import { approxDateOfLedger, ledgerInstant } from './view';

const UNDETERMINED_CHIP =
  '<span class="chip undetermined"><span class="shape"></span>undetermined</span>';

export const SPENDER_UNSET_TEXT =
  "The engine's spender address is not published yet: it waits on the engine key work. " +
  'Until it is, this page reads no allowance and cannot revoke one.';

export function readHtml(read: ReadResult, now = new Date()): string {
  if (read.kind === 'spender-unset') {
    return `<div class="panel undetermined"><p>${UNDETERMINED_CHIP} Status</p><p class="small muted">${esc(
      SPENDER_UNSET_TEXT,
    )}</p></div>`;
  }
  if (read.kind === 'read-failed') {
    return `<div class="panel undetermined"><p>${UNDETERMINED_CHIP} The allowance could not be read.</p><p class="small muted">${esc(
      read.detail,
    )}</p></div>`;
  }
  const { raw, spender } = read;
  const amount = exactXlm(raw.amountStroops);
  const until =
    raw.liveUntilLedger === null
      ? 'no allowance entry was returned'
      : `ledger ${raw.liveUntilLedger.toLocaleString('en-US')} (${esc(
          approxDateOfLedger(raw.liveUntilLedger, raw.observedAtLedger, now),
        )})`;
  return `<div class="panel undetermined stack">
      <p>${UNDETERMINED_CHIP} Status</p>
      <dl class="small">
        <dt>Amount, as read</dt><dd class="mono">${esc(amount.xlm)} · ${esc(amount.stroops)}</dd>
        <dt>Live until</dt><dd class="mono">${until}</dd>
        <dt>Spender</dt><dd class="mono" title="${esc(spender)}">${esc(short(spender))}</dd>
        <dt>Read at</dt><dd class="mono">ledger ${raw.observedAtLedger.toLocaleString('en-US')}</dd>
      </dl>
      <p class="small muted">This is the chain's raw answer. A zero reads the same after an expiry, after a revoke and when no allowance ever existed, so the status stays undetermined until Evergreen's allowance history is available.</p>
    </div>`;
}

function panel(tone: 'note' | 'undetermined' | 'error', html: string): string {
  return `<div class="panel ${tone}"><p>${html}</p></div>`;
}

/** One sentence per outcome. `rejected` is the user's choice and reads as one. */
export function revokeOutcomeHtml(o: RevokeOutcome): string {
  if (!('kind' in o)) {
    return panel(
      'note',
      `The revoke was included in ledger ${o.ledger.toLocaleString('en-US')}. Transaction <span class="mono">${esc(
        o.hash,
      )}</span>. Reload to read the allowance again.`,
    );
  }
  switch (o.kind) {
    case 'rejected':
      return panel('note', 'You declined in your wallet. Nothing was signed or sent.');
    case 'spender-unset':
      return panel('undetermined', esc(SPENDER_UNSET_TEXT));
    case 'already-sent':
      return panel(
        'undetermined',
        'A revoke from this page may already have reached the network. Reload and read the allowance before trying again.',
      );
    case 'build-failed':
      return panel('error', `The revoke could not be built, so nothing was sent: ${esc(o.detail)}`);
    case 'simulation-failed':
      return panel(
        'error',
        `The network's simulation refused the revoke, so nothing was sent: ${esc(o.detail)}`,
      );
    case 'restore-required':
      return panel(
        'error',
        `The simulation says archived state must be restored first. This page does not restore, so nothing was sent: ${esc(o.detail)}`,
      );
    case 'possibly-signed':
      return panel(
        'undetermined',
        'Your wallet did not answer in time, and its prompt may still be open. If you approve it there, this page will not send it, so nothing is revoked. Reload and read the allowance before trying again.',
      );
    case 'submit-failed':
      return panel(
        'error',
        `Sending the revoke failed (${esc(o.detail)}). Whether the network took it is not certain, so this page will not send another: reload and read the allowance first.`,
      );
    case 'failed-on-chain':
      return panel(
        'error',
        `The revoke reached the network and failed there. Transaction <span class="mono">${esc(o.hash)}</span>: ${esc(o.detail)}`,
      );
    case 'pending':
      return panel(
        'undetermined',
        `The network accepted the revoke but it was not confirmed while we waited. Transaction <span class="mono">${esc(
          o.hash,
        )}</span>; its outcome is undetermined. This page will not send another.`,
      );
    case 'not-installed':
      return panel('error', 'Freighter is not installed in this browser.');
    case 'locked':
      return panel('error', 'Freighter is locked. Unlock it and try again.');
    case 'not-connected':
      return panel('error', 'Freighter has not given this site access. Connect it and try again.');
    case 'wrong-network':
      return panel(
        'error',
        `Freighter is on another network (${esc(o.reported)}). Switch it to testnet.`,
      );
    case 'account-mismatch':
      return panel(
        'error',
        `Freighter answered for ${esc(short(o.reported))}, not ${esc(short(o.expected))}. Switch accounts in Freighter.`,
      );
    case 'unavailable':
      return panel('error', `Freighter did not answer usably: ${esc(o.detail)}`);
    case 'timeout':
      return panel('undetermined', 'Your wallet did not answer in time.');
  }
}

export const REMINDERS_UNDETERMINED =
  'Renewal reminders are at 30, 7 and 1 days before expiry. The expiry is not known yet, so those dates are undetermined. This page does not send them.';

const money = (stroops: string | bigint) => {
  const exact = exactXlm(stroops);
  return `${esc(exact.xlm)} · ${esc(exact.stroops)}`;
};

function elapsedFromEstimate(iso: string, now: Date): string | undefined {
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return undefined;
  const ms = now.getTime() - at;
  if (ms < 0) return undefined;
  const minutes = Math.floor(ms / 60_000);
  const days = Math.floor(minutes / (24 * 60));
  const hours = Math.floor((minutes % (24 * 60)) / 60);
  const mins = minutes % 60;
  const unit = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  return `${unit(days, 'day', 'days')}, ${unit(hours, 'hour', 'hours')} and ${unit(mins, 'minute', 'minutes')}`;
}

/** Dates at 30, 7 and 1 days before the expiry ledger. No expiry, no dates. */
export function reminderHtml(
  expiry: { readonly liveUntilLedger: number; readonly observedAtLedger: number } | undefined,
  now = new Date(),
): string {
  if (expiry === undefined) return `<p class="small muted">${esc(REMINDERS_UNDETERMINED)}</p>`;
  const at = ledgerInstant(expiry.liveUntilLedger, expiry.observedAtLedger, now);
  if (at === undefined) return `<p class="small muted">${esc(REMINDERS_UNDETERMINED)}</p>`;
  const items = reminderInstants(at)
    .map(
      (row) =>
        `<li>${row.daysBefore} ${row.daysBefore === 1 ? 'day' : 'days'} before: ${esc(approxDate(row.at))}</li>`,
    )
    .join('');
  return `<div class="stack">
      <p class="small">Renewal reminders are at 30, 7 and 1 days before this expiry. This page does not send them.</p>
      <ul class="small">${items}</ul>
      <p class="small muted">The expiry is ledger ${expiry.liveUntilLedger.toLocaleString('en-US')} (${esc(
        approxDateOfLedger(expiry.liveUntilLedger, expiry.observedAtLedger, now),
      )}).</p>
    </div>`;
}

/**
 * Status from the history route. `expired` is Stopped. The word "protected"
 * is not used: an expired allowance is not described as still covering anything.
 */
export function standingHtml(history: AllowanceHistory, now = new Date()): string {
  if (history.kind === 'unread') {
    const why =
      history.reason === 'not-signed-in'
        ? 'The allowance history was not read: this browser has no signed-in session.'
        : history.reason === 'unavailable'
          ? 'Evergreen’s allowance history did not answer.'
          : 'Evergreen’s allowance history answered in a shape this page will not read.';
    return `<div class="panel undetermined"><p>${UNDETERMINED_CHIP} Status</p><p class="small muted">${esc(
      why,
    )} The chain read cannot tell an expired allowance from a revoked one or from none, so the status stays undetermined.</p></div>`;
  }
  const { state } = history;
  if (state.status === 'expired') {
    const known = state.lastKnown;
    if (known === null) {
      return `<div class="panel undetermined"><p>${UNDETERMINED_CHIP} Status</p><p class="small muted">The history said expired and carried no record of the allowance, so this page will not call it stopped.</p></div>`;
    }
    const how =
      state.expiresAtEstimate === null
        ? 'How long autopilot has been stopped is undetermined: the history gave no expiry estimate.'
        : elapsedFromEstimate(state.expiresAtEstimate, now) === undefined
          ? 'The history says this allowance expired, and its expiry estimate is still ahead of this reading, so how long autopilot has been stopped is undetermined.'
          : `From the expiry estimate to this reading: ${elapsedFromEstimate(state.expiresAtEstimate, now)}.`;
    const when = approxDateOfLedger(known.liveUntilLedger, known.observedAtLedger, now);
    return `<div class="panel note stack">
      <p><span class="chip expired"><span class="shape"></span>Stopped</span></p>
      <p>This allowance has expired. Autopilot is stopped.</p>
      <dl class="small">
        <dt>Amount it expired with</dt><dd class="mono">${money(known.amountStroops)}</dd>
        <dt>Ledger it expired at</dt><dd class="mono">ledger ${known.liveUntilLedger.toLocaleString('en-US')} (${esc(when)})</dd>
        <dt>Balance, as read</dt><dd class="mono">${money(state.balanceStroops)}</dd>
      </dl>
      <p class="small">${esc(how)}</p>
      <p class="small">A new approve replaces the cap. It does not add to it.</p>
    </div>`;
  }
  if (state.status === 'active' && state.liveUntilLedger !== null) {
    const when = approxDateOfLedger(state.liveUntilLedger, state.observedAtLedger, now);
    return `<div class="panel note stack">
      <p>The allowance is live until ledger ${state.liveUntilLedger.toLocaleString('en-US')} (${esc(when)}).</p>
      <dl class="small">
        <dt>Amount, as read</dt><dd class="mono">${money(state.amountStroops)}</dd>
        <dt>Balance, as read</dt><dd class="mono">${money(state.balanceStroops)}</dd>
      </dl>
      <p class="small">A new approve replaces this amount. It does not add to it. One allowance covers every contract; a per-contract budget is not enforced on the chain.</p>
    </div>`;
  }
  if (state.status === 'revoked') {
    return `<div class="panel note"><p>Revoked. The engine can pull nothing under this allowance. This is not an expiry: the history recorded a zero before the expiry ledger.</p></div>`;
  }
  if (state.status === 'none') {
    return `<div class="panel note"><p>No allowance is recorded for this wallet and spender.</p></div>`;
  }
  return `<div class="panel undetermined"><p>${UNDETERMINED_CHIP} Status</p><p class="small muted">The history named a status this page will not describe. The status stays undetermined.</p></div>`;
}

export function budgetNoteHtml(fit: BudgetFit): string {
  if (fit.kind !== 'never') return '';
  return `<div class="stack">
      <p class="small">This extend can never run. Its per-job budget is below the rent and below the fee. Those are separate:</p>
      <dl class="small">
        <dt>Rent, one extend, estimate</dt><dd class="mono">${money(fit.perActionRentStroops)}</dd>
        <dt>Fee, one extend, estimate</dt><dd class="mono">${money(fit.perActionFeeStroops)}</dd>
      </dl>
    </div>`;
}

/** Rent and fee on their own lines. The allowance amount appears only when it is a number. */
export function capHtml(estimate: CapEstimate, fits: readonly BudgetFit[] = []): string {
  const lines = estimate.lines
    .map((line, index) => {
      const note = fits[index] ? budgetNoteHtml(fits[index]) : '';
      const horizon =
        line.hostedActions === 1n
          ? ''
          : `<dt>Rent, ${line.hostedActions.toString()} extends, estimate</dt><dd class="mono">${money(line.rentStroops)}</dd>
             <dt>Fee, ${line.hostedActions.toString()} extends, estimate</dt><dd class="mono">${money(line.feeStroops)}</dd>`;
      return `<div class="stack">
        <p class="small">Contract ${index + 1}</p>
        <dl class="small">
          <dt>Rent, one extend, estimate</dt><dd class="mono">${money(line.perActionRentStroops)}</dd>
          <dt>Fee, one extend, estimate</dt><dd class="mono">${money(line.perActionFeeStroops)}</dd>
          ${horizon}
        </dl>
        ${note}
      </div>`;
    })
    .join('');
  const amount =
    estimate.amountStroops === undefined
      ? `<p class="small">Allowance amount: undetermined. The safety margin is not set, so this page will not name a cap and will not ask you to sign one.</p>`
      : `<dl class="small"><dt>Allowance amount you would sign</dt><dd class="mono">${money(estimate.amountStroops)}</dd></dl>
         <p class="small">A new approve replaces the cap. It does not add to it.</p>`;
  return `<div class="stack">
      ${lines}
      <dl class="small">
        <dt>Rent, all of the above, estimate</dt><dd class="mono">${money(estimate.rentStroops)}</dd>
        <dt>Fee, all of the above, estimate</dt><dd class="mono">${money(estimate.feeStroops)}</dd>
      </dl>
      <p class="small muted">The fee is provisional. Rent and the fee are separate. One allowance covers every contract you list. A per-contract budget is kept with your account, and the chain does not enforce it.</p>
      ${amount}
    </div>`;
}

/** What the page shows before the wallet prompt. Refuses to state an amount it cannot format. */
export function approveDisclosureHtml(
  args: {
    readonly amountStroops: bigint;
    readonly spender: string;
    readonly liveUntilLedger: number;
    readonly observedAtLedger: number;
    readonly currentAmountStroops: string;
    readonly rentStroops: bigint;
    readonly feeStroops: bigint;
  },
  now = new Date(),
): string {
  const when = approxDateOfLedger(args.liveUntilLedger, args.observedAtLedger, now);
  return `<div class="panel note stack">
      <p>You are signing one <span class="mono">approve</span> on the native XLM contract <span class="mono">${esc(
        nativeSac(),
      )}</span>. It authorises a payment, never access to a contract.</p>
      <p>A new approve replaces the current allowance. It does not add to it.</p>
      <dl class="small">
        <dt>Current allowance, as read</dt><dd class="mono">${money(args.currentAmountStroops)}</dd>
        <dt>New cap</dt><dd class="mono">${money(args.amountStroops)}</dd>
        <dt>Rent, estimate</dt><dd class="mono">${money(args.rentStroops)}</dd>
        <dt>Fee, estimate</dt><dd class="mono">${money(args.feeStroops)}</dd>
        <dt>Spender</dt><dd class="mono" title="${esc(args.spender)}">${esc(short(args.spender))}</dd>
        <dt>Live until</dt><dd class="mono">ledger ${args.liveUntilLedger.toLocaleString('en-US')} (${esc(when)})</dd>
      </dl>
    </div>`;
}

export function approveOutcomeHtml(o: ApproveOutcome): string {
  if (!('kind' in o)) {
    return panel(
      'note',
      `The approve was included in ledger ${o.ledger.toLocaleString('en-US')}. Transaction <span class="mono">${esc(
        o.hash,
      )}</span>. It replaced the previous cap. Reload to read the allowance again.`,
    );
  }
  switch (o.kind) {
    case 'rejected':
      return panel('note', 'You declined in your wallet. Nothing was signed or sent.');
    case 'spender-unset':
      return panel('undetermined', esc(SPENDER_UNSET_TEXT));
    case 'cap-undetermined':
      return panel(
        'undetermined',
        'The allowance amount is undetermined, so nothing was signed. The safety margin is not set.',
      );
    case 'amount-not-positive':
      return panel(
        'error',
        'An approve of zero is a revoke, and this step does not revoke. Nothing was signed.',
      );
    case 'expiry-not-after-read':
      return panel(
        'error',
        'The expiry is not after the ledger the allowance was read at, so nothing was signed.',
      );
    case 'expiry-too-far':
      return panel(
        'error',
        'The expiry is past the longest the protocol accepted on testnet (3,110,399 ledgers after the read), so nothing was signed.',
      );
    case 'stale-read':
      return panel(
        'undetermined',
        `The chain now reads ${money(o.currentStroops)}, which is not the amount this page was about to replace. Nothing was signed. Read it again before approving.`,
      );
    case 'read-failed':
      return panel(
        'error',
        `The allowance could not be read again, so nothing was signed: ${esc(o.detail)}`,
      );
    case 'already-sent':
      return panel(
        'undetermined',
        'An approve from this page may already have reached the network. Reload and read the allowance before trying again.',
      );
    case 'build-failed':
      return panel(
        'error',
        `The approve could not be built, so nothing was sent: ${esc(o.detail)}`,
      );
    case 'simulation-failed':
      return panel(
        'error',
        `The network's simulation refused the approve, so nothing was sent: ${esc(o.detail)}`,
      );
    case 'restore-required':
      return panel(
        'error',
        `The simulation says archived state must be restored first. This page does not restore, so nothing was sent: ${esc(o.detail)}`,
      );
    case 'possibly-signed':
      return panel(
        'undetermined',
        'Your wallet did not answer in time, and its prompt may still be open. If you approve it there, this page will not send it, so the cap is unchanged. Reload and read the allowance before trying again.',
      );
    case 'submit-failed':
      return panel(
        'error',
        `Sending the approve failed (${esc(o.detail)}). Whether the network took it is not certain, so this page will not send another: reload and read the allowance first.`,
      );
    case 'failed-on-chain':
      return panel(
        'error',
        `The approve reached the network and failed there. Transaction <span class="mono">${esc(o.hash)}</span>: ${esc(o.detail)}`,
      );
    case 'pending':
      return panel(
        'undetermined',
        `The network accepted the approve but it was not confirmed while we waited. Transaction <span class="mono">${esc(
          o.hash,
        )}</span>; its outcome is undetermined. This page will not send another.`,
      );
    case 'not-installed':
      return panel('error', 'Freighter is not installed in this browser.');
    case 'locked':
      return panel('error', 'Freighter is locked. Unlock it and try again.');
    case 'not-connected':
      return panel('error', 'Freighter has not given this site access. Connect it and try again.');
    case 'wrong-network':
      return panel(
        'error',
        `Freighter is on another network (${esc(o.reported)}). Switch it to testnet.`,
      );
    case 'account-mismatch':
      return panel(
        'error',
        `Freighter answered for ${esc(short(o.reported))}, not ${esc(short(o.expected))}. Switch accounts in Freighter.`,
      );
    case 'unavailable':
      return panel('error', `Freighter did not answer usably: ${esc(o.detail)}`);
    case 'timeout':
      return panel('undetermined', 'Your wallet did not answer in time.');
  }
}
