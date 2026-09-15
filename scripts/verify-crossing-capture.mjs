import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { rpc } from '@stellar/stellar-sdk';
import { verifyEvidenceIntegrity } from './verify-evidence-integrity.mjs';
import {
  RPC_URL,
  runtimeHashes,
  collectObservation,
  classifyObservation,
  acquireCaptureTransport,
  captureStderr,
} from './crossing-capture-common.mjs';
let verifying = false;
async function readParts(dir) {
  verifyEvidenceIntegrity(dir);
  const json = async (name) => JSON.parse(await readFile(join(dir, name), 'utf8'));
  const manifest = await json('manifest.json');
  assert(
    Number.isSafeInteger(manifest.rpcCount) && manifest.rpcCount >= 0 && manifest.rpcCount <= 64,
  );
  const records = [];
  const expected = [
    '.crossing-capture',
    'SHA256SUMS',
    'started.json',
    'manifest.json',
    'result.json',
    'stdout.txt',
    'stderr.txt',
    ...(manifest.baseline ? ['baseline.json'] : []),
  ];
  for (let i = 1; i <= manifest.rpcCount; i++) {
    const stem = 'rpc/' + String(i).padStart(4, '0');
    const transport = await json(stem + '-transport.json');
    expected.push(
      stem + '-request.json',
      stem + '-transport.json',
      ...(transport.error ? [] : [stem + '-response.json']),
    );
    records.push({
      request: await readFile(join(dir, stem + '-request.json'), 'utf8'),
      transport,
      ...(transport.error
        ? {}
        : { response: await readFile(join(dir, stem + '-response.json'), 'utf8') }),
    });
  }
  const actual = [];
  async function walk(p, prefix = '') {
    for (const e of await readdir(p, { withFileTypes: true })) {
      assert(!e.isSymbolicLink());
      if (e.isDirectory()) await walk(join(p, e.name), prefix + e.name + '/');
      else actual.push(prefix + e.name);
    }
  }
  await walk(dir);
  assert.deepEqual(actual.sort(), expected.sort(), 'Unexpected or missing capture file');
  const declared = (await readFile(join(dir, 'SHA256SUMS'), 'utf8'))
    .trim()
    .split('\n')
    .map((l) => l.slice(66));
  assert.deepEqual(
    declared.sort(),
    expected.filter((n) => n !== 'SHA256SUMS').sort(),
    'Incomplete checksum inventory',
  );
  assert.equal(await readFile(join(dir, '.crossing-capture'), 'utf8'), 'evergreen-crossing-v1\n');
  assert.deepEqual(await json('started.json'), {
    subject: manifest.subject,
    threshold: manifest.threshold,
    rehearsal: manifest.rehearsal,
    startedAt: manifest.startedAt,
  });
  return {
    manifest,
    records,
    result: await json('result.json'),
    stdout: await readFile(join(dir, 'stdout.txt'), 'utf8'),
    stderr: await readFile(join(dir, 'stderr.txt'), 'utf8'),
    baseline: manifest.baseline ? await json('baseline.json') : null,
  };
}
async function verifyParts(parts, depth = 0, checkRuntime = true) {
  const { manifest: m, records, result, baseline } = parts;
  assert(depth <= 1 && (!depth || !baseline), 'Nested baseline');
  assert.equal(m.captureFormat, 'evergreen-crossing-v1');
  assert.equal(m.version, 1);
  assert.equal(m.baseline, baseline !== null);
  assert(['B', 'C'].includes(m.subject));
  assert.equal(typeof m.rehearsal, 'boolean');
  assert(Number.isSafeInteger(m.threshold) && m.threshold > 0);
  assert(Number.isSafeInteger(m.rpcCount) && m.rpcCount >= 0 && m.rpcCount <= 64);
  assert.equal(records.length, m.rpcCount);
  const start = Date.parse(m.startedAt),
    end = Date.parse(m.endedAt);
  assert(
    Number.isFinite(start) && Number.isFinite(end) && end >= start && end - start <= 180000,
    'Invalid capture time',
  );
  if (checkRuntime)
    assert.deepEqual(
      m.runtimeHashes,
      await runtimeHashes(),
      'Verify with the recorded runtime version',
    );
  for (const record of records) {
    const request = JSON.parse(record.request);
    assert(['getNetwork', 'getLedgerEntries'].includes(request.method), 'Non-read RPC');
    assert.equal(request.jsonrpc, '2.0');
  }
  assert.equal(new Date(start).toISOString(), m.startedAt);
  assert.equal(new Date(end).toISOString(), m.endedAt);
  if (baseline) {
    await verifyParts(baseline, depth + 1, checkRuntime);
    assert(!baseline.manifest.rehearsal);
    assert(['before-action', 'crossing-refused'].includes(baseline.result.phase));
    assert(Date.parse(baseline.manifest.endedAt) <= start);
  }
  const { formatCrossingProbe, ACTION_THRESHOLD } = await import('./b-crossing-probe.mjs');
  if (!m.rehearsal) assert.equal(m.threshold, ACTION_THRESHOLD);
  const release = acquireCaptureTransport();
  let cursor = 0,
    observation = null,
    probeExitCode = 0,
    replayMismatch = false;
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    try {
      assert([RPC_URL, RPC_URL + '/'].includes(String(input)));
      const current = JSON.parse(init.body);
      const recorded = records[cursor++];
      assert(recorded, 'Unrecorded request');
      const expected = JSON.parse(recorded.request);
      assert(['getNetwork', 'getLedgerEntries'].includes(expected.method), 'Non-read RPC');
      assert.equal(current.method, expected.method);
      assert.deepEqual(current.params, expected.params);
      if (recorded.transport.error) {
        assert.equal(recorded.transport.error, 'READ_FAILED');
        throw Error('Recorded read error');
      }
      let body = recorded.response;
      try {
        const parsed = JSON.parse(body);
        if (parsed.result) {
          assert.equal(parsed.id, expected.id);
          assert.equal(parsed.jsonrpc, '2.0');
        }
        parsed.id = current.id;
        body = JSON.stringify(parsed);
      } catch (error) {
        if (error.name === 'AssertionError') throw error;
      }
      return new globalThis.Response(body, { status: recorded.transport.status });
    } catch (error) {
      if (error.name === 'AssertionError') replayMismatch = true;
      throw error;
    }
  };
  try {
    observation = await collectObservation({
      subject: m.subject,
      threshold: m.threshold,
      rehearsal: m.rehearsal,
      server: new rpc.Server(RPC_URL, { timeout: 15000 }),
      now: () => new Date(result.observation?.probe.observedAt ?? m.startedAt),
    });
  } catch {
    probeExitCode = 1;
  } finally {
    globalThis.fetch = original;
    release();
  }
  assert(!replayMismatch, 'Replay request/response mismatch');
  assert.equal(cursor, records.length, 'Unused/missing RPC record');
  if (observation) {
    const date = Date.parse(observation.probe.observedAt);
    assert(date >= start && date <= end);
  }
  const classified = await classifyObservation(observation, m, baseline);
  const expected = {
    ...classified,
    probeExitCode,
    exitCode: classified.phase === 'unverified' ? 2 : 0,
    observation,
  };
  assert.deepEqual(result, expected, 'Summary disagrees with recorded reads');
  assert.equal(parts.stdout, observation ? formatCrossingProbe(observation.probe) : '');
  assert.equal(parts.stderr, captureStderr(probeExitCode, observation));
  return { ...classified, probeExitCode, exitCode: expected.exitCode };
}
export async function readVerifiedCapture(directory, { checkRuntime = true } = {}) {
  if (verifying) throw Error('Concurrent verification is unsupported');
  verifying = true;
  try {
    const p = await readParts(resolve(directory));
    await verifyParts(p, 0, checkRuntime);
    return p;
  } finally {
    verifying = false;
  }
}
export async function verifyCrossingCapture(directory, options) {
  const p = await readVerifiedCapture(directory, options);
  return {
    subject: p.manifest.subject,
    observedAt: p.result.observation?.probe.observedAt ?? null,
    phase: p.result.phase,
    qualifiesCrossing: p.result.qualifiesCrossing,
    exitCode: p.result.exitCode,
    reason: p.result.reason,
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const args = process.argv.slice(2);
    if (!args[0] || args.length > 2 || (args[1] && args[1] !== '--require-crossing'))
      throw Error('Use DIRECTORY [--require-crossing]');
    const r = await verifyCrossingCapture(args[0]);
    console.log(JSON.stringify(r));
    process.exitCode = args[1] && !r.qualifiesCrossing ? 2 : r.exitCode;
  } catch (error) {
    // The pre-flight names `--require-crossing` as THE check, so this message is
    // what an operator reads on a crossing day. One fixed string for every
    // failure meant a mistyped directory read as "your genuine capture does not
    // qualify" — the most damaging possible misreading, on the day that cannot
    // be repeated.
    //
    // Allowlisted literals only, the `safeRunCode` rule: assertion failures from
    // verifyParts carry generated text and are deliberately not surfaced.
    const OWN = new Set([
      'Use DIRECTORY [--require-crossing]',
      'Concurrent verification is unsupported',
      'Read failed',
      'Recorded read error',
      'Use a real live-entry baseline without another baseline',
    ]);
    const reason = OWN.has(error?.message) ? error.message : null;
    console.error(
      'Capture verification failed; do not count this artifact as crossing evidence.' +
        (error?.code === 'ENOENT'
          ? `\n  Missing path: ${error.path ?? 'unknown'}\n` +
            '  Nothing was read, so nothing is disqualified. Check the directory and re-run.'
          : reason === null
            ? '\n  The capture was read and did not verify. This is about the ARTIFACT,\n' +
              '  not about how the command was invoked.'
            : `\n  Reason: ${reason}\n` +
              '  This is about the INVOCATION, not the artifact — the capture was never\n' +
              '  assessed, so it is not disqualified. Fix the command and re-run.'),
    );
    process.exitCode = 2;
  }
}
