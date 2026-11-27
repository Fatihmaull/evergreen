/**
 * Overview reads `GET /jobs` (fatih, 2026-11-27: "recent activity gak muncul
 * padahal di page activity sudah ada"): Recent activity, Last 30 days, the
 * next scheduler check, and a contract's Last runs.
 */
import { describe, expect, test } from 'vitest';
import type { ApiJob } from '../src/lib/activity-view';
import {
  NOT_YET_AVAILABLE,
  factsHtml,
  nextTick,
  panelHtml,
  recentActivityHtml,
  recentJobsHtml,
} from '../src/lib/overview-view';
import { namesOf, readRecentJobs } from '../src/lib/recent-jobs';
import { rowFor } from '../src/lib/watchlist-view';
import { A, B, item } from './fixtures/watchlist-example';

const NOW = new Date('2026-11-27T15:20:00Z');
const job = (id: string, over: Partial<ApiJob> = {}): ApiJob => ({
  id,
  contractId: A,
  kind: 'autopilot',
  createdAt: '2026-11-27T13:00:00Z',
  status: 'extended',
  steps: {},
  ...over,
});
const JOBS = [
  job('j3', { kind: 'extend-now', createdAt: '2026-11-27T14:00:00Z' }),
  job('j2', { contractId: B, status: 'failed' }),
  job('j1', { createdAt: '2026-11-23T13:30:00Z' }),
  job('j0', { createdAt: '2026-10-01T00:00:00Z' }),
];
const onAuto = rowFor(item(A, { label: 'payments-v2', autopilot: { enabled: true } }), NOW);

describe('the facts', () => {
  test('🔴 last 30 days counts extended jobs, split autopilot and Extend now', () => {
    const html = factsHtml([onAuto], { kind: 'unread' }, NOW, {
      kind: 'read',
      jobs: JOBS,
      complete: true,
    });
    expect(html).toMatch(/Last 30 days<\/p><p class="v">2<\/p>/);
    expect(html).toContain('1 autopilot, 1 Extend now');
  });
  test('🔴 a partial or failed read is not a count', () => {
    const partial = factsHtml([onAuto], { kind: 'unread' }, NOW, {
      kind: 'read',
      jobs: JOBS,
      complete: false,
    });
    expect(partial).toContain(NOT_YET_AVAILABLE);
    expect(partial).not.toMatch(/Last 30 days<\/p><p class="v">\d/);
  });
  test('autopilot names the next quarter-hour check', () => {
    expect(nextTick(NOW).toISOString()).toBe('2026-11-27T15:30:00.000Z');
    expect(nextTick(new Date('2026-11-27T15:30:00Z')).toISOString()).toBe(
      '2026-11-27T15:45:00.000Z',
    );
    expect(factsHtml([onAuto], { kind: 'unread' }, NOW)).toContain('next ~15:30 UTC');
  });
});

describe('recent activity', () => {
  test('🔴 lists the runs, named by label, linking to the job', () => {
    const html = recentActivityHtml(
      { kind: 'read', jobs: JOBS, complete: true },
      namesOf([{ contractId: A, label: 'payments-v2' }]),
    );
    expect(html).toContain('href="/dashboard/activity/?j=j3"');
    expect(html).toContain('Extend now</a> · payments-v2');
    expect(html.match(/<li>/g)).toHaveLength(4);
  });
  test('a failed read says so, and is not "no runs"', () => {
    const html = recentActivityHtml({ kind: 'unread' }, new Map());
    expect(html).toContain('did not answer');
    expect(html).not.toContain('No runs yet');
    expect(recentJobsHtml([], new Map())).toContain('No runs yet');
  });
});

describe('the panel', () => {
  test('🔴 Last runs shows only this contract, at most three', () => {
    const html = panelHtml(onAuto, 'overview', { kind: 'read', jobs: JOBS, complete: true });
    const runs = html.slice(html.indexOf('Last runs'));
    expect(runs).toContain('?j=j3');
    expect(runs).not.toContain('?j=j2');
    expect(runs.match(/<li>/g)).toHaveLength(3);
  });
  test('none in a partial read is not "No runs yet"', () => {
    const html = panelHtml(onAuto, 'overview', {
      kind: 'read',
      jobs: [job('x', { contractId: B })],
      complete: false,
    });
    expect(html).toContain('None in your latest 100 runs');
  });
});

describe('the read', () => {
  const ok = (data: unknown) => async () => ({ kind: 'ok', status: 200, data }) as never;
  test('complete at the end of history, or past 30 days; partial otherwise', async () => {
    expect(await readRecentJobs(NOW, ok({ items: JOBS, nextCursor: null }))).toMatchObject({
      complete: true,
    });
    expect(await readRecentJobs(NOW, ok({ items: JOBS, nextCursor: 'c' }))).toMatchObject({
      complete: true,
    });
    expect(
      await readRecentJobs(NOW, ok({ items: JOBS.slice(0, 3), nextCursor: 'c' })),
    ).toMatchObject({ complete: false });
  });
  test('no answer is unread', async () => {
    const fail = async () => ({ kind: 'error', status: 401, code: 'UNAUTHENTICATED' }) as never;
    expect(await readRecentJobs(NOW, fail)).toEqual({ kind: 'unread' });
    expect(await readRecentJobs(NOW, async () => Promise.reject(new Error('x')))).toEqual({
      kind: 'unread',
    });
  });
});
