import { describe, it, expect } from 'vitest';
import { assessScheduler } from '../src/scheduler-watch.js';
const now = Date.parse('2026-09-14T12:00:00Z');
const policy = {
  startAt: now - 24 * 3600000,
  endAt: now + 3600000,
  warnMinutes: 30,
  criticalMinutes: 360,
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
    const job = {
      id: '1',
      status: 'completed' as const,
      startedAt: now - 40 * 60000,
      completedAt: now - 35 * 60000,
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
});
