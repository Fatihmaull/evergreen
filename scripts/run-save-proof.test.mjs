import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { checkSaveProof } from './check-save-proof-readiness.mjs';
import { runSaveProof } from './run-save-proof.mjs';
import process from 'node:process';
const hash = (value) => createHash('sha256').update(value).digest('hex');
async function setup() {
  const root = await mkdtemp(join(tmpdir(), 'save-proof-'));
  const paths = [
    'scripts/engine-alert-run.mjs',
    'scripts/engine-recorder.mjs',
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
  await writeFile(
    join(root, 'runtime-manifest.json'),
    JSON.stringify({ sourceCommit: 'a'.repeat(40), runtimeRoot: root, files }),
  );
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
      runId: 'w3-save-test',
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
      const c = globalThis.structuredClone(s.c);
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

test('proof refuses a campaign that omits a changed runtime dependency from its hashes', async () => {
  const s = await setup();
  try {
    const files = { ...s.manifest.files };
    delete files['scripts/engine-recorder.mjs'];
    await writeFile(join(s.root, 'scripts/engine-recorder.mjs'), 'changed dependency');
    await assert.rejects(checkSaveProof({ ...s.manifest, files }), /manifest|Runtime/i);
  } finally {
    await rm(s.root, { recursive: true, force: true });
  }
});

/**
 * Two guards on the live-submit path that survived mutation.
 *
 * Found 2026-09-15: making `submit` default to true, and removing the
 * alerts-plus-systemd requirement, each left all four tests green. Neither is
 * redundant with anything else — the readiness gate runs in both cases and
 * passes, because a valid manifest inside its window is precisely the state in
 * which these two are the only things left saying "not like this".
 *
 * They matter because this is the one harness in the repo that can actually
 * submit. "Dry-run is the default; live submission requires an explicit flag" is
 * a standing rule, and a default is not a rule until something fails when it
 * moves.
 *
 * Both assertions land before any execution: the readiness gate and the
 * alerts/invocation check both run ahead of the capture directory being made, so
 * this never invokes the runtime the fixture only pretends to be.
 */
test('🔴 submit is opt-in, and a live submit needs alerts and a recorded invocation', async () => {
  const s = await setup();
  const manifestPath = join(s.root, 'campaign.json');
  await writeFile(manifestPath, JSON.stringify(s.manifest));
  const invocation = process.env.INVOCATION_ID;
  delete process.env.INVOCATION_ID;
  try {
    // --submit is refused without --send-alerts: a live send is never silent.
    await assert.rejects(
      runSaveProof(manifestPath, { submit: true }),
      /alerts and a recorded systemd invocation/,
    );
    // With alerts but no systemd invocation, still refused — a live submit stays
    // attributable to a timer rather than to somebody's shell.
    await assert.rejects(
      runSaveProof(manifestPath, { submit: true, sendAlerts: true }),
      /alerts and a recorded systemd invocation/,
    );

    // The default must not take the live branch. An unreconciled attempt file
    // makes the live readiness gate reject with a distinctive message, so the
    // default calling that branch would be visible here.
    await writeFile(s.manifest.attemptFile, 'intent');
    await assert.rejects(runSaveProof(manifestPath, { submit: true }), /reconciled/);
    await assert.rejects(
      runSaveProof(manifestPath),
      (e) => !/reconciled/.test(String(e?.message ?? e)),
      'default must not run the live readiness branch',
    );
  } finally {
    if (invocation === undefined) delete process.env.INVOCATION_ID;
    else process.env.INVOCATION_ID = invocation;
    await rm(s.root, { recursive: true, force: true });
  }
});
