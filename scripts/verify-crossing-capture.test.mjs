import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
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
test('dated gate rejects all rehearsal/supporting files and accepts a real verified capture', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-gate-'));
  const source = resolve('scripts/check-crossing-evidence.mjs');
  try {
    await mkdir(join(root, 'packages/core/src'), { recursive: true });
    await copyFile(
      'packages/core/src/write-guard.ts',
      join(root, 'packages/core/src/write-guard.ts'),
    );
    const parent = join(root, 'docs/evidence');
    await mkdir(parent, { recursive: true });
    await capture(
      join(parent, '2026-09-20-rehearsal'),
      { rehearsalThreshold: 1500000 },
      { remaining: 20000 },
    );
    const check = () =>
      spawnSync(process.execPath, [source], {
        cwd: root,
        env: { ...process.env, EVERGREEN_TODAY: '2026-09-20' },
        encoding: 'utf8',
      });
    assert.equal(check().status, 1);
    await capture(join(parent, '2026-09-20-real'));
    assert.equal(check().status, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test('capture and dated gate agree across operator and CI locales', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-locale-'));
  const repo = resolve('.');
  try {
    await mkdir(join(root, 'packages/core/src'), { recursive: true });
    await copyFile(
      'packages/core/src/write-guard.ts',
      join(root, 'packages/core/src/write-guard.ts'),
    );
    const parent = join(root, 'docs/evidence');
    await mkdir(parent, { recursive: true });
    const code = `
      import { captureCrossingProbe } from ${JSON.stringify(new globalThis.URL('./capture-crossing-probe.mjs', import.meta.url).href)};
      import { fixtureFetch, fixtureProvenance } from ${JSON.stringify(new globalThis.URL('./fixtures/crossing-fetch.mjs', import.meta.url).href)};
      const result = await captureCrossingProbe(
        { directory: ${JSON.stringify(join(parent, '2026-09-20-crossing'))}, subject: 'B' },
        { fetchImpl: fixtureFetch().fetch, provenance: fixtureProvenance, now: () => new Date('2026-09-20T12:00:00Z') }
      );
      if (!result.qualifiesCrossing) process.exitCode = 1;
    `;
    const captured = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
      cwd: repo,
      env: { ...process.env, LC_ALL: 'de_DE.UTF-8', LANG: 'de_DE.UTF-8' },
      encoding: 'utf8',
    });
    assert.equal(captured.status, 0, captured.stderr);
    for (const locale of ['de_DE.UTF-8', 'en_US.UTF-8']) {
      const checked = spawnSync(
        process.execPath,
        [join(repo, 'scripts/check-crossing-evidence.mjs')],
        {
          cwd: root,
          env: { ...process.env, LC_ALL: locale, LANG: locale, EVERGREEN_TODAY: '2026-09-20' },
          encoding: 'utf8',
        },
      );
      assert.equal(checked.status, 0, locale + ': ' + checked.stdout + checked.stderr);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
