import { describe, it, expect } from 'vitest';
import { assessScheduler } from '../src/scheduler-watch.js';
import {
  SCHEDULER_GAP_FLOOR_MINUTES,
  WORST_OBSERVED_SCHEDULER_GAP_MINUTES,
} from '@evergreen-stellar/core';
const now = Date.parse('2026-09-14T12:00:00Z');
const policy = {
  startAt: now - 24 * 3600000,
  endAt: now + 3600000,
  warnMinutes: 420,
  criticalMinutes: 540,
  maxRunMinutes: 10,
};
describe('independent schedule observation', () => {
  it('does not treat queued metadata as an actual execution', () => {
    const r = assessScheduler({
      now,
      policy,
      jobs: [{ id: '1', status: 'queued', startedAt: null, completedAt: null }],
    });
    expect(r.status).toBe('missing');
    expect(r.severity).toBe('critical');
  });
  it('uses actual job timestamps and grades lateness', () => {
    // Timed relative to the policy rather than to a literal, so this keeps
    // testing lateness when the floors move. It was `now - 40 min` against a
    // warn of 30; the warn tier is now floored at the measured worst gap (369),
    // which made that job healthy and the assertion vacuous.
    const late = (policy.warnMinutes + 10) * 60000;
    const job = {
      id: '1',
      status: 'completed' as const,
      startedAt: now - late,
      completedAt: now - late + 5 * 60000,
      conclusion: 'success',
    };
    expect(assessScheduler({ now, policy, jobs: [job] })).toMatchObject({
      status: 'late',
      severity: 'warn',
    });
    expect(
      assessScheduler({ now, policy, jobs: [{ ...job, startedAt: now - 60000, completedAt: now }] })
        .status,
    ).toBe('healthy');
  });
  it('reports failures, stalled jobs and unavailable observation distinctly', () => {
    const job = {
      id: '1',
      status: 'completed' as const,
      startedAt: now - 60000,
      completedAt: now,
      conclusion: 'failure',
    };
    expect(assessScheduler({ now, policy, jobs: [job] }).status).toBe('failed');
    expect(
      assessScheduler({
        now,
        policy,
        jobs: [{ ...job, status: 'in_progress', startedAt: now - 11 * 60000, completedAt: null }],
      }).status,
    ).toBe('stalled');
    expect(assessScheduler({ now, policy, jobs: null }).status).toBe('observer-error');
  });
  it('has stable incident identity across polling and stops outside the window', () => {
    const a = assessScheduler({ now, policy, jobs: [] }),
      b = assessScheduler({ now: now + 60000, policy, jobs: [] });
    expect(a.incidentId).toBe(b.incidentId);
    expect(assessScheduler({ now: policy.endAt, policy, jobs: null }).status).toBe('inactive');
  });
  it('rejects future or malformed timing as observer error, not healthy', () => {
    expect(
      assessScheduler({
        now,
        policy,
        jobs: [
          {
            id: '1',
            status: 'completed',
            startedAt: now + 60000,
            completedAt: now + 70000,
            conclusion: 'success',
          },
        ],
      }).status,
    ).toBe('observer-error');
  });
  /**
   * The policy invariants, which nothing else defends.
   *
   * Added 2026-09-14 after a commissioned mutation: deleting
   * `p.warnMinutes < p.maxRunMinutes` from the validation left all five tests
   * green, and a job legitimately still running at 7 minutes under
   * `warn=5, maxRun=10` then reports `late/warn` — a permanent false alarm on a
   * healthy scheduler. That is the failure this watcher exists to distinguish
   * from a real one, so the invariant is load-bearing and was untested.
   *
   * Checked against the redundancy question before adding: there is no second
   * layer here. Removing the throw changes observable behaviour on its own.
   */
  it('🔴 refuses a policy that would alarm on a normally-running job', () => {
    // warn below maxRun: anything still running is "late" before it is allowed
    // to finish.
    expect(() => assessScheduler({ now, policy: { ...policy, warnMinutes: 5 }, jobs: [] })).toThrow(
      /policy/i,
    );
    // critical must sit strictly above warn, or the two tiers collapse and the
    // warning horizon disappears.
    expect(() =>
      assessScheduler({
        now,
        policy: { ...policy, criticalMinutes: policy.warnMinutes },
        jobs: [],
      }),
    ).toThrow(/policy/i);
    // A window that ends before it starts silently disables the watcher.
    expect(() =>
      assessScheduler({ now, policy: { ...policy, endAt: policy.startAt }, jobs: [] }),
    ).toThrow(/policy/i);
    // The boundary that matters is now the measurement floor, not maxRunMinutes:
    // warn === WORST_OBSERVED stays legal, so this rejects bad policies rather
    // than most policies.
    expect(() =>
      assessScheduler({
        now,
        policy: { ...policy, warnMinutes: WORST_OBSERVED_SCHEDULER_GAP_MINUTES },
        jobs: [],
      }),
    ).not.toThrow();
  });
  /**
   * The floor that ties this policy to a measurement instead of to taste.
   *
   * Declared cadence is 15 minutes. Measured 2026-09-15: a 136-minute median
   * and a 369-minute worst gap. So `criticalMinutes: 30` looks entirely
   * reasonable to someone reading the cron expression, and alarms almost
   * continuously — and alarm fatigue on this watcher hides the outage it exists
   * to catch. Every real policy in the repo already uses 360; nothing enforced
   * that, and `W3-D21-01e` is Fatih standing the engine up cold from the written
   * guide, which means writing a policy file from scratch. That test runs once.
   */
  it('🔴 refuses a critical tier below the agreed floor', () => {
    expect(SCHEDULER_GAP_FLOOR_MINUTES).toBe(480);
    expect(() =>
      assessScheduler({
        now,
        policy: { ...policy, criticalMinutes: SCHEDULER_GAP_FLOOR_MINUTES - 1 },
        jobs: [],
      }),
    ).toThrow(/policy/i);
    // The measured value itself is legal — this is a floor, not a margin.
    expect(() =>
      assessScheduler({
        now,
        policy: { ...policy, criticalMinutes: SCHEDULER_GAP_FLOOR_MINUTES },
        jobs: [],
      }),
    ).not.toThrow();
    // And the value every real policy already uses stays legal.
    expect(() => assessScheduler({ now, policy, jobs: [] })).not.toThrow();
  });
  /**
   * Each tier is anchored to a different constant, because they mean different
   * things — not two points on one scale.
   *
   *   warn     >= WORST_OBSERVED (369)  "worse than anything we have seen"
   *   critical >= FLOOR          (480)  "past what we are willing to allow"
   *
   * The warn floor was missing until 2026-09-15, and the gap was live rather than
   * theoretical: the weekend watcher config covering guinea-pig B's crossing
   * shipped with `warnMinutes: 30` against a 136-minute median — a warning on
   * every gap the scheduler has ever produced. By Sunday nobody reads it, and
   * Sunday is the night the alert IS the evidence trail because nobody is
   * watching. It would have failed by being ignored.
   */
  it('🔴 anchors warn to the measurement and critical to the policy floor', () => {
    expect(WORST_OBSERVED_SCHEDULER_GAP_MINUTES).toBe(369);
    expect(SCHEDULER_GAP_FLOOR_MINUTES).toBe(480);
    // The tiers cannot collapse onto one constant.
    expect(WORST_OBSERVED_SCHEDULER_GAP_MINUTES).toBeLessThan(SCHEDULER_GAP_FLOOR_MINUTES);

    // The exact configuration that shipped for B's crossing weekend.
    expect(() =>
      assessScheduler({ now, policy: { ...policy, warnMinutes: 30 }, jobs: [] }),
    ).toThrow(/policy/i);
    // One minute below the measurement is still refused.
    expect(() =>
      assessScheduler({
        now,
        policy: { ...policy, warnMinutes: WORST_OBSERVED_SCHEDULER_GAP_MINUTES - 1 },
        jobs: [],
      }),
    ).toThrow(/policy/i);
    // A warn above the measurement but below the policy floor is legal — that
    // band is the whole point of having two tiers.
    expect(() =>
      assessScheduler({
        now,
        policy: { ...policy, warnMinutes: 420, criticalMinutes: SCHEDULER_GAP_FLOOR_MINUTES },
        jobs: [],
      }),
    ).not.toThrow();
  });
});
