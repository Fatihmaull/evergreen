import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { checkSaveProof } from './check-save-proof-readiness.mjs';
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'save-proof-'));
  const paths = [
    'scripts/engine-alert-run.mjs',
    'scripts/run-save-proof.mjs',
    'scripts/check-save-proof-readiness.mjs',
    'packages/engine/dist/index.js',
    'packages/core/dist/index.js',
  ];
  const files = {};
  for (const path of paths) {
    await mkdir(join(root, path, '..'), { recursive: true });
    await writeFile(join(root, path), 'fixture');
    files[path] = hash('fixture');
  }
  const c = JSON.parse(await readFile('evergreen.config.save-proof.json', 'utf8'));
  c.mode = 'live';
  const configPath = join(root, 'config.json');
  const raw = JSON.stringify(c);
  await writeFile(configPath, raw);
  const now = Date.now();
  return {
    root,
    c,
    manifest: {
      version: 1,
      runtimeRoot: root,
      files,
      configPath,
      configSha256: hash(raw),
      sourceCommit: 'a'.repeat(40),
      runId: 'paket-a-test',
      attemptFile: join(root, 'attempt.jsonl'),
      outputRoot: root,
      notBefore: now - 1000,
      notAfter: now + 60000,
    },
  };
}
test('proof refuses changed runtime/config and exhausted attempt, preserves normal preflight', async () => {
  const s = await setup();
  try {
    await checkSaveProof(s.manifest, { live: true });
    await writeFile(s.manifest.attemptFile, 'intent');
    await assert.rejects(checkSaveProof(s.manifest, { live: true }), /reconciled/);
    await assert.rejects(
      checkSaveProof({ ...s.manifest, configSha256: '0'.repeat(64) }),
      /Config changed/,
    );
    await writeFile(join(s.root, 'scripts/engine-alert-run.mjs'), 'changed');
    await assert.rejects(checkSaveProof(s.manifest), /Runtime changed/);
  } finally {
    await rm(s.root, { recursive: true, force: true });
  }
});
test('proof scope excludes B and an excessive fee cap even with a matching config hash', async () => {
  const s = await setup();
  try {
    for (const mutate of [
      (c) => (c.contracts[0].id = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ'),
      (c) => (c.payers['bot-testnet'].maxFeeStroops = '2000001'),
    ]) {
      const c = structuredClone(s.c);
      mutate(c);
      const raw = JSON.stringify(c);
      await writeFile(s.manifest.configPath, raw);
      await assert.rejects(checkSaveProof({ ...s.manifest, configSha256: hash(raw) }), /scope|cap/);
    }
  } finally {
    await rm(s.root, { recursive: true, force: true });
  }
});
test('a live proof cannot run outside its bounded window', async () => {
  const s = await setup();
  try {
    await assert.rejects(
      checkSaveProof(s.manifest, { live: true, now: s.manifest.notAfter }),
      /Outside/,
    );
  } finally {
    await rm(s.root, { recursive: true, force: true });
  }
});
