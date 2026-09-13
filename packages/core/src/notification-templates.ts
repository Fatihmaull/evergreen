import type { BumpRecord, LedgerEntryTTL } from '@evergreen-stellar/shared-types';
import { assessEntry } from './health.js';

/**
 * Notification bodies (`W3-D17-03`). Pure — no transport, no secrets, no clock
 * beyond what the record carries — so `W3-D17-01`'s `EmailChannel` renders them
 * and this module can be exercised without sending anything.
 *
 * Three things these must never do, each of which this project has already been
 * bitten by somewhere else:
 *
 *   - **Call `submitted` a success.** A submitted-but-unconfirmed hash is the
 *     one state that looks like success and is not. `assertLiveness` refuses to
 *     grant it silence; an email must not grant it either.
 *   - **Offer restore for a temporary entry.** Temporary data is DELETED at
 *     expiry, not archived. Telling someone to restore it is a lie with a
 *     deadline on it.
 *   - **Report a shared entry as one contract's problem.** A shared code entry
 *     at three days is N contracts at three days.
 */

export interface Notification {
  readonly subject: string;
  readonly body: string;
  /** Routing hint. `critical` is reserved for unrecoverable or widespread. */
  readonly severity: 'info' | 'warn' | 'critical';
}

const short = (key: string): string => `${key.slice(0, 10)}…`;

function contractsLine(record: Pick<BumpRecord, 'contracts'>): string {
  const n = record.contracts.length;
  return n === 1
    ? `Contract: ${record.contracts[0]}`
    : `Contracts (${n} — these fail together): ${record.contracts.join(', ')}`;
}

/** A confirmed extension, and only a confirmed one. */
export function bumpSucceeded(record: Extract<BumpRecord, { outcome: 'succeeded' }>): Notification {
  const gained = record.after.endsAtLedger - record.before.endsAtLedger;
  return {
    severity: 'info',
    subject: `Evergreen extended ${short(record.entryKey)} (+${gained.toLocaleString()} ledgers)`,
    body: [
      `Extended and CONFIRMED on Stellar Testnet.`,
      '',
      contractsLine(record),
      `Entry: ${record.entryKey}`,
      `Transaction: ${record.transactionHash}`,
      `Live until: ledger ${record.before.endsAtLedger.toLocaleString()} → ${record.after.endsAtLedger.toLocaleString()}`,
      record.paidFeeStroops ? `Fee paid: ${record.paidFeeStroops} stroops` : '',
      '',
      'Confirmed means the transaction succeeded AND the new TTL was read back.',
      'Ledgers are the truth; any wall-clock date elsewhere is an estimate.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * A failure, or a submission we cannot yet call either way.
 *
 * `submitted` is deliberately routed here rather than to `bumpSucceeded`: the
 * transaction may well have worked, and saying so before reading the TTL back
 * is exactly the claim this project refuses to make.
 */
export function bumpFailed(
  record: Extract<BumpRecord, { outcome: 'failed' | 'submitted' }>,
): Notification {
  const unresolved = record.outcome === 'submitted';
  return {
    severity: 'critical',
    subject: unresolved
      ? `⚠ Evergreen submitted but UNCONFIRMED: ${short(record.entryKey)}`
      : `✖ Evergreen failed to extend ${short(record.entryKey)}`,
    body: [
      unresolved
        ? 'A transaction was SUBMITTED and has not been confirmed. It may have succeeded.'
        : 'The extension did not happen. This entry is still on its original TTL.',
      '',
      contractsLine(record),
      `Entry: ${record.entryKey}`,
      'transactionHash' in record && record.transactionHash
        ? `Transaction: ${record.transactionHash}`
        : '',
      !unresolved && 'error' in record
        ? `Reason: ${record.error.code} — ${record.error.message}`
        : '',
      '',
      unresolved
        ? 'DO NOT retry blindly. Reconcile this hash first — a replacement send\n' +
          'against the same sequence can double-spend the fee or land twice.'
        : 'Nothing was left pending. A retry is safe once the cause is understood.',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}

/**
 * An entry approaching its threshold that the engine did NOT extend — because
 * policy declined, a guard refused, or nothing acted.
 *
 * Severity comes from `assessEntry` rather than being restated here, so the
 * email and the CLI cannot disagree about how bad something is.
 */
export function approachingCritical(
  entry: LedgerEntryTTL,
  entryKey: string,
  thresholdLedgers: number,
  why?: string,
): Notification {
  const a = assessEntry(entry, thresholdLedgers);
  const remaining =
    entry.ttl.status === 'known' ? entry.ttl.remainingLedgers.toLocaleString() : 'unreadable';
  return {
    severity: a.health === 'critical' ? 'critical' : a.health === 'unknown' ? 'warn' : 'warn',
    subject:
      a.health === 'critical'
        ? `🔴 Evergreen: ${short(entryKey)} is CRITICAL (${remaining} ledgers)`
        : `Evergreen: ${short(entryKey)} is low (${remaining} ledgers)`,
    body: [
      a.reason,
      '',
      `Entry: ${entryKey}`,
      `Remaining: ${remaining} ledgers` +
        (entry.ttl.status === 'known' ? ` (threshold ${thresholdLedgers.toLocaleString()})` : ''),
      a.sharingStatus === 'shared'
        ? `SHARED by ${a.blastRadiusAtLeast} contracts — all of them fail together.`
        : a.sharingStatus === 'undetermined'
          ? 'This scan saw one contract on it. A code entry may serve others it cannot see.'
          : '',
      entry.endBehavior === 'deleted'
        ? 'TEMPORARY: this data is DELETED at expiry, not archived. It cannot be restored.'
        : '',
      why ? `\nThe engine did not extend it: ${why}` : '',
    ]
      .filter(Boolean)
      .join('\n'),
  };
}
