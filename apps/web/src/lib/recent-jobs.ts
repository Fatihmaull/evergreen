/**
 * One `GET /jobs?limit=100` for the Overview and Contracts panels: the recent
 * runs and the 30-day count. `complete` only when the page reached the end of
 * history or a job older than 30 days, so the count is not a partial one.
 */
import { apiRequest } from './api';
import { DAY_MS, type ApiJob } from './activity-view';
import type { JobsFact } from './overview-view';

type Fetch = typeof apiRequest;

export async function readRecentJobs(
  now = new Date(),
  request: Fetch = apiRequest,
): Promise<JobsFact> {
  const out = await request<{ items?: unknown; nextCursor?: unknown }>('/jobs?limit=100', {
    method: 'GET',
  }).catch(() => ({ kind: 'unavailable', reason: 'network' }) as const);
  if (out.kind !== 'ok' || !Array.isArray(out.data?.items)) return { kind: 'unread' };
  const jobs = out.data.items as ApiJob[];
  const last = jobs[jobs.length - 1];
  const complete =
    typeof out.data.nextCursor !== 'string' ||
    (last !== undefined && Date.parse(last.createdAt) < now.getTime() - 30 * DAY_MS);
  return { kind: 'read', jobs, complete };
}

/** Labels by contract ID, for naming a job's contract. */
export const namesOf = (
  items: readonly { contractId: string; label?: string | null }[],
): Map<string, string> =>
  new Map(
    items.flatMap((i) =>
      typeof i.label === 'string' && i.label !== '' ? [[i.contractId, i.label] as const] : [],
    ),
  );
