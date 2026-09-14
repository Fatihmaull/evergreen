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
    p.criticalMinutes <= p.warnMinutes
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
