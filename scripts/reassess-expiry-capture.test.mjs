import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import fsPromises from 'node:fs/promises';
import { Buffer } from 'node:buffer';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath } from 'node:url';
import { captureCrossingProbe, sealCapture } from './capture-crossing-probe.mjs';
import { verifyCrossingCapture } from './verify-crossing-capture.mjs';
import { fixtureFetch, fixtureProvenance } from './fixtures/crossing-fetch.mjs';
import { controlKeys, sha } from './crossing-capture-common.mjs';

import { assessExpiryCapture as assess } from './reassess-expiry-capture.mjs';
const now = () => new Date('2026-09-21T12:00:00Z');
async function setup(root, options = {}) {
  const {
    remaining = -2,
    zeroKinds = ['instance', 'persistent'],
    values = {},
    baseline = true,
    baselineSubject = 'B',
    rehearsal = false,
    missingControl = false,
    changedShared = false,
    changedPayload = false,
  } = options;
  const before = join(root, 'before');
  await captureCrossingProbe(
    { directory: before, subject: baselineSubject },
    {
      fetchImpl: fixtureFetch({ subject: baselineSubject, remaining: 20000 }).fetch,
      provenance: fixtureProvenance,
      now,
    },
  );
  const raw = JSON.parse(
    await readFile(
      new globalThis.URL(
        '../packages/core/test/fixtures/getLedgerEntries-bc-controls-2026-09-14.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ).result.entries;
  const keys = await controlKeys('B');
  const transport = fixtureFetch({ remaining, missingControl }).fetch;
  const fetchImpl = async (url, init) => {
    const request = JSON.parse(init.body);
    const response = await transport(url, init);
    const body = await response.json();
    if (request.method === 'getLedgerEntries') {
      for (const kind of zeroKinds) {
        const key = keys[kind];
        if (!request.params.keys.includes(key)) continue;
        body.result.entries = body.result.entries.filter((e) => e.key !== key);
        const entry = {
          ...raw.find((e) => e.key === key),
          liveUntilLedgerSeq: Object.hasOwn(values, kind) ? values[kind] : 0,
        };
        if (entry.liveUntilLedgerSeq === undefined) delete entry.liveUntilLedgerSeq;
        if (changedPayload && kind === 'persistent') {
          const { xdr } = await import('@stellar/stellar-sdk');
          const data = xdr.LedgerEntryData.fromXDR(entry.xdr, 'base64');
          data.contractData.val = xdr.ScVal.scvU32(2);
          entry.xdr = data.toXDR('base64');
        }
        body.result.entries.push(entry);
      }
      if (changedShared)
        for (const e of body.result.entries) if (e.key === keys.shared) e.liveUntilLedgerSeq++;
    }
    return new globalThis.Response(JSON.stringify(body));
  };
  const directory = join(root, 'after');
  await captureCrossingProbe(
    {
      directory,
      subject: 'B',
      ...(baseline ? { baselineDirectory: before } : {}),
      ...(rehearsal ? { rehearsalThreshold: 1500000 } : {}),
    },
    { fetchImpl, provenance: fixtureProvenance, now },
  );
  return directory;
}
async function withFixture(options, fn) {
  const root = await mkdtemp(join(tmpdir(), 'expiry-assessment-'));
  try {
    await fn(await setup(root, options));
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test('retained real RPC zero response is assessed without rewriting its failed original verdict', async () => {
  const dir = fileURLToPath(
    new globalThis.URL(
      '../docs/evidence/2026-09-21-b-crossing-1200/attempts/120035/',
      import.meta.url,
    ),
  );
  const before = await readFile(join(dir, 'SHA256SUMS'));
  // `checkRuntime: false`, matching what the assessor itself does
  // (reassess-expiry-capture.mjs:53). Strict runtime asserts that
  // packages/core/dist has not changed since the bundle was sealed on
  // 2026-09-20 — true of the capture-time gate and `verify:crossing` on the
  // day, and wrong here. What this test is about is the VERDICT on sealed
  // bytes: `unverified` before the assessment and still `unverified` after.
  // Left strict, it froze the whole of core: the 2026-09-22 browser fix
  // (#194) changed one dist file and broke it, and every future core change
  // would too — including an October reviewer's, on a tree they never touched.
  // Integrity still comes from the bundle's own SHA256SUMS, asserted below.
  const original = await verifyCrossingCapture(dir, { checkRuntime: false });
  assert.equal(original.phase, 'unverified');
  assert.equal(original.reason, 'INVALID_SUBJECT_TTL');
  const result = await assess(dir);
  assert.equal(result.phase, 'expiry-observed');
  assert.equal(result.ledger, 4793689);
  assert.equal(result.recordedVerdict.phase, 'unverified');
  assert.deepEqual(
    result.entries.map((e) => e.representation),
    ['rpc-non-live-zero', 'rpc-non-live-zero'],
  );
  assert.equal(result.source.checksumsSha256, sha(before));
  assert.deepEqual(await readFile(join(dir, 'SHA256SUMS')), before);
  assert.equal((await verifyCrossingCapture(dir, { checkRuntime: false })).phase, 'unverified');
});
test('absence and mixed absent/zero representations also require baseline proof', async () => {
  for (const zeroKinds of [[], ['instance'], ['persistent'], ['instance', 'persistent']])
    await withFixture({ zeroKinds }, async (dir) =>
      assert.equal((await assess(dir)).phase, 'expiry-observed'),
    );
});
test('TTL-zero boundary and live or extended returned entries cannot qualify', async () => {
  for (const options of [
    { remaining: 0 },
    { remaining: -1 },
    { remaining: 100, zeroKinds: [] },
    { values: { persistent: 4793688 } },
    { values: { persistent: 5000000 } },
  ])
    await withFixture(options, async (dir) => await assert.rejects(assess(dir)));
});
test('missing or wrong-subject baseline, rehearsal, and invalid controls fail closed', async () => {
  for (const options of [
    { baseline: false },
    { baselineSubject: 'C' },
    { rehearsal: true },
    { missingControl: true },
    { changedShared: true },
    { changedPayload: true },
  ])
    await withFixture(options, async (dir) => await assert.rejects(assess(dir)));
});
test('missing TTL is not the documented explicit zero marker', async () => {
  await withFixture(
    { values: { persistent: undefined } },
    async (dir) => await assert.rejects(assess(dir)),
  );
});
test('checksum corruption is rejected before assessment', async () => {
  await withFixture({}, async (dir) => {
    await writeFile(join(dir, 'stdout.txt'), 'altered');
    await assert.rejects(assess(dir));
  });
});

test('resealing a fabricated original verdict does not bypass raw replay', async () => {
  await withFixture({}, async (dir) => {
    const path = join(dir, 'result.json');
    const result = JSON.parse(await readFile(path, 'utf8'));
    result.phase = 'expiry-observed';
    result.reason = null;
    result.exitCode = 0;
    await writeFile(path, JSON.stringify(result));
    await rm(join(dir, 'SHA256SUMS'));
    await sealCapture(dir);
    await assert.rejects(assess(dir));
  });
});

test('non-numeric, missing and negative TTL values are never treated as the zero marker', async () => {
  for (const value of ['0', null, -1, 0.5]) {
    await withFixture(
      { values: { persistent: value } },
      async (dir) => await assert.rejects(assess(dir)),
    );
  }
});

test('retained assessment claims reproduce from the unchanged source bundles', async () => {
  const reportRoot = new globalThis.URL(
    '../docs/evidence/2026-09-21-b-expiry-assessment/',
    import.meta.url,
  );
  const { verifyEvidenceIntegrity } = await import('./verify-evidence-integrity.mjs');
  verifyEvidenceIntegrity(fileURLToPath(reportRoot));
  for (const name of ['120035', '120224', '120429']) {
    const saved = JSON.parse(
      await readFile(new globalThis.URL(name + '.json', reportRoot), 'utf8'),
    );
    const source = new globalThis.URL(
      '../docs/evidence/2026-09-21-b-crossing-1200/attempts/' + name,
      import.meta.url,
    );
    const actual = await assess(fileURLToPath(source));
    // Historical assessor fingerprints are provenance, not a reason to rewrite
    // an old report when trusted code changes. Its claims must still reproduce.
    const { assessor: savedRuntime, ...savedClaims } = saved;
    const { assessor: currentRuntime, ...actualClaims } = actual;
    assert.match(savedRuntime.scriptSha256, /^[a-f0-9]{64}$/);
    assert.equal(currentRuntime.historicalRuntimeAllowed, true);
    assert.deepEqual(actualClaims, savedClaims);
  }
});

test('a source change after replay cannot be certified with hashes of different bytes', async () => {
  await withFixture({}, async (dir) => {
    const manifestPath = join(dir, 'manifest.json');
    const contents = await readFile(manifestPath);
    const originalRead = fsPromises.readFile;
    let manifestReads = 0;
    fsPromises.readFile = async (...args) => {
      if (args[0] === manifestPath && ++manifestReads === 2) {
        // Parsed meaning unchanged, but these are no longer the sealed bytes.
        await writeFile(manifestPath, Buffer.concat([contents, Buffer.from('\n')]));
      }
      return originalRead(...args);
    };
    syncBuiltinESMExports();
    try {
      await assert.rejects(assess(dir), /SOURCE_CHANGED|checksum mismatch/);
      assert(manifestReads >= 2);
    } finally {
      fsPromises.readFile = originalRead;
      syncBuiltinESMExports();
    }
  });
});
