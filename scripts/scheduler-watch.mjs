import { mkdir, open, readFile, rename, unlink, access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import process from 'node:process';
import console from 'node:console';
import {
  assessScheduler,
  schedulerNotification,
  assertRunId,
  EmailChannel,
} from '../packages/engine/dist/index.js';
import { createRunJournal } from './run-journal.mjs';

export async function readGithubJobs(config, { fetchImpl = globalThis.fetch, token } = {}) {
  if (
    !/^[\w.-]+\/[\w.-]+$/.test(config.repository) ||
    !/^[\w.-]+\.ya?ml$/.test(config.workflow) ||
    config.branch !== 'main' ||
    typeof config.jobName !== 'string'
  )
    throw new Error('Invalid watcher scope');
  const base = `https://api.github.com/repos/${config.repository}/actions`;
  const get = async (path) => {
    const r = await fetchImpl(base + path, {
      headers: {
        Accept: 'application/vnd.github+json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      redirect: 'error',
      signal: globalThis.AbortSignal.timeout(10000),
    });
    if (!r.ok) throw new Error('GitHub observation unavailable');
    return r.json();
  };
  const response = await get(
    `/workflows/${config.workflow}/runs?branch=main&event=schedule&per_page=20`,
  );
  if (!Array.isArray(response.workflow_runs)) throw new Error('Malformed run history');
  const runs = response.workflow_runs
    .filter((r) => r.head_branch === 'main' && r.event === 'schedule' && r.status !== 'queued')
    .slice(0, 2);
  const jobs = [];
  for (const run of runs) {
    if (!Number.isSafeInteger(run.id)) throw new Error('Invalid run ID');
    const result = await get(`/runs/${run.id}/jobs?per_page=100`);
    if (!Array.isArray(result.jobs) || result.total_count > 100)
      throw new Error('Incomplete job history');
    const rows = result.jobs.filter((j) => j.name === config.jobName);
    if (rows.length !== 1) throw new Error('Expected job absent or ambiguous');
    for (const j of rows) {
      if (!Number.isSafeInteger(j.id)) throw new Error('Invalid job ID');
      jobs.push({
        id: String(j.id),
        status: j.status,
        startedAt: j.started_at ? Date.parse(j.started_at) : null,
        completedAt: j.completed_at ? Date.parse(j.completed_at) : null,
        ...(j.conclusion ? { conclusion: j.conclusion } : {}),
      });
    }
  }
  return jobs;
}

export async function runSchedulerWatch({
  watchId,
  policy,
  stateRoot,
  readJobs,
  delivery,
  now = Date.now(),
  label,
}) {
  assertRunId(watchId);
  if (watchId === '.' || watchId === '..') throw new Error('Invalid watch ID');
  const inactive = assessScheduler({ now, policy, jobs: [] });
  if (inactive.status === 'inactive')
    return { assessment: inactive, status: 'inactive', exitCode: 0 };
  const dir = join(resolve(stateRoot), watchId);
  await mkdir(dir, { recursive: true, mode: 0o700 });
  let lock;
  try {
    lock = await open(join(dir, 'watch.lock'), 'wx', 0o600);
  } catch {
    return { status: 'locked', exitCode: 2 };
  }
  const save = async (value) => {
    const f = await open(join(dir, 'state.tmp'), 'w', 0o600);
    try {
      await f.writeFile(JSON.stringify(value, null, 2) + '\n');
      await f.sync();
    } finally {
      await f.close();
    }
    await rename(join(dir, 'state.tmp'), join(dir, 'state.json'));
    const d = await open(dir, 'r');
    try {
      await d.sync();
    } finally {
      await d.close();
    }
  };
  try {
    let state = { generation: 0, active: null };
    try {
      state = JSON.parse(await readFile(join(dir, 'state.json'), 'utf8'));
      if (
        !Number.isSafeInteger(state.generation) ||
        state.generation < 0 ||
        !(state.active === null || typeof state.active === 'string')
      )
        throw Error('Invalid state');
    } catch (e) {
      if (e.code !== 'ENOENT') throw Error('Watcher state must be reconciled', { cause: e });
    }
    let jobs = null;
    try {
      jobs = await readJobs();
    } catch {
      /* Unknown observation is an alert, not health. */
    }
    const assessment = assessScheduler({ now, policy, jobs });
    if (assessment.status === 'healthy') {
      await save({
        generation: state.generation + (state.active === null ? 0 : 1),
        active: null,
        lastAssessment: assessment,
      });
      return { status: 'healthy', assessment, exitCode: 0 };
    }
    if (state.active !== assessment.incidentId) {
      state = { generation: state.generation, active: assessment.incidentId };
      await save({ ...state, lastAssessment: assessment });
    }
    const id = createHash('sha256')
      .update(JSON.stringify([watchId, state.generation, assessment.incidentId]))
      .digest('hex');
    const root = join(dir, delivery ? 'sent' : 'preview');
    const campaign = `watch-${id}`;
    try {
      await access(join(root, campaign));
      let recorded;
      try {
        recorded = JSON.parse(
          await readFile(
            join(
              root,
              campaign,
              createHash('sha256').update(campaign).digest('hex') + '.receipt.json',
            ),
            'utf8',
          ),
        );
      } catch {
        return { status: 'delivery-unknown', assessment, incidentId: campaign, exitCode: 2 };
      }
      if (!['accepted', 'preview'].includes(recorded.status))
        return { status: 'delivery-unknown', assessment, incidentId: campaign, exitCode: 2 };
      return {
        status: 'deduplicated',
        assessment,
        incidentId: campaign,
        exitCode: assessment.status === 'observer-error' ? 2 : 1,
      };
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
    const journal = createRunJournal(root);
    await journal.start(campaign);
    await journal.execution({ assessment });
    let notification = schedulerNotification(assessment, watchId);
    if (label) notification = { ...notification, subject: `[${label}] ${notification.subject}` };
    await journal.intent({ id: campaign, kind: 'missed-run', notification });
    let receipt;
    try {
      await delivery?.preflight();
      receipt = delivery
        ? await delivery.deliver(notification, campaign)
        : { status: 'preview', submitted: false, notification };
    } catch {
      receipt = { status: 'failed', classification: 'unknown' };
    }
    await journal.receipt({ id: campaign, ...receipt });
    return {
      status: receipt.status === 'failed' ? 'delivery-unknown' : 'alerted',
      assessment,
      incidentId: campaign,
      receipt,
      exitCode: receipt.status === 'failed' || assessment.status === 'observer-error' ? 2 : 1,
    };
  } finally {
    await lock.close();
    await unlink(join(dir, 'watch.lock'));
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--help') {
      console.log(
        'scheduler:watch --config PATH [--send-alerts]. Finite window only; observes GitHub jobs and never submits transactions.',
      );
    } else {
      if (
        args[0] !== '--config' ||
        !args[1] ||
        ![2, 3].includes(args.length) ||
        (args[2] && args[2] !== '--send-alerts')
      )
        throw Error('Invalid args');
      const c = JSON.parse(await readFile(args[1], 'utf8'));
      let channel;
      const delivery = args[2]
        ? {
            async preflight() {
              const key = process.env.EMAIL_API_KEY?.trim();
              if (!key) throw Error('No email key');
              channel = new EmailChannel({
                mode: 'send',
                from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
                to: process.env.EVERGREEN_ALERT_TO || '',
                readApiKey: () => key,
              });
            },
            deliver: (n, id) => channel.deliver(n, id),
          }
        : undefined;
      const r = await runSchedulerWatch({
        ...c,
        readJobs: () => readGithubJobs(c, { token: process.env.GH_TOKEN }),
        ...(delivery ? { delivery } : {}),
      });
      console.log(JSON.stringify(r, null, 2));
      process.exitCode = r.exitCode;
    }
  } catch (error) {
    // Same defect as capture-crossing-probe had: one generic line for every
    // failure. Measured 2026-09-15 — the readiness config's `warnMinutes: 30`
    // is rejected by the floor added in #169, and an operator starting the
    // weekend watcher on Friday saw only "Watcher failed; inspect retained
    // state" with no hint that the cause was the policy and the fix one number.
    //
    // Allowlisted literals only, the `safeRunCode` rule, so nothing interpolated
    // can carry a token or URL.
    const OWN = new Set(['Invalid finite watcher policy', 'Invalid args']);
    const reason = OWN.has(error?.message) ? error.message : null;
    console.error(
      'Watcher failed; inspect retained state. No replacement transaction was submitted.' +
        (reason === null ? '' : `\n  Reason: ${reason}`) +
        (reason === 'Invalid finite watcher policy'
          ? '\n  The policy was refused before the watcher started, so nothing is running.\n' +
            '  warnMinutes must be at least the worst scheduler gap we have measured, and\n' +
            '  criticalMinutes at least the agreed floor — see packages/core/src/config.ts.\n' +
            '  ops/weekend-watch.json is a ready policy that passes both.'
          : ''),
    );
    process.exitCode = 2;
  }
}
