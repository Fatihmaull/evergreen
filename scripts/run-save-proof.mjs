import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { checkSaveProof } from './check-save-proof-readiness.mjs';

export async function runSaveProof(path, { submit = false, sendAlerts = false } = {}) {
  const manifest = JSON.parse(await readFile(path, 'utf8'));
  const { config } = await checkSaveProof(manifest, { live: submit });
  if (submit && (!sendAlerts || !process.env.INVOCATION_ID))
    throw Error('Live proof needs alerts and a recorded systemd invocation');
  const capture = join(
    manifest.outputRoot,
    manifest.runId + (submit ? '-capture' : '-preview-capture'),
  );
  await mkdir(capture, { recursive: false, mode: 0o700 });
  await writeFile(
    join(capture, 'trigger.json'),
    JSON.stringify(
      {
        sourceCommit: manifest.sourceCommit,
        runId: manifest.runId,
        invocationId: process.env.INVOCATION_ID ?? null,
        startedAt: new Date().toISOString(),
        submit,
        notBefore: manifest.notBefore,
        notAfter: manifest.notAfter,
      },
      null,
      2,
    ) + '\n',
    { mode: 0o600 },
  );
  const fetchReal = globalThis.fetch;
  let n = 0;
  globalThis.fetch = async (url, options) => {
    const stellar =
      String(url) === config.network.rpcUrl ||
      String(url) === config.network.rpcUrl.replace(/\/$/, '') + '/';
    if (!stellar && String(url) !== 'https://api.resend.com/emails')
      throw Error('Unexpected proof endpoint');
    const seq = String(++n).padStart(3, '0');
    const request = stellar
      ? JSON.parse(options.body)
      : { provider: 'resend', requestRedacted: true };
    if (stellar)
      await writeFile(
        join(capture, seq + '-request.json'),
        JSON.stringify(request, null, 2) + '\n',
        { mode: 0o600 },
      );
    const response = await fetchReal(url, options);
    const raw = await response.clone().text();
    await writeFile(
      join(capture, seq + (stellar ? '-response.json' : '-email-response-private.json')),
      raw,
      { mode: 0o600 },
    );
    return response;
  };
  try {
    const { runAlertCommand } = await import(
      pathToFileURL(join(manifest.runtimeRoot, 'scripts/engine-alert-run.mjs')).href
    );
    const args = [
      '--run-id',
      manifest.runId + (submit ? '' : '-preview'),
      '--output-dir',
      manifest.outputRoot,
      '--config',
      manifest.configPath,
      ...(submit ? ['--submit', '--attempt-file', manifest.attemptFile] : []),
      ...(sendAlerts ? ['--send-alerts'] : []),
    ];
    const result = await runAlertCommand(args, {
      read: async () => JSON.stringify({ ...config, mode: submit ? 'live' : 'dry-run' }),
    });
    await writeFile(join(capture, 'result.json'), JSON.stringify(result, null, 2) + '\n', {
      mode: 0o600,
    });
    return result;
  } finally {
    globalThis.fetch = fetchReal;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (
      args[0] !== '--manifest' ||
      !args[1] ||
      args.slice(2).some((x) => !['--submit', '--send-alerts'].includes(x)) ||
      new Set(args).size !== args.length
    )
      throw Error('Invalid proof arguments');
    const r = await runSaveProof(args[1], {
      submit: args.includes('--submit'),
      sendAlerts: args.includes('--send-alerts'),
    });
    console.log(JSON.stringify(r, null, 2));
    process.exitCode = r.exitCode;
  } catch {
    console.error(
      'Save-proof preflight/execution failed. Inspect persistent state; do not replace an unresolved attempt.',
    );
    process.exitCode = 2;
  }
}
