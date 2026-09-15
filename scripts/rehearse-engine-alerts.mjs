/** Controlled failure injection around the actual runner. Only email may use live network. */
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { runAlertCommand } from './engine-alert-run.mjs';
import { runSchedulerWatch } from './scheduler-watch.mjs';
import { EmailChannel } from '../packages/engine/dist/index.js';
export async function rehearse({ scenario, root, runId, send = false }) {
  if (!['rpc-timeout', 'insufficient-balance', 'missed-run'].includes(scenario))
    throw Error('Unknown scenario');
  const realFetch = globalThis.fetch;
  const privateEnv = (name) => {
    if (name === 'EVERGREEN_SIGNER_SECRET' || name === 'ARTIFACT_SEED')
      throw Error('Fault proof must not access a signer');
    return process.env[name];
  };
  const log = {
    scenario,
    runId,
    injectedRpc: true,
    stellarNetworkRequests: 0,
    emailRequests: 0,
    injectedFailures: 0,
    rpcMethods: [],
  };
  const emailFetch = async (...args) => {
    if (!send) throw Error('No provider request in preview');
    log.emailRequests++;
    if (String(args[0]) !== 'https://api.resend.com/emails') throw Error('Only approved provider');
    return realFetch(...args);
  };
  let result;
  await mkdir(root, { recursive: true, mode: 0o700 });
  try {
    if (scenario === 'missed-run') {
      const now = Date.now();
      let channel;
      const delivery = send
        ? {
            async preflight() {
              channel = new EmailChannel({
                mode: 'send',
                from: privateEnv('EMAIL_FROM') || 'onboarding@resend.dev',
                to: privateEnv('EVERGREEN_ALERT_TO') || '',
                readApiKey: () => privateEnv('EMAIL_API_KEY') || '',
                fetchImpl: emailFetch,
              });
            },
            deliver: (n, id) => channel.deliver(n, id),
          }
        : undefined;
      const opts = {
        watchId: runId,
        policy: {
          startAt: now - 7 * 3600000,
          endAt: now + 3600000,
          warnMinutes: 30,
          criticalMinutes: 540,
          maxRunMinutes: 10,
        },
        stateRoot: root,
        readJobs: async () => [],
        now,
        label: 'E2E TEST missed scheduled run',
        ...(delivery ? { delivery } : {}),
      };
      result = await runSchedulerWatch(opts);
      const repeated = await runSchedulerWatch(opts);
      log.repeatedStatus = repeated.status;
    } else {
      await import('../packages/engine/test/fixtures/rpc-preload.mjs');
      const fixtureFetch = globalThis.fetch;
      globalThis.fetch = async (url, options) => {
        if (String(url) === 'https://api.resend.com/emails') return emailFetch(url, options);
        const request = JSON.parse(options.body);
        log.rpcMethods.push(request.method);
        if (scenario === 'rpc-timeout' && request.method === 'getNetwork') {
          log.injectedFailures++;
          throw Object.assign(new Error('Injected timeout'), { code: 'ETIMEDOUT' });
        }
        if (scenario === 'insufficient-balance' && request.method === 'simulateTransaction') {
          log.injectedFailures++;
          return new globalThis.Response(
            JSON.stringify({
              jsonrpc: '2.0',
              id: request.id,
              result: { latestLedger: 4512641, error: 'Injected insufficient spendable balance' },
            }),
            { headers: { 'content-type': 'application/json' } },
          );
        }
        if (!['getNetwork', 'getLedgerEntries', 'simulateTransaction'].includes(request.method))
          throw Error('Write RPC forbidden in fault proof');
        return fixtureFetch(url, options);
      };
      const c = JSON.parse(await readFile('evergreen.config.save-proof.json', 'utf8'));
      c.mode = 'live';
      c.defaults = { bumpWhenRemainingLedgersBelow: 100, extendToLedgers: 1000 };
      c.payers['bot-testnet'].secretEnvVar = 'ARTIFACT_SEED';
      result = await runAlertCommand(
        [
          '--run-id',
          runId,
          '--output-dir',
          root,
          '--submit',
          '--attempt-file',
          join(root, runId + '.attempt.jsonl'),
          ...(send ? ['--send-alerts'] : []),
        ],
        {
          read: async () => JSON.stringify(c),
          env: privateEnv,
          fetchImpl: emailFetch,
          label: 'E2E TEST ' + scenario,
        },
      );
    }
  } finally {
    globalThis.fetch = realFetch;
  }
  await writeFile(
    join(root, runId + '-rehearsal.json'),
    JSON.stringify({ injection: log, result }, null, 2) + '\n',
    { flag: 'wx', mode: 0o600 },
  );
  return { injection: log, result };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (args.length < 3 || args.length > 4 || (args[3] && args[3] !== '--send-alerts'))
      throw Error('Use scenario root run-id [--send-alerts]');
    const r = await rehearse({
      scenario: args[0],
      root: resolve(args[1]),
      runId: args[2],
      send: args[3] === '--send-alerts',
    });
    console.log(JSON.stringify(r, null, 2));
    process.exitCode =
      r.result.exitCode === 2 &&
      r.result.alertReceipts?.some((x) => x.status === 'accepted' || x.status === 'preview')
        ? 0
        : r.result.status === 'alerted'
          ? 0
          : r.result.exitCode;
  } catch {
    console.error('Failure rehearsal failed; inspect retained state without resending.');
    process.exitCode = 2;
  }
}
