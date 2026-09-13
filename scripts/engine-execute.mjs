/** Explicit local execution entry point. The existing cron never invokes this. */
import { readFile } from 'node:fs/promises';
import process from 'node:process';
import console from 'node:console';
import { rpc } from '@stellar/stellar-sdk';
import { createLocalSubmissionRecorder } from './engine-recorder.mjs';
const { createRpcReader } = await import(
  new globalThis.URL('../packages/core/dist/index.js', import.meta.url).href
);
const { runEngineCommand, runEngineExecution } = await import(
  new globalThis.URL('../packages/engine/dist/index.js', import.meta.url).href
);
const result = await runEngineCommand(process.argv.slice(2), {
  readConfig: (path) => readFile(path, 'utf8'),
  async execute(config, options, attemptFile) {
    const server = new rpc.Server(config.network.rpcUrl, { timeout: 15000 });
    const recorder = attemptFile ? createLocalSubmissionRecorder(attemptFile) : undefined;
    try {
      return await runEngineExecution(
        config,
        {
          rpc: server,
          reader: createRpcReader(server),
          ...(recorder ? { recorder } : {}),
          readSecret: (name) => {
            const value = process.env[name];
            if (!value) throw new Error('Signing key unavailable');
            return value;
          },
        },
        options,
      );
    } finally {
      await recorder?.close();
    }
  },
});
if (result.stdout) console.log(result.stdout);
if (result.stderr) console.error(result.stderr);
process.exitCode = result.exitCode;
