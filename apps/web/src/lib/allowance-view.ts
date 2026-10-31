/**
 * The allowance screen's copy (PH2-E3-05). Every outcome has its own sentence;
 * nothing here says revoked, none or expired from a chain read (docs/API.md §7:
 * the chain cannot tell them apart, and the history route is not built yet).
 *
 * Copy rules (#328, `claims-and-copy.md`): this page says your wallet asks you
 * to sign; it states the allowance's limits rather than custody words; no
 * fee figure.
 */
import { esc, exactXlm, short } from './format';
import type { ReadResult } from './allowance';
import type { RevokeOutcome } from './allowance-revoke';
import { approxDateOfLedger } from './view';

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
        'Your wallet did not answer in time, and its prompt may still be open. If you approve it there, the revoke can still be sent. This page will not send another: reload and read the allowance first.',
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
