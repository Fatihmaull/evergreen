/**
 * Ledger facts for the two optional user alerts (PH2-E2-06, #612).
 *
 * Pure. No clock, no database, no email. The migration is
 * `apps/api/db/0015_alert_ledger_facts.sql`. Nothing here calls
 * `dispatchUserAlert` or writes a row.
 *
 * Compare with `needsAction` only. The 5-second cadence names the allowance
 * bands (`86400 / SECONDS_PER_LEDGER`); it is not stored and it is not a
 * second constant. 518,400 is 30 days at that rate and is not
 * `DEFAULT_WARN_LEDGERS`, so a later health-tier edit does not move the
 * 30-day reminder.
 */
import { DEFAULT_CRITICAL_LEDGERS } from './health.js';
import { SECONDS_PER_LEDGER, needsAction } from './ttl.js';

/** One production tick (W = 180). Below `min_temporary_ttl` (720). */
export const TEMPORARY_APPROACHING_LEDGERS = 180;

const LEDGERS_PER_DAY = 86_400 / SECONDS_PER_LEDGER;
if (!Number.isInteger(LEDGERS_PER_DAY)) {
  throw new Error('SECONDS_PER_LEDGER does not divide a day into an integer ledger count');
}

export type AlertEntryKind = 'persistent' | 'temporary' | 'code';

export type AllowanceSeverity = 'info' | 'warn' | 'critical';

export interface AllowanceExpiringBand {
  readonly ledgers: number;
  readonly severity: AllowanceSeverity;
}

/** 30, 7, then 1 day, in that order. Tightest last. */
export const ALLOWANCE_EXPIRING_BANDS: readonly AllowanceExpiringBand[] = [
  { ledgers: 30 * LEDGERS_PER_DAY, severity: 'info' },
  { ledgers: 7 * LEDGERS_PER_DAY, severity: 'warn' },
  { ledgers: 1 * LEDGERS_PER_DAY, severity: 'critical' },
];

/** Persistent and code use 17,280. Temporary uses 180, not 17,280. */
export function approachingCriticalThresholdLedgers(kind: AlertEntryKind): number {
  return kind === 'temporary' ? TEMPORARY_APPROACHING_LEDGERS : DEFAULT_CRITICAL_LEDGERS;
}

export function approachingCriticalDue(remainingLedgers: number, kind: AlertEntryKind): boolean {
  return needsAction(remainingLedgers, approachingCriticalThresholdLedgers(kind));
}

/** Every band the remaining ledgers have reached, widest first. */
export function allowanceExpiringDue(remainingLedgers: number): readonly AllowanceExpiringBand[] {
  return ALLOWANCE_EXPIRING_BANDS.filter((band) => needsAction(remainingLedgers, band.ledgers));
}

export interface ApproachingCriticalEventId {
  readonly network: string;
  readonly contractId: string;
  readonly entryKey: string;
  readonly liveUntilLedger: bigint | number;
}

export interface AllowanceExpiringEventId {
  readonly network: string;
  readonly account: string;
  readonly spender: string;
  readonly liveUntilLedger: bigint | number;
  readonly bandLedgers: (typeof ALLOWANCE_EXPIRING_BANDS)[number]['ledgers'];
}

function segment(name: string, value: string): string {
  if (value.length === 0) throw new Error(`${name} is empty`);
  return value;
}

/** `approaching-critical:{network}:{contractId}:{entryKey}:{liveUntilLedger}` */
export function approachingCriticalEventId(id: ApproachingCriticalEventId): string {
  return [
    'approaching-critical',
    segment('network', id.network),
    segment('contractId', id.contractId),
    segment('entryKey', id.entryKey),
    segment('liveUntilLedger', String(id.liveUntilLedger)),
  ].join(':');
}

/** `allowance-expiring:{network}:{account}:{spender}:{liveUntilLedger}:{band}` */
export function allowanceExpiringEventId(id: AllowanceExpiringEventId): string {
  const known = ALLOWANCE_EXPIRING_BANDS.some((band) => band.ledgers === id.bandLedgers);
  if (!known) throw new Error(`bandLedgers ${id.bandLedgers} is not an allowance lead`);
  return [
    'allowance-expiring',
    segment('network', id.network),
    segment('account', id.account),
    segment('spender', id.spender),
    segment('liveUntilLedger', String(id.liveUntilLedger)),
    String(id.bandLedgers),
  ].join(':');
}
