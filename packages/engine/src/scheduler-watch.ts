import {
  SCHEDULER_GAP_FLOOR_MINUTES,
  WORST_OBSERVED_SCHEDULER_GAP_MINUTES,
} from '@evergreen-stellar/core';
import type { Notification } from '@evergreen-stellar/core';
export interface WatchPolicy {
  startAt: number;
  endAt: number;
  warnMinutes: number;
  criticalMinutes: number;
  maxRunMinutes: number;
}
export interface JobObservation {
  id: string;
  status: 'queued' | 'in_progress' | 'completed';
  startedAt: number | null;
  completedAt: number | null;
  conclusion?: string;
}
export interface SchedulerAssessment {
  status: 'inactive' | 'healthy' | 'late' | 'missing' | 'failed' | 'stalled' | 'observer-error';
  severity: 'info' | 'warn' | 'critical';
  incidentId: string | null;
  lastStartedAt: number | null;
  overdueMinutes: number;
}
export function assessScheduler({
  now,
  policy: p,
  jobs,
}: {
  now: number;
  policy: WatchPolicy;
  jobs: readonly JobObservation[] | null;
}): SchedulerAssessment {
  if (
    ![now, p.startAt, p.endAt, p.warnMinutes, p.criticalMinutes, p.maxRunMinutes].every(
      Number.isFinite,
    ) ||
    p.endAt <= p.startAt ||
    p.endAt - p.startAt > 7 * 86400000 ||
    p.maxRunMinutes <= 0 ||
    p.warnMinutes < p.maxRunMinutes ||
    p.criticalMinutes <= p.warnMinutes ||
    // A critical tier below the floor would fire on behaviour we have observed
    // and accepted. Declared cadence is 15 minutes; measured is a 136-minute
    // median and a 369-minute worst case, so a plausible-looking
    // `criticalMinutes: 30` alarms continuously and the fatigue hides the outage
    // this watcher exists to catch.
    //
    // Deliberately the FLOOR and not `WORST_OBSERVED_SCHEDULER_GAP_MINUTES`: the
    // measurement is a running maximum over a growing sample and only ever goes
    // up, so enforcing against it would retroactively invalidate policies that
    // were correct yesterday, every time anyone re-measures.
    // Two tiers, two meanings, each anchored to a constant that already exists
    // and already has a refresh procedure — rather than two points on one scale.
    //
    //   warn     >= WORST_OBSERVED (369) -> "worse than anything we have seen"
    //   critical >= FLOOR          (480) -> "past what we are willing to allow"
    //
    // The warn floor is the one that was missing, and the gap it left was not
    // theoretical: the weekend watcher config covering B's crossing shipped with
    // `warnMinutes: 30` against a 136-minute median, which fires on every gap the
    // scheduler has ever produced. A watcher that has been crying wolf since
    // Friday is one nobody reads on Sunday — and Sunday is the night the alert IS
    // the evidence trail, because nobody is watching. It would have failed by
    // being ignored, which is the failure mode that reports itself as working.
    p.warnMinutes < WORST_OBSERVED_SCHEDULER_GAP_MINUTES ||
    p.criticalMinutes < SCHEDULER_GAP_FLOOR_MINUTES
  )
    throw new Error('Invalid finite watcher policy');
  const base = {
    severity: 'info' as const,
    incidentId: null,
    lastStartedAt: null,
    overdueMinutes: 0,
  };
  if (now < p.startAt || now >= p.endAt) return { ...base, status: 'inactive' };
  const invalid = () => ({
    ...base,
    status: 'observer-error' as const,
    severity: 'critical' as const,
    incidentId: `observer-error:${p.startAt}`,
  });
  if (!jobs) return invalid();
  for (const j of jobs) {
    if (
      !j.id ||
      !['queued', 'in_progress', 'completed'].includes(j.status) ||
      (j.startedAt !== null && (!Number.isFinite(j.startedAt) || j.startedAt > now)) ||
      (j.completedAt !== null &&
        (!Number.isFinite(j.completedAt) ||
          j.completedAt > now ||
          j.startedAt === null ||
          j.completedAt < j.startedAt)) ||
      (j.status === 'completed' &&
        (j.completedAt === null || j.startedAt === null || !j.conclusion)) ||
      (j.status === 'in_progress' && j.startedAt === null)
    )
      return invalid();
  }
  const started = jobs
    .filter((j) => j.status !== 'queued' && j.startedAt !== null)
    .sort((a, b) => b.startedAt! - a.startedAt!)[0];
  const anchor = started?.startedAt ?? p.startAt;
  const overdueMinutes = Math.max(0, (now - anchor) / 60000);
  let status: SchedulerAssessment['status'] = 'healthy',
    severity: SchedulerAssessment['severity'] = 'info';
  if (started?.status === 'completed' && started.conclusion !== 'success') {
    status = 'failed';
    severity = 'critical';
  } else if (started?.status === 'in_progress' && overdueMinutes > p.maxRunMinutes) {
    status = 'stalled';
    severity = 'critical';
  } else if (overdueMinutes >= p.warnMinutes) {
    status = started ? 'late' : 'missing';
    severity = overdueMinutes >= p.criticalMinutes ? 'critical' : 'warn';
  }
  return {
    status,
    severity,
    lastStartedAt: started?.startedAt ?? null,
    overdueMinutes,
    incidentId: status === 'healthy' ? null : `${status}:${started?.id ?? p.startAt}:${severity}`,
  };
}
export function schedulerNotification(
  assessment: SchedulerAssessment,
  watchId: string,
): Notification {
  return {
    severity: assessment.severity,
    subject: `[${assessment.severity.toUpperCase()}] Evergreen scheduler ${assessment.status}`,
    body: `Watch: ${watchId}\nStatus: ${assessment.status}\nLast actual job start: ${assessment.lastStartedAt === null ? 'not observed' : new Date(assessment.lastStartedAt).toISOString()}\nMinutes since anchor: ${Math.floor(assessment.overdueMinutes)}\nThis is scheduler observation, not a transaction failure record. Check the runner and retained state; no replacement transaction was submitted.`,
  };
}
