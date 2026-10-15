import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { captureCrossingProbe, sealCapture } from './capture-crossing-probe.mjs';
import { verifyCrossingCapture } from './verify-crossing-capture.mjs';
import { fixtureFetch, fixtureProvenance } from './fixtures/crossing-fetch.mjs';
const at = (day) => () => new Date(`2026-09-${day}T12:00:00Z`);
async function capture(dir, options = {}, fixture = {}) {
  return captureCrossingProbe(
    { directory: dir, subject: 'B', ...options },
    { fetchImpl: fixtureFetch(fixture).fetch, now: at('20'), provenance: fixtureProvenance },
  );
}
async function reseal(dir) {
  await rm(join(dir, 'SHA256SUMS'));
  await sealCapture(dir);
}
test('expiry requires a verified baseline and both persistent/instance boundaries', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-expiry-'));
  try {
    const baseline = join(root, 'before');
    await capture(baseline, {}, { remaining: 20000 });
    const noBase = await capture(join(root, 'none'), {}, { remaining: -2 });
    assert.equal(noBase.phase, 'unverified');
    const boundary = await capture(
      join(root, 'boundary'),
      { baselineDirectory: baseline },
      { remaining: -1 },
    );
    assert.equal(boundary.phase, 'unverified');
    const dir = join(root, 'after');
    const result = await capture(dir, { baselineDirectory: baseline }, { remaining: -2 });
    assert.equal(result.phase, 'expiry-observed');
    assert.equal((await verifyCrossingCapture(dir)).phase, 'expiry-observed');
    assert.equal(result.qualifiesCrossing, false);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('C qualification uses its own date; missing controls and failed reads stay unverified', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-unverified-'));
  try {
    const c = await captureCrossingProbe(
      { directory: join(root, 'c'), subject: 'C' },
      {
        fetchImpl: fixtureFetch({ subject: 'C' }).fetch,
        now: at('25'),
        provenance: fixtureProvenance,
      },
    );
    assert.equal(c.qualifiesCrossing, true);
    const early = await captureCrossingProbe(
      { directory: join(root, 'early'), subject: 'C' },
      {
        fetchImpl: fixtureFetch({ subject: 'C' }).fetch,
        now: at('20'),
        provenance: fixtureProvenance,
      },
    );
    assert.equal(early.qualifiesCrossing, false);
    for (const fixture of [{ missingControl: true }, { fail: true }]) {
      const dir = join(root, fixture.fail ? 'fail' : 'control');
      assert.equal((await capture(dir, {}, fixture)).phase, 'unverified');
      assert.equal((await verifyCrossingCapture(dir)).phase, 'unverified');
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('resealed contradictory TTL/result claims are rejected', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-tamper-'));
  try {
    const dir = join(root, 'capture');
    await capture(dir);
    const file = join(dir, 'result.json');
    const r = JSON.parse(await readFile(file, 'utf8'));
    r.observation.probe.run.scan.entries[Object.keys(r.observation.probe.run.scan.entries)[0]].ttl
      .endsAtLedger++;
    await writeFile(file, JSON.stringify(r));
    await reseal(dir);
    await assert.rejects(verifyCrossingCapture(dir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('even a failed capture cannot hide a write RPC in its transcript', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-write-'));
  try {
    const dir = join(root, 'capture');
    await capture(dir, {}, { fail: true });
    const file = join(dir, 'rpc/0001-request.json');
    const r = JSON.parse(await readFile(file, 'utf8'));
    r.method = 'sendTransaction';
    await writeFile(file, JSON.stringify(r));
    await reseal(dir);
    await assert.rejects(verifyCrossingCapture(dir));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
