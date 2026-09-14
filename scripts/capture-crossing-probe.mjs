import { mkdir, readFile, readdir, open } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
import console from 'node:console';
import { rpc } from '@stellar/stellar-sdk';
import {
  RPC_URL,
  sha,
  runtimeHashes,
  collectObservation,
  classifyObservation,
  acquireCaptureTransport,
  captureStderr,
} from './crossing-capture-common.mjs';
let active = false;
async function put(dir, name, value) {
  const f = await open(join(dir, name), 'wx', 0o600);
  try {
    await f.writeFile(value);
    await f.sync();
  } finally {
    await f.close();
  }
}
export async function sealCapture(dir) {
  const names = [];
  async function walk(path, prefix = '') {
    for (const e of await readdir(path, { withFileTypes: true })) {
      if (e.isSymbolicLink()) throw Error('Symlink in capture');
      const n = prefix + e.name;
      if (e.isDirectory()) await walk(join(path, e.name), n + '/');
      else if (n !== 'SHA256SUMS') names.push(n);
    }
  }
  await walk(dir);
  const lines = [];
  for (const n of names.sort()) lines.push(sha(await readFile(join(dir, n))) + '  ' + n);
  await put(dir, 'SHA256SUMS', lines.join('\n') + '\n');
}
async function captureImplementation(
  { directory, subject = 'B', rehearsalThreshold, baselineDirectory },
  { fetchImpl = globalThis.fetch, now = () => new Date(), provenance = null } = {},
) {
  const { protectedSubject, ACTION_THRESHOLD, formatCrossingProbe } =
    await import('./b-crossing-probe.mjs');
  protectedSubject(subject);
  const threshold = rehearsalThreshold ?? ACTION_THRESHOLD,
    rehearsal = rehearsalThreshold !== undefined;
  if (!Number.isSafeInteger(threshold) || threshold <= 0) throw Error('Invalid threshold');
  let baseline = null;
  if (baselineDirectory) {
    const { readVerifiedCapture } = await import('./verify-crossing-capture.mjs');
    baseline = await readVerifiedCapture(baselineDirectory);
    if (
      baseline.baseline ||
      !['before-action', 'crossing-refused'].includes(baseline.result.phase) ||
      baseline.manifest.rehearsal
    )
      throw Error('Use a real live-entry baseline without another baseline');
  }
  const dir = resolve(directory);
  await mkdir(dir, { mode: 0o700 });
  await put(dir, '.crossing-capture', 'evergreen-crossing-v1\n');
  await mkdir(join(dir, 'rpc'), { mode: 0o700 });
  const manifest = {
    captureFormat: 'evergreen-crossing-v1',
    version: 1,
    subject,
    threshold,
    rehearsal,
    startedAt: now().toISOString(),
    endedAt: null,
    rpcCount: 0,
    provenance,
    environment: {
      node: process.version,
      locale: new Intl.NumberFormat().resolvedOptions().locale,
    },
    runtimeHashes: await runtimeHashes(),
    baseline: !!baseline,
  };
  await put(
    dir,
    'started.json',
    JSON.stringify({ subject, threshold, rehearsal, startedAt: manifest.startedAt }) + '\n',
  );
  if (baseline) await put(dir, 'baseline.json', JSON.stringify(baseline) + '\n');
  const release = acquireCaptureTransport();
  const original = globalThis.fetch;
  let observation = null,
    probeExitCode = 0;
  const deadline = Date.now() + 120000;
  globalThis.fetch = async (input, init) => {
    const address = String(input instanceof globalThis.Request ? input.url : input);
    const body =
      init?.body ?? (input instanceof globalThis.Request ? await input.clone().text() : '');
    const req = JSON.parse(body);
    if (
      ![RPC_URL, RPC_URL + '/'].includes(address) ||
      !['getNetwork', 'getLedgerEntries'].includes(req.method) ||
      typeof body !== 'string' ||
      body.length > 100000
    )
      throw Error('Read-only capture refuses this request');
    if (manifest.rpcCount >= 64 || Date.now() >= deadline) throw Error('Capture bound reached');
    const stem = 'rpc/' + String(++manifest.rpcCount).padStart(4, '0');
    await put(dir, stem + '-request.json', body);
    let response;
    try {
      response = await fetchImpl(address, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body,
        redirect: 'error',
        signal: globalThis.AbortSignal.timeout(Math.max(1, Math.min(15000, deadline - Date.now()))),
      });
    } catch {
      await put(dir, stem + '-transport.json', JSON.stringify({ error: 'READ_FAILED' }));
      throw Error('Read failed');
    }
    const text = await response.clone().text();
    await put(dir, stem + '-response.json', text);
    await put(dir, stem + '-transport.json', JSON.stringify({ status: response.status }));
    return response;
  };
  try {
    observation = await collectObservation({
      subject,
      threshold,
      rehearsal,
      server: new rpc.Server(RPC_URL, { timeout: 15000 }),
      now,
    });
  } catch {
    probeExitCode = 1;
  } finally {
    globalThis.fetch = original;
    release();
  }
  const stderr = captureStderr(probeExitCode, observation);
  manifest.endedAt = now().toISOString();
  const classification = await classifyObservation(observation, manifest, baseline);
  const result = {
    ...classification,
    probeExitCode,
    exitCode: classification.phase === 'unverified' ? 2 : 0,
    observation,
  };
  const stdout = observation ? formatCrossingProbe(observation.probe) : '';
  await put(dir, 'stdout.txt', stdout);
  await put(dir, 'stderr.txt', stderr);
  await put(dir, 'result.json', JSON.stringify(result, null, 2) + '\n');
  await put(dir, 'manifest.json', JSON.stringify(manifest, null, 2) + '\n');
  await sealCapture(dir);
  return result;
}
export async function captureCrossingProbe(options, dependencies) {
  if (active) throw Error('Only one capture per process');
  active = true;
  try {
    return await captureImplementation(options, dependencies);
  } finally {
    active = false;
  }
}
export function parseCaptureArgs(args) {
  const values = new Map();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (
      !['--output', '--subject', '--rehearsal-threshold', '--baseline'].includes(key) ||
      values.has(key) ||
      !args[i + 1] ||
      args[i + 1].startsWith('--')
    )
      throw Error('Invalid/repeated capture arguments');
    values.set(key, args[++i]);
  }
  if (!values.has('--output') || !['B', 'C'].includes(values.get('--subject')))
    throw Error('Explicit --output and --subject B|C required');
  return {
    directory: values.get('--output'),
    subject: values.get('--subject'),
    ...(values.has('--rehearsal-threshold')
      ? { rehearsalThreshold: Number(values.get('--rehearsal-threshold')) }
      : {}),
    ...(values.has('--baseline') ? { baselineDirectory: values.get('--baseline') } : {}),
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.slice(2).join(' ') === '--help')
      console.log(
        'capture-crossing-probe --subject B|C --output NEW_DIRECTORY [--rehearsal-threshold LEDGERS] [--baseline DIRECTORY]. Read-only. Environment BELOW is ignored. No .env loading or sending flags.',
      );
    else {
      const options = parseCaptureArgs(process.argv.slice(2));
      const git = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
      const paths = [
        'packages',
        'scripts',
        'package.json',
        'pnpm-lock.yaml',
        'tsconfig.json',
        'tsconfig.base.json',
        'docs/evidence/2026-09-14-bc-control-verification',
      ];
      if (git(['status', '--porcelain', '--untracked-files=all', '--', ...paths]))
        throw Error('Commit runtime inputs before a real capture');
      const sourceCommit = git(['rev-parse', 'HEAD']);
      execFileSync(
        process.execPath,
        [resolve('node_modules/typescript/bin/tsc'), '--build', '--force'],
        { stdio: 'pipe' },
      );
      if (
        git(['rev-parse', 'HEAD']) !== sourceCommit ||
        git(['status', '--porcelain', '--untracked-files=all', '--', ...paths])
      )
        throw Error('Source changed');
      const result = await captureCrossingProbe(options, {
        provenance: { sourceCommit, freshBuild: true },
      });
      console.log(
        JSON.stringify({
          phase: result.phase,
          qualifiesCrossing: result.qualifiesCrossing,
          reason: result.reason,
          exitCode: result.exitCode,
        }),
      );
      process.exitCode = result.exitCode;
    }
  } catch {
    console.error(
      'Capture refused or incomplete. Inspect retained artifacts; never overwrite them or force the crossing.',
    );
    process.exitCode = 2;
  }
}
