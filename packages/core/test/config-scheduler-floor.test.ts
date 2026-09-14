import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { MIN_SAFE_ACTION_WINDOW_LEDGERS, loadConfig } from '../src/config.js';

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
