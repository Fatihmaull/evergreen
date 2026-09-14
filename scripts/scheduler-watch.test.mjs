import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runSchedulerWatch, readGithubJobs } from './scheduler-watch.mjs';
test('watcher retains incidents across invocations and rearms only after recovery', async () => {
  const root = await mkdtemp(join(tmpdir(), 'watch-test-'));
  const now = Date.now();
  let calls = 0;
  const options = {
    watchId: 'test',
    policy: {
      startAt: now - 7200000,
      endAt: now + 7200000,
      warnMinutes: 30,
      criticalMinutes: 360,
      maxRunMinutes: 10,
    },
    stateRoot: root,
    now,
    readJobs: async () => [],
    delivery: {
      preflight: async () => {},
      deliver: async () => {
        calls++;
        return { status: 'accepted', emailId: 'fixture' };
      },
    },
  };
  try {
    assert.equal((await runSchedulerWatch(options)).status, 'alerted');
    assert.equal((await runSchedulerWatch(options)).status, 'deduplicated');
    assert.equal(calls, 1);
    await runSchedulerWatch({
      ...options,
      readJobs: async () => [
        {
          id: 'new',
          status: 'completed',
          startedAt: now - 1000,
          completedAt: now,
          conclusion: 'success',
        },
      ],
    });
    assert.equal((await runSchedulerWatch(options)).status, 'alerted');
    assert.equal(calls, 2);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('GitHub observation ignores queue timestamps and selects the actual engine job', async () => {
  let call = 0;
  const config = {
    repository: 'Fatihmaull/evergreen',
    workflow: 'engine-cron.yml',
    branch: 'main',
    jobName: 'decide',
  };
  const jobs = await readGithubJobs(config, {
    fetchImpl: async () =>
      new globalThis.Response(
        JSON.stringify(
          ++call === 1
            ? {
                workflow_runs: [
                  { id: 1, head_branch: 'main', event: 'schedule', status: 'completed' },
                ],
              }
            : {
                total_count: 2,
                jobs: [
                  {
                    id: 2,
                    name: 'decide',
                    status: 'completed',
                    started_at: '2026-09-14T00:00:00Z',
                    completed_at: '2026-09-14T00:01:00Z',
                    conclusion: 'success',
                  },
                  { id: 3, name: 'unrelated', status: 'completed' },
                ],
              },
        ),
      ),
  });
  assert.equal(jobs.length, 1);
  assert.equal(jobs[0].id, '2');
  assert.equal(call, 2);
});
test('preview does not suppress sending and uncertain delivery stays visible without resend', async () => {
  const root = await mkdtemp(join(tmpdir(), 'watch-uncertain-'));
  const now = Date.now();
  const opts = {
    watchId: 'uncertain',
    stateRoot: root,
    now,
    readJobs: async () => [],
    policy: {
      startAt: now - 7200000,
      endAt: now + 7200000,
      warnMinutes: 30,
      criticalMinutes: 360,
      maxRunMinutes: 10,
    },
  };
  let sends = 0;
  const delivery = {
    preflight: async () => {},
    deliver: async () => {
      sends++;
      throw Error('ambiguous provider timeout');
    },
  };
  try {
    assert.equal((await runSchedulerWatch(opts)).status, 'alerted');
    const first = await runSchedulerWatch({ ...opts, delivery });
    assert.equal(first.status, 'delivery-unknown');
    assert.equal(first.exitCode, 2);
    const repeat = await runSchedulerWatch({ ...opts, delivery });
    assert.equal(repeat.status, 'delivery-unknown');
    assert.equal(repeat.exitCode, 2);
    assert.equal(sends, 1);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
