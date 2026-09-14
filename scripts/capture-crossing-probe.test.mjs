import process from 'node:process';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { fixtureFetch, fixtureProvenance } from './fixtures/crossing-fetch.mjs';
import { captureCrossingProbe } from './capture-crossing-probe.mjs';
import { verifyCrossingCapture } from './verify-crossing-capture.mjs';
export const clock = () => new Date('2026-09-20T12:00:00Z');
for (const [remaining, phase] of [
  [20000, 'before-action'],
  [17280, 'crossing-refused'],
  [0, 'crossing-refused'],
]) {
  test(`collector verifies ${phase} at remaining ${remaining}`, async () => {
    const root = await mkdtemp(join(tmpdir(), 'cross-capture-'));
    const f = fixtureFetch({ remaining });
    try {
      const dir = join(root, 'capture');
      const result = await captureCrossingProbe(
        { directory: dir, subject: 'B' },
        { fetchImpl: f.fetch, now: clock, provenance: fixtureProvenance },
      );
      assert.equal(result.phase, phase);
      assert.equal(result.probeExitCode, 0);
      assert.equal(result.qualifiesCrossing, phase === 'crossing-refused');
      assert.equal((await verifyCrossingCapture(dir)).phase, phase);
      assert(f.calls.every((x) => ['getNetwork', 'getLedgerEntries'].includes(x)));
      await assert.rejects(
        captureCrossingProbe(
          { directory: dir, subject: 'B' },
          { fetchImpl: f.fetch, now: clock, provenance: fixtureProvenance },
        ),
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
}
test('raised rehearsal cannot count even on the crossing date', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-rehearsal-'));
  try {
    const dir = join(root, 'capture');
    await captureCrossingProbe(
      { directory: dir, subject: 'B', rehearsalThreshold: 1500000 },
      {
        fetchImpl: fixtureFetch({ remaining: 20000 }).fetch,
        now: clock,
        provenance: fixtureProvenance,
      },
    );
    const r = await verifyCrossingCapture(dir);
    assert.equal(r.phase, 'rehearsal');
    assert.equal(r.qualifiesCrossing, false);
    assert.match(await readFile(join(dir, 'stdout.txt'), 'utf8'), /RAISED — rehearsal/);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('unattributed runtime cannot qualify an event', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-unpinned-'));
  try {
    const r = await captureCrossingProbe(
      { directory: join(root, 'capture'), subject: 'B' },
      { fetchImpl: fixtureFetch().fetch, now: clock },
    );
    assert.equal(r.phase, 'unverified');
    assert.equal(r.reason, 'UNPINNED_RUNTIME');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('a failed follow-up control read preserves the successful probe output', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-partial-'));
  const f = fixtureFetch();
  try {
    const result = await captureCrossingProbe(
      { directory: join(root, 'capture'), subject: 'B' },
      {
        fetchImpl: async (url, init) => {
          const req = JSON.parse(init.body);
          if (req.method === 'getLedgerEntries' && req.params.keys.length === 5)
            throw Error('control failure');
          return f.fetch(url, init);
        },
        now: clock,
        provenance: fixtureProvenance,
      },
    );
    assert.equal(result.phase, 'unverified');
    assert.equal(result.probeExitCode, 0);
    assert(result.observation.probe);
    assert.equal(result.reason, 'CONTROL_READ_FAILED');
    assert.match(
      await readFile(join(root, 'capture', 'stdout.txt'), 'utf8'),
      /REFUSED BY WRITE GUARD/,
    );
    assert.equal((await verifyCrossingCapture(join(root, 'capture'))).phase, 'unverified');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('capture options reject sending flags and ignore inherited rehearsal settings', async () => {
  const { parseCaptureArgs } = await import('./capture-crossing-probe.mjs');
  assert.throws(() => parseCaptureArgs(['--output', 'x', '--subject', 'B', '--submit']));
  assert.throws(() => parseCaptureArgs(['--output', 'x', '--subject', 'A']));
  const root = await mkdtemp(join(tmpdir(), 'cross-env-'));
  const old = process.env.BELOW;
  process.env.BELOW = '1500000';
  try {
    const r = await captureCrossingProbe(
      { directory: join(root, 'capture'), subject: 'B' },
      {
        fetchImpl: fixtureFetch({ remaining: 20000 }).fetch,
        now: clock,
        provenance: fixtureProvenance,
      },
    );
    assert.equal(r.phase, 'before-action');
    assert.equal(r.observation.probe.below, 17280);
  } finally {
    if (old === undefined) delete process.env.BELOW;
    else process.env.BELOW = old;
    await rm(root, { recursive: true, force: true });
  }
});
test('a producer regression cannot send a write through the capture transport', async () => {
  const { rpc } = await import('@stellar/stellar-sdk');
  const original = rpc.Server.prototype.getNetwork;
  const root = await mkdtemp(join(tmpdir(), 'cross-deny-'));
  const f = fixtureFetch();
  rpc.Server.prototype.getNetwork = async () => {
    await globalThis.fetch('https://soroban-testnet.stellar.org', {
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'sendTransaction', params: {} }),
    });
    return { passphrase: 'Test SDF Network ; September 2015' };
  };
  try {
    const r = await captureCrossingProbe(
      { directory: join(root, 'capture'), subject: 'B' },
      { fetchImpl: f.fetch, now: clock, provenance: fixtureProvenance },
    );
    assert.equal(r.phase, 'unverified');
    assert.equal(f.calls.length, 0);
  } finally {
    rpc.Server.prototype.getNetwork = original;
    await rm(root, { recursive: true, force: true });
  }
});
test('concurrent captures in one process cannot replace each others transport', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-concurrent-'));
  const f = fixtureFetch();
  let signal, release;
  const entered = new Promise((r) => {
    signal = r;
  });
  const gate = new Promise((r) => {
    release = r;
  });
  const deps = {
    fetchImpl: async (...args) => {
      signal();
      await gate;
      return f.fetch(...args);
    },
    now: clock,
    provenance: fixtureProvenance,
  };
  const first = captureCrossingProbe({ directory: join(root, 'one'), subject: 'B' }, deps);
  try {
    await entered;
    await assert.rejects(
      captureCrossingProbe({ directory: join(root, 'two'), subject: 'B' }, deps),
      /one capture/i,
    );
    release();
    assert.equal((await first).phase, 'crossing-refused');
  } finally {
    release();
    await first;
    await rm(root, { recursive: true, force: true });
  }
});
test('control XDR must belong to its returned ledger key', async () => {
  const root = await mkdtemp(join(tmpdir(), 'cross-owner-'));
  const f = fixtureFetch();
  const raw = JSON.parse(
    await readFile(
      'packages/core/test/fixtures/getLedgerEntries-bc-controls-2026-09-14.json',
      'utf8',
    ),
  ).result.entries;
  try {
    const r = await captureCrossingProbe(
      { directory: join(root, 'capture'), subject: 'B' },
      {
        now: clock,
        provenance: fixtureProvenance,
        fetchImpl: async (url, init) => {
          const response = await f.fetch(url, init);
          const request = JSON.parse(init.body);
          const body = await response.json();
          if (request.method === 'getLedgerEntries' && request.params.keys.length === 5) {
            const b = body.result.entries.find((e) => e.key === raw[0].key);
            b.xdr = raw[1].xdr;
          }
          return new globalThis.Response(JSON.stringify(body));
        },
      },
    );
    assert.equal(r.phase, 'unverified');
    assert.equal(r.reason, 'CONTROL_READ_FAILED');
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
