import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { rpc } from '@stellar/stellar-sdk';
import { loadConfig, createRpcReader } from '../packages/core/dist/index.js';
import {
  runEngineExecution,
  runWithAlerts,
  RunStageError,
  EmailChannel,
} from '../packages/engine/dist/index.js';
import { createRunJournal } from './run-journal.mjs';
import { createLocalSubmissionRecorder } from './engine-recorder.mjs';

export async function runAlertCommand(
  args,
  {
    read = (path) => readFile(path, 'utf8'),
    env = (name) => process.env[name],
    rpcFactory = (config) => new rpc.Server(config.network.rpcUrl, { timeout: 15000 }),
    fetchImpl = globalThis.fetch,
    label,
  } = {},
) {
  if (args.length === 1 && args[0] === '--help')
    return {
      exitCode: 0,
      help: 'engine:alert-run --run-id ID --output-dir PATH [--config PATH] [--send-alerts] [--submit --attempt-file PATH]. Defaults simulate/preview. Existing run IDs/intents cannot be reused. No .env auto-loading. Sender/recipient come from EMAIL_FROM/EVERGREEN_ALERT_TO.',
    };
  const values = new Map();
  const flags = new Set();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (['--submit', '--send-alerts'].includes(arg) && !flags.has(arg)) {
      flags.add(arg);
      continue;
    }
    if (
      ['--config', '--run-id', '--output-dir', '--attempt-file'].includes(arg) &&
      !values.has(arg)
    ) {
      const value = args[++i];
      if (value && !value.startsWith('--')) {
        values.set(arg, value);
        continue;
      }
    }
    throw new Error('Invalid/repeated alert-run arguments');
  }
  if (
    !values.has('--run-id') ||
    !values.has('--output-dir') ||
    flags.has('--submit') !== values.has('--attempt-file')
  )
    throw new Error('Explicit run ID/output directory and paired submit/attempt file required');
  const send = flags.has('--send-alerts');
  let channel;
  let recorder;
  const delivery = send
    ? {
        async preflight() {
          const key = env('EMAIL_API_KEY')?.trim();
          if (!key || /\s/.test(key)) throw new Error('Email key unavailable');
          channel = new EmailChannel({
            mode: 'send',
            from: env('EMAIL_FROM') || 'onboarding@resend.dev',
            to: env('EVERGREEN_ALERT_TO') || '',
            readApiKey: () => key,
            fetchImpl,
          });
        },
        deliver: (notification, id) => channel.deliver(notification, id),
      }
    : undefined;
  try {
    return await runWithAlerts({
      runId: values.get('--run-id'),
      ...(label ? { label } : {}),
      journal: createRunJournal(values.get('--output-dir')),
      ...(delivery ? { delivery } : {}),
      execute: async () => {
        let config;
        try {
          ({ config } = loadConfig(await read(values.get('--config') ?? 'evergreen.config.json')));
        } catch {
          throw new RunStageError('config', 'CONFIG_FAILED');
        }
        if (send && config.notifications?.toEnvVar !== 'EVERGREEN_ALERT_TO')
          throw new RunStageError('config', 'CONFIG_FAILED');
        const server = rpcFactory(config);
        recorder = values.has('--attempt-file')
          ? createLocalSubmissionRecorder(values.get('--attempt-file'))
          : undefined;
        return runEngineExecution(
          config,
          {
            rpc: server,
            reader: createRpcReader(server),
            ...(recorder ? { recorder } : {}),
            readSecret: (name) => {
              const secret = env(name);
              if (!secret) throw new Error('Signer unavailable');
              return secret;
            },
          },
          flags.has('--submit') ? { submit: true } : {},
        );
      },
    });
  } finally {
    await recorder?.close();
  }
}
// Importing this module supplies the exact same command to the proof harness.
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const r = await runAlertCommand(process.argv.slice(2));
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.exitCode;
  } catch {
    console.error(
      'Alert runner failed; inspect the retained journal. No replacement is authorized.',
    );
    process.exitCode = 2;
  }
}
