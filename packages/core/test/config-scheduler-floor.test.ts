import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  MIN_SAFE_ACTION_WINDOW_LEDGERS,
  SCHEDULER_GAP_FLOOR_MINUTES,
  WORST_OBSERVED_SCHEDULER_GAP_MINUTES,
  loadConfig,
} from '../src/config.js';

/**
 * The action threshold and the SCHEDULER'S cadence are two configurable numbers
 * that must stand in a relation, and nothing enforced it.
 *
 * Set a threshold shorter than the scheduler's worst gap and the engine
 * silently never fires inside its own window: no error, no alarm, an entry
 * archiving while every run reports healthy. Same shape as
 * `timeout-minutes < cron interval` — two numbers, a real dependency, and
 * documentation the machine cannot read.
 */

const base = JSON.parse(readFileSync('evergreen.config.dogfood.json', 'utf8')) as Record<
  string,
  unknown
>;

function withThreshold(below: number): string {
  const c = JSON.parse(JSON.stringify(base)) as {
    defaults: { bumpWhenRemainingLedgersBelow: number; extendToLedgers: number };
  };
  c.defaults.bumpWhenRemainingLedgersBelow = below;
  c.defaults.extendToLedgers = Math.max(below + 1, c.defaults.extendToLedgers);
  return JSON.stringify(c);
}

const schedulerWarnings = (raw: string) =>
  loadConfig(raw).warnings.filter((w) => w.includes('SCHEDULER limit'));

describe('🔴 action threshold vs scheduler cadence', () => {
  it('warns when the action window is shorter than the scheduler can serve', () => {
    // ~2 hours of warning against a 5.5-hour worst gap: the window can close
    // between runs entirely.
    const [w] = schedulerWarnings(withThreshold(1_440));
    expect(w).toBeDefined();
    expect(w).toContain('1,440 ledgers');
  });

  it('names the SCHEDULER as the cause, not Soroban', () => {
    // A user who reads "too low" as a protocol rule goes looking in the wrong
    // documentation and concludes the tool is wrong about the chain.
    const [w] = schedulerWarnings(withThreshold(1_440));
    expect(w).toContain('SCHEDULER limit, not a Soroban one');
    expect(w).toMatch(/331 minutes|7\.5%/);
  });

  it('says what actually goes wrong, not just that it is low', () => {
    const [w] = schedulerWarnings(withThreshold(1_440));
    expect(w).toContain('archives while every run reports healthy');
  });

  it('does not warn at the shipped default of 17,280', () => {
    // A warning on the default configuration is a warning everyone learns to
    // ignore.
    expect(schedulerWarnings(withThreshold(17_280))).toHaveLength(0);
  });

  it('does not warn exactly at the floor — the comparison is inclusive', () => {
    expect(schedulerWarnings(withThreshold(MIN_SAFE_ACTION_WINDOW_LEDGERS))).toHaveLength(0);
  });

  it('warns one ledger below the floor', () => {
    expect(schedulerWarnings(withThreshold(MIN_SAFE_ACTION_WINDOW_LEDGERS - 1))).toHaveLength(1);
  });

  it('WARNS rather than refuses — a short threshold is valid on a measured scheduler', () => {
    // Refusing would block a correct self-hosted config on a real cron.
    expect(() => loadConfig(withThreshold(600))).not.toThrow();
  });
});

describe('the measurement and the floor are separate numbers', () => {
  /**
   * Split on 2026-09-15 after one constant did both jobs and drifted overnight:
   * recorded as 331, re-measured at 369 nine hours later. A floor that tracks the
   * observed maximum thrashes — every fresh measurement retroactively invalidates
   * fixtures and fails configurations that were correct the day before.
   *
   * So the measurement is free to rise and the floor is not, and the gap between
   * them is the headroom that makes that safe. This test exists to fail if
   * someone closes that gap by setting the floor to the measurement again.
   */
  it('🔴 keeps deliberate headroom between the observation and the policy', () => {
    expect(SCHEDULER_GAP_FLOOR_MINUTES).toBeGreaterThan(WORST_OBSERVED_SCHEDULER_GAP_MINUTES);
    // The documented review trigger: headroom is "consumed" at 80% of the floor.
    // Below that, a fresh measurement is expected to land without moving policy.
    expect(WORST_OBSERVED_SCHEDULER_GAP_MINUTES).toBeLessThan(SCHEDULER_GAP_FLOOR_MINUTES * 0.8);
  });

  /**
   * 🔴 Recorded finding, deliberately NOT fixed before 2026-09-26.
   *
   * The action window is still derived from 331, the measurement as of
   * 2026-09-14. At the current 369 it would be 17,712 ledgers and the default
   * action threshold of 17,280 would fall below it — 3.9 scheduler runs of margin
   * against the 4 it exists to guarantee. 17,280 only ever cleared by accident:
   * it was chosen before the scheduler was measured at all.
   *
   * Raising the number that governs when the engine acts, in the week guinea-pig
   * B crosses, is the wrong week. This asserts the arithmetic so the finding
   * cannot be lost, and fails if someone changes the basis without revisiting it.
   */
  it('records the frozen action-window basis and what the current measurement implies', () => {
    const SECONDS_PER_LEDGER = 5;
    const runs = 4;
    expect(MIN_SAFE_ACTION_WINDOW_LEDGERS).toBe(Math.ceil((331 * runs * 60) / SECONDS_PER_LEDGER));
    expect(MIN_SAFE_ACTION_WINDOW_LEDGERS).toBe(15_888);
    const atCurrentMeasurement = Math.ceil(
      (WORST_OBSERVED_SCHEDULER_GAP_MINUTES * runs * 60) / SECONDS_PER_LEDGER,
    );
    expect(atCurrentMeasurement).toBe(17_712);
    // The default action threshold, unchanged, sits below that.
    expect(17_280).toBeLessThan(atCurrentMeasurement);
  });
});
