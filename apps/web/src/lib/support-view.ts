/**
 * The "Support Evergreen" copy (PH2-E3-07). One sentence per outcome, and a
 * receipt that states exactly what was sent, to which address, in which
 * transaction. No promise of what a tip buys (`claims-and-copy.md`), no price
 * or charge figure, amounts exact (XLM and stroops), never approximated.
 */
import { esc, exactXlm, short } from './format';
import type { TipOutcome } from './support';

export const TREASURY_UNSET_TEXT =
  "Evergreen's treasury address is not published yet: it waits on the key-separation work. " +
  'Until it is, this page cannot send a payment.';

/**
 * While the treasury is unset, the page shows only the unset note (K17).
 * The amount card is removed, so no card frame remains around that note.
 */
export function hideUnsetTreasury(doc: {
  getElementById(
    id: string,
  ): { hidden: boolean; textContent: string | null; remove(): void } | null;
}): void {
  for (const id of ['wallet-step', 'amount-step'] as const) {
    const el = doc.getElementById(id);
    if (!el) throw new Error(`support page is missing #${id}`);
    el.hidden = true;
  }
  const card = doc.getElementById('amount-card');
  if (!card) throw new Error('support page is missing #amount-card');
  card.remove();
  const note = doc.getElementById('unset-note');
  if (!note) throw new Error('support page is missing #unset-note');
  note.hidden = false;
  note.textContent = TREASURY_UNSET_TEXT;
}

function panel(tone: 'note' | 'undetermined' | 'error', html: string): string {
  return `<div class="panel ${tone}"><p>${html}</p></div>`;
}

/** The tip's outcome. `sent` is what the user asked for, used only for the receipt. */
export function tipOutcomeHtml(o: TipOutcome, sent?: { stroops: bigint; to: string }): string {
  if (!('kind' in o)) {
    const amount = sent ? exactXlm(sent.stroops) : undefined;
    return `<div class="panel note stack">
      <p>Receipt. The payment was included in ledger ${o.ledger.toLocaleString('en-US')} on Stellar testnet.</p>
      <dl class="small">
        ${amount ? `<dt>Amount</dt><dd class="mono">${esc(amount.xlm)} · ${esc(amount.stroops)}</dd>` : ''}
        ${sent ? `<dt>To</dt><dd class="mono">${esc(sent.to)}</dd>` : ''}
        <dt>Transaction</dt><dd class="mono">${esc(o.hash)}</dd>
      </dl>
      <p class="small muted">Thank you. This page sends nothing else; reload to send another.</p>
    </div>`;
  }
  switch (o.kind) {
    case 'treasury-unset':
      return panel('undetermined', esc(TREASURY_UNSET_TEXT));
    case 'invalid-amount':
      return panel('error', `Nothing was sent: ${esc(o.reason)}`);
    case 'self-payment':
      return panel('error', 'This wallet is the treasury itself, so nothing was sent.');
    case 'already-sent':
      return panel(
        'undetermined',
        'A payment from this page may already have reached the network. Reload and check your wallet before sending again.',
      );
    case 'rejected':
      return panel('note', 'You declined in your wallet. Nothing was signed or sent.');
    case 'build-failed':
      return panel(
        'error',
        `The payment could not be built, so nothing was sent: ${esc(o.detail)}`,
      );
    case 'simulation-failed':
      return panel(
        'error',
        `The network's simulation refused the payment, so nothing was sent: ${esc(o.detail)}`,
      );
    case 'restore-required':
      return panel(
        'error',
        `The simulation says archived state must be restored first. This page does not restore, so nothing was sent: ${esc(o.detail)}`,
      );
    case 'possibly-signed':
      return panel(
        'undetermined',
        'Your wallet did not answer in time, and its prompt may still be open. If you approve it there, this page will not send it, so nothing is paid. Reload and check your wallet before trying again.',
      );
    case 'submit-failed':
      return panel(
        'error',
        `Sending the payment failed (${esc(o.detail)}). Whether the network took it is not certain, so this page will not send another: check your wallet first.`,
      );
    case 'failed-on-chain':
      return panel(
        'error',
        `The payment reached the network and failed there. Transaction <span class="mono">${esc(o.hash)}</span>: ${esc(o.detail)}`,
      );
    case 'pending':
      return panel(
        'undetermined',
        `The network accepted the payment but it was not confirmed while we waited. Transaction <span class="mono">${esc(
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
