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
  const args = process.argv.slice(2);
  try {
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
  } catch (error) {
    // The old single string told every operator to "inspect persistent state" —
    // including the ones whose run was refused by a preflight guard before
    // anything could be written. That sends somebody to examine state that does
    // not exist, on a path whose whole point is not replacing an unresolved
    // live attempt.
    //
    // Allowlisted literals only (the `safeRunCode` rule): an RPC or provider
    // error here can carry a URL or key material, so anything not ours keeps
    // the bare line.
    const REFUSED_BEFORE_WRITING = new Set([
      'Invalid proof arguments',
      'Live proof needs alerts and a recorded systemd invocation',
      'Unexpected proof endpoint',
      'Invalid campaign manifest',
      'Invalid proof window',
      'Outside proof window',
      'Campaign does not match the complete runtime manifest',
      'Incomplete runtime manifest',
      'Invalid runtime path/hash',
      'Runtime changed',
      'Config changed',
      'Proof scope or payer/cap mismatch',
      'Target must clear action threshold',
    ]);
    // The one guard that fires BECAUSE state already exists.
    const STATE_EXISTS = new Set(['Existing attempt must be reconciled']);
    // A manifest that does not exist is also a refusal before writing — found by
    // driving this branch rather than by reading it, because the first version of
    // this fix still told that operator to inspect state that cannot exist.
    const missingManifest =
      error?.code === 'ENOENT' && args[0] === '--manifest' && error.path === resolve(args[1] ?? '');
    // Two INDEPENDENT questions, kept independent on purpose. Conflating them is
    // how the first draft of this fix printed a raw Node ENOENT message on the
    // `Reason:` line: `missingManifest` is about what advice to give, and it must
    // never widen what text is allowed out.
    const ours = REFUSED_BEFORE_WRITING.has(error?.message) || STATE_EXISTS.has(error?.message);
    const refused = REFUSED_BEFORE_WRITING.has(error?.message) || missingManifest;
    console.error(
      'Save-proof preflight/execution failed.' +
        (ours ? `\n  Reason: ${error.message}` : '') +
        (error?.code === 'ENOENT' ? `\n  Missing path: ${error.path ?? 'unknown'}` : '') +
        (refused
          ? '\n  A guard refused before submission. NOTHING WAS SUBMITTED and no new state\n' +
            '  was written — fix the invocation or the manifest and re-run.'
          : '\n  Inspect persistent state; do not replace an unresolved attempt.'),
    );
    process.exitCode = 2;
  }
}
