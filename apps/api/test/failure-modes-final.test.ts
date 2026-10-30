import { describe, expect, it } from 'vitest';
import {
  FAILURE_MODE_ALERTS,
  PULLED_THEN_FAILED_MIN_PULLED,
  PULLED_THEN_FAILED_RATE_PERCENT,
  PULLED_THEN_FAILED_WINDOW_SECONDS,
  emailFailureOperatorAlert,
  floatCheck,
  isPermanentEmailFailure,
  pulledThenFailedBreaches,
  type WindowedUserJobFact,
} from '../src/index.js';

const DAY = 86_400;
const NOW = 100 * DAY;
const job = (
  userId: string,
  failed: boolean,
  pulledAt: number | null = NOW - DAY,
): WindowedUserJobFact => ({
  userId,
  pulled: pulledAt !== null,
  pulledAt: pulledAt ?? undefined,
  status: failed ? 'refunded' : 'extended',
});

describe('pulled-then-failed breach (option 1: 30d, >= 3 jobs, >= 50%)', () => {
  it('pins the decided numbers', () => {
    expect(PULLED_THEN_FAILED_WINDOW_SECONDS).toBe(30 * DAY);
    expect(PULLED_THEN_FAILED_MIN_PULLED).toBe(3);
    expect(PULLED_THEN_FAILED_RATE_PERCENT).toBe(50);
  });

  it('breaches at exactly 3 jobs and exactly 50% (rounded: 2 of 4)', () => {
    const r = pulledThenFailedBreaches(
      [job('a', true), job('a', true), job('a', false), job('a', false)],
      NOW,
    );
    expect(r).toEqual([{ userId: 'a', pulled: 4, pulledThenFailed: 2, rate: 0.5 }]);
    expect(
      pulledThenFailedBreaches([job('b', true), job('b', true), job('b', false)], NOW),
    ).toHaveLength(1);
  });

  it('does not breach below 3 pulled jobs, even at 100%', () => {
    expect(pulledThenFailedBreaches([job('a', true), job('a', true)], NOW)).toEqual([]);
  });

  it('does not breach just under 50% (1 of 3)', () => {
    expect(
      pulledThenFailedBreaches([job('a', true), job('a', false), job('a', false)], NOW),
    ).toEqual([]);
  });

  it('counts only jobs pulled in the last 30 days, not in the future, and only pulled ones', () => {
    const jobs = [
      job('a', true),
      job('a', true),
      job('a', true, NOW - 30 * DAY), // exactly 30 days ago: outside
      job('a', true, NOW + 1), // future: not counted
      job('a', true, null), // never pulled
    ];
    expect(pulledThenFailedBreaches(jobs, NOW)).toEqual([]);
    expect(pulledThenFailedBreaches([...jobs, job('a', false, NOW - 30 * DAY + 1)], NOW)).toEqual([
      { userId: 'a', pulled: 3, pulledThenFailed: 2, rate: 2 / 3 },
    ]);
  });

  it('is per user and sorted', () => {
    const jobs = ['z', 'a'].flatMap((u) => [job(u, true), job(u, true), job(u, true)]);
    jobs.push(job('m', false), job('m', false), job('m', false));
    expect(pulledThenFailedBreaches(jobs, NOW).map((b) => b.userId)).toEqual(['a', 'z']);
  });

  it('F4 mapping names the breach detector', () => {
    expect(FAILURE_MODE_ALERTS.F4.detector).toContain('pulledThenFailedBreaches');
  });
});

describe('F8 floatCheck (option 2: headroom = in-flight pulls, cap = headroom + buffer)', () => {
  it('flags below headroom and leaves the cap side undetermined without a buffer', () => {
    expect(
      floatCheck({
        balanceStroops: 99n,
        inFlightPullsStroops: 100n,
        sweepBufferStroops: undefined,
      }),
    ).toEqual({ belowHeadroom: true, aboveCap: undefined });
    expect(
      floatCheck({
        balanceStroops: 100n,
        inFlightPullsStroops: 100n,
        sweepBufferStroops: undefined,
      }),
    ).toEqual({ belowHeadroom: false, aboveCap: undefined });
  });

  it('flags above cap only strictly above headroom + buffer', () => {
    const f = { inFlightPullsStroops: 100n, sweepBufferStroops: 50n };
    expect(floatCheck({ ...f, balanceStroops: 150n }).aboveCap).toBe(false);
    expect(floatCheck({ ...f, balanceStroops: 151n }).aboveCap).toBe(true);
  });

  it('an unknown balance is undetermined on both sides, never healthy', () => {
    expect(
      floatCheck({ balanceStroops: undefined, inFlightPullsStroops: 0n, sweepBufferStroops: 1n }),
    ).toEqual({ belowHeadroom: undefined, aboveCap: undefined });
  });
});

describe('F16 email failure (option 3: permanent now, transient after retries)', () => {
  it('a provider rejection or an unbuildable request is permanent and alerts now', () => {
    expect(isPermanentEmailFailure({ kind: 'rejected' })).toBe(true);
    expect(isPermanentEmailFailure({ kind: 'network', fetchStage: 'build' })).toBe(true);
    expect(emailFailureOperatorAlert({ kind: 'rejected' }, false)).toBe('now');
  });

  it('a transient failure waits until its retries are exhausted', () => {
    for (const f of [
      { kind: 'unavailable' as const },
      { kind: 'network' as const, fetchStage: 'send' as const },
      { kind: 'network' as const },
    ]) {
      expect(isPermanentEmailFailure(f)).toBe(false);
      expect(emailFailureOperatorAlert(f, false)).toBe('wait_for_retries');
      expect(emailFailureOperatorAlert(f, true)).toBe('now');
    }
  });

  it('F16 mapping names the detector', () => {
    expect(FAILURE_MODE_ALERTS.F16.detector).toMatch(/^emailFailureOperatorAlert/);
    expect(FAILURE_MODE_ALERTS.F8.detector).toMatch(/^floatCheck/);
  });
});
