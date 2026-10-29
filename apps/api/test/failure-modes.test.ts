/**
 * PH2-E4-05 (docs/PH2-E4-05-FAILURE-MODES.md): mapping, detectors and the
 * per-user pulled-then-failed rate. Pure; the global fetch throws.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALERT_SPECS,
  FAILURE_MODES,
  FAILURE_MODE_ALERTS,
  API_REQUIRED_SETTINGS,
  alertModeMismatches,
  gapMarginHolds,
  missingApiSettings,
  thresholdFloorProblem,
  tickGaps,
  duplicatePulls,
  isPreflightFailed,
  isPulledThenFailed,
  isRefundOwed,
  isTryAgainLater,
  pulledThenFailedRates,
  reconcileProblems,
  type AlertKind,
  type LedgerFact,
} from '../src/index.js';

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('failure-mode mapping', () => {
  it('covers F1..F19 exactly, each with an operator alert', () => {
    expect(FAILURE_MODES).toHaveLength(19);
    expect(Object.keys(FAILURE_MODE_ALERTS).sort()).toEqual([...FAILURE_MODES].sort());
    for (const m of FAILURE_MODES) expect(FAILURE_MODE_ALERTS[m].operator).toBeDefined();
  });

  it('agrees with ALERT_SPECS both ways', () => {
    expect(alertModeMismatches()).toEqual([]);
    for (const [kind, spec] of Object.entries(ALERT_SPECS)) {
      if (spec.mode === null) continue;
      const u = FAILURE_MODE_ALERTS[spec.mode].user;
      expect(u.kind === 'email' && u.alerts.includes(kind as AlertKind)).toBe(true);
    }
  });

  it('emails users only for the modes E2-06 §3 lists', () => {
    const emailed = FAILURE_MODES.filter((m) => FAILURE_MODE_ALERTS[m].user.kind === 'email');
    expect(emailed).toEqual(['F1', 'F2', 'F4', 'F6', 'F7', 'F10', 'F19']);
  });

  it('marks F6 as the highest-severity operator alert', () => {
    expect(FAILURE_MODE_ALERTS.F6.operator).toEqual({ when: 'every', highest: true });
  });
});

describe('detectors', () => {
  it('F1 / F4', () => {
    expect(isPreflightFailed({ status: 'preflight-failed', pulled: false })).toBe(true);
    expect(isPreflightFailed({ status: 'queued', pulled: false })).toBe(false);
    expect(isPulledThenFailed({ status: 'refunded', pulled: true })).toBe(true);
    expect(isPulledThenFailed({ status: 'refunded', pulled: false })).toBe(false);
    expect(isPulledThenFailed({ status: 'extended', pulled: true })).toBe(false);
  });

  it('F6: owed only after a pull and a final extend failure, until refund confirms', () => {
    expect(isRefundOwed({ pulled: true, extendFinallyFailed: true, refundConfirmed: false })).toBe(
      true,
    );
    expect(isRefundOwed({ pulled: true, extendFinallyFailed: true, refundConfirmed: true })).toBe(
      false,
    );
    expect(isRefundOwed({ pulled: true, extendFinallyFailed: false, refundConfirmed: false })).toBe(
      false,
    );
    expect(isRefundOwed({ pulled: false, extendFinallyFailed: true, refundConfirmed: false })).toBe(
      false,
    );
  });

  it('F5: any TRY_AGAIN_LATER, exact match', () => {
    expect(isTryAgainLater('TRY_AGAIN_LATER')).toBe(true);
    expect(isTryAgainLater('ERROR')).toBe(false);
  });

  it('F7: balanced job with network-fee outside the sum has no problem', () => {
    const rows: LedgerFact[] = [
      { jobId: 'j1', kind: 'pull', amountStroops: 1000n, txHash: 'a' },
      { jobId: 'j1', kind: 'rent', amountStroops: 800n, txHash: null },
      { jobId: 'j1', kind: 'evergreen-fee', amountStroops: 200n, txHash: null },
      { jobId: 'j1', kind: 'network-fee', amountStroops: 50n, txHash: 'b' },
    ];
    expect(reconcileProblems(rows)).toEqual([]);
  });

  it('F7: full refund balances; unbalanced and missing txHash are reported', () => {
    expect(
      reconcileProblems([
        { jobId: 'j2', kind: 'pull', amountStroops: 1000n, txHash: 'a' },
        { jobId: 'j2', kind: 'refund', amountStroops: 1000n, txHash: 'c' },
      ]),
    ).toEqual([]);
    expect(
      reconcileProblems([
        { jobId: 'j3', kind: 'pull', amountStroops: 1000n, txHash: null },
        { jobId: 'j3', kind: 'rent', amountStroops: 900n, txHash: null },
      ]),
    ).toEqual([
      { jobId: 'j3', problem: 'stored_row_without_tx', kind: 'pull' },
      { jobId: 'j3', problem: 'unbalanced', pull: 1000n, accounted: 900n },
    ]);
  });

  it('F12: duplicate pulls per job', () => {
    expect(duplicatePulls([{ jobId: 'a' }, { jobId: 'b' }, { jobId: 'a' }])).toEqual(['a']);
    expect(duplicatePulls([{ jobId: 'a' }])).toEqual([]);
  });
});

describe('pulled-then-failed rate', () => {
  it('counts per user over pulled jobs only', () => {
    const r = pulledThenFailedRates([
      { userId: 'u1', status: 'extended', pulled: true },
      { userId: 'u1', status: 'refunded', pulled: true },
      { userId: 'u1', status: 'preflight-failed', pulled: false },
      { userId: 'u2', status: 'extended', pulled: true },
    ]);
    expect(r.get('u1')).toEqual({ pulled: 2, pulledThenFailed: 1, rate: 0.5 });
    expect(r.get('u2')).toEqual({ pulled: 1, pulledThenFailed: 0, rate: 0 });
  });

  it('a user with no pulls has no rate (undetermined, not 0)', () => {
    const r = pulledThenFailedRates([{ userId: 'u3', status: 'preflight-failed', pulled: false }]);
    expect(r.has('u3')).toBe(false);
  });
});

describe('detectors over inputs on main', () => {
  it('tickGaps: worst gap, non-increasing steps, no gap from < 2 ticks', () => {
    expect(tickGaps([]).worstGapLedgers).toBeUndefined();
    expect(tickGaps([{ tickedAt: 1, observedLedger: 10n }]).worstGapLedgers).toBeUndefined();
    const g = tickGaps([
      { tickedAt: 3, observedLedger: 160n },
      { tickedAt: 1, observedLedger: 100n },
      { tickedAt: 2, observedLedger: 112n },
      { tickedAt: 4, observedLedger: 150n },
    ]);
    expect(g.worstGapLedgers).toBe(48n);
    expect(g.nonIncreasing).toEqual([{ from: 160n, to: 150n }]);
  });

  it('gapMarginHolds: 4x worst < lowest threshold, undefined when unknown', () => {
    expect(gapMarginHolds(10n, 41n)).toBe(true);
    expect(gapMarginHolds(10n, 40n)).toBe(false);
    expect(gapMarginHolds(undefined, 40n)).toBeUndefined();
    expect(gapMarginHolds(10n, undefined)).toBeUndefined();
  });

  it('thresholdFloorProblem follows the watchlist mount rule', () => {
    expect(thresholdFloorProblem({})).toBe('unset');
    expect(thresholdFloorProblem({ THRESHOLD_FLOOR_LEDGERS: '' })).toBe('unset');
    expect(thresholdFloorProblem({ THRESHOLD_FLOOR_LEDGERS: '0' })).toBe('malformed');
    expect(thresholdFloorProblem({ THRESHOLD_FLOOR_LEDGERS: '12x' })).toBe('malformed');
    expect(thresholdFloorProblem({ THRESHOLD_FLOOR_LEDGERS: '720' })).toBeNull();
  });

  it('missingApiSettings names missing settings, never values', () => {
    const full = Object.fromEntries(API_REQUIRED_SETTINGS.map((n) => [n, 'v']));
    expect(missingApiSettings(full)).toEqual([]);
    expect(missingApiSettings({ ...full, EMAIL_FROM: ' ', DATABASE_URL: undefined })).toEqual([
      'DATABASE_URL',
      'EMAIL_FROM',
    ]);
  });

  it('mapping names the new detectors', () => {
    expect(FAILURE_MODE_ALERTS.F11.detector).toMatch(/^tickGaps/);
    expect(FAILURE_MODE_ALERTS.F17.detector).toMatch(/^thresholdFloorProblem/);
    expect(FAILURE_MODE_ALERTS.F18.detector).toMatch(/^missingApiSettings/);
  });
});
