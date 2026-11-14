import { describe, expect, it } from 'vitest';
import {
  ALLOWANCE_EXPIRING_BANDS,
  TEMPORARY_APPROACHING_LEDGERS,
  allowanceExpiringDue,
  allowanceExpiringEventId,
  approachingCriticalDue,
  approachingCriticalEventId,
  approachingCriticalThresholdLedgers,
} from '../src/alert-ledger.js';
import { DEFAULT_CRITICAL_LEDGERS, DEFAULT_WARN_LEDGERS } from '../src/health.js';
import { SECONDS_PER_LEDGER } from '../src/ttl.js';

const DAY = 86_400 / SECONDS_PER_LEDGER;

describe('approaching_critical threshold', () => {
  it('uses 17,280 for persistent and code, and 180 for temporary', () => {
    expect(approachingCriticalThresholdLedgers('persistent')).toBe(DEFAULT_CRITICAL_LEDGERS);
    expect(approachingCriticalThresholdLedgers('code')).toBe(DEFAULT_CRITICAL_LEDGERS);
    expect(approachingCriticalThresholdLedgers('temporary')).toBe(TEMPORARY_APPROACHING_LEDGERS);
    expect(TEMPORARY_APPROACHING_LEDGERS).toBe(180);
  });

  it('a fresh temporary entry of 720 ledgers is not due', () => {
    expect(approachingCriticalDue(720, 'temporary')).toBe(false);
    expect(approachingCriticalDue(180, 'temporary')).toBe(true);
    expect(approachingCriticalDue(181, 'temporary')).toBe(false);
  });

  it('persistent fires at 17,280 and not one ledger above', () => {
    expect(approachingCriticalDue(DEFAULT_CRITICAL_LEDGERS, 'persistent')).toBe(true);
    expect(approachingCriticalDue(DEFAULT_CRITICAL_LEDGERS + 1, 'persistent')).toBe(false);
    expect(approachingCriticalDue(0, 'code')).toBe(true);
  });
});

describe('allowance_expiring bands', () => {
  it('is 30, 7 and 1 day at 86400 / SECONDS_PER_LEDGER, not a health import', () => {
    expect(ALLOWANCE_EXPIRING_BANDS.map((band) => [band.ledgers, band.severity])).toEqual([
      [30 * DAY, 'info'],
      [7 * DAY, 'warn'],
      [1 * DAY, 'critical'],
    ]);
    expect(ALLOWANCE_EXPIRING_BANDS.map((band) => band.ledgers)).toEqual([
      518_400, 120_960, 17_280,
    ]);
    // 7 and 1 currently match the health tiers. 30 must not be DEFAULT_WARN.
    expect(7 * DAY).toBe(DEFAULT_WARN_LEDGERS);
    expect(1 * DAY).toBe(DEFAULT_CRITICAL_LEDGERS);
    expect(30 * DAY).not.toBe(DEFAULT_WARN_LEDGERS);
  });

  it('returns every band the remaining ledgers have reached, widest first', () => {
    expect(allowanceExpiringDue(518_401)).toEqual([]);
    expect(allowanceExpiringDue(518_400).map((band) => band.severity)).toEqual(['info']);
    expect(allowanceExpiringDue(120_960).map((band) => band.severity)).toEqual(['info', 'warn']);
    expect(allowanceExpiringDue(17_280).map((band) => band.severity)).toEqual([
      'info',
      'warn',
      'critical',
    ]);
    expect(allowanceExpiringDue(0).map((band) => band.severity)).toEqual([
      'info',
      'warn',
      'critical',
    ]);
  });
});

describe('event ids', () => {
  it('builds the approaching-critical shape', () => {
    expect(
      approachingCriticalEventId({
        network: 'testnet',
        contractId: 'C1',
        entryKey: 'contract-instance',
        liveUntilLedger: 100n,
      }),
    ).toBe('approaching-critical:testnet:C1:contract-instance:100');
  });

  it('builds the allowance-expiring shape with the band', () => {
    expect(
      allowanceExpiringEventId({
        network: 'testnet',
        account: 'GAAA',
        spender: 'GBBB',
        liveUntilLedger: 9000,
        bandLedgers: 17_280,
      }),
    ).toBe('allowance-expiring:testnet:GAAA:GBBB:9000:17280');
  });

  it('refuses an empty segment and an unknown band', () => {
    expect(() =>
      approachingCriticalEventId({
        network: 'testnet',
        contractId: '',
        entryKey: 'k',
        liveUntilLedger: 1,
      }),
    ).toThrow(/contractId/);
    expect(() =>
      allowanceExpiringEventId({
        network: 'testnet',
        account: 'GAAA',
        spender: 'GBBB',
        liveUntilLedger: 1,
        bandLedgers: 180 as 17_280,
      }),
    ).toThrow(/bandLedgers/);
  });
});
