import { describe, expect, it } from 'vitest';
import {
  DEFAULT_CRITICAL_LEDGERS,
  DEFAULT_THRESHOLDS,
  DEFAULT_WARN_LEDGERS,
} from '../src/health.js';
import { SECONDS_PER_LEDGER, needsAction } from '../src/ttl.js';

/**
 * The two-tier decision (Fatih, 2026-09-10), pinned as arithmetic rather than
 * as two numbers someone can later "tidy".
 */

const LEDGERS_PER_DAY = (24 * 60 * 60) / SECONDS_PER_LEDGER;

describe('two horizons, because warning and acting are different questions', () => {
  it('warns a week out — six failed daily runs of margin', () => {
    // The whole reason the tier exists. A one-day horizon leaves exactly one
    // scheduled run to act, so a single missed run has no second chance.
    const days = DEFAULT_WARN_LEDGERS / LEDGERS_PER_DAY;
    expect(days).toBe(7);
    expect(Math.floor(days) - 1).toBe(6);
  });

  it('keeps the tight value as CRITICAL, where tightness is a feature', () => {
    expect(DEFAULT_CRITICAL_LEDGERS / LEDGERS_PER_DAY).toBe(1);
  });

  it('🔴 the warning horizon must be strictly wider than the action one', () => {
    // Collapsed, they force the choice the split exists to avoid: miss things,
    // or cry wolf. Equal values are the single-threshold design again.
    expect(DEFAULT_THRESHOLDS.warnBelowLedgers).toBeGreaterThan(
      DEFAULT_THRESHOLDS.criticalBelowLedgers,
    );
  });

  it('gives the warning tier a margin of several runs, not one', () => {
    // Pins the PROPERTY rather than the number: whatever the values become,
    // the gap must survive more than a single missed daily run.
    const marginDays =
      (DEFAULT_THRESHOLDS.warnBelowLedgers - DEFAULT_THRESHOLDS.criticalBelowLedgers) /
      LEDGERS_PER_DAY;
    expect(marginDays).toBeGreaterThanOrEqual(3);
  });

  it('both tiers use the same floor predicate — no third copy of the comparison', () => {
    expect(needsAction(DEFAULT_WARN_LEDGERS, DEFAULT_WARN_LEDGERS)).toBe(true);
    expect(needsAction(DEFAULT_WARN_LEDGERS + 1, DEFAULT_WARN_LEDGERS)).toBe(false);
    expect(needsAction(DEFAULT_CRITICAL_LEDGERS, DEFAULT_CRITICAL_LEDGERS)).toBe(true);
  });
});
