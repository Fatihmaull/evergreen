import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { createLocalSubmissionRecorder } from './engine-recorder.mjs';

describe('local attempt recorder — retained one-shot journal', () => {
  it('writes and flushes each public intent, retains it after close and refuses reuse', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'evergreen-recorder-'));
    try {
      const path = join(dir, 'attempt.jsonl');
      const recorder = createLocalSubmissionRecorder(path);
      await recorder.assertReady();
      await recorder.record({ transactionHash: 'first', payer: 'p' });
      await recorder.record({ transactionHash: 'second', payer: 'p' });
      await recorder.close();
      const rows = (await readFile(path, 'utf8')).trim().split('\n').map(JSON.parse);
      assert.deepEqual(
        rows.map((r) => r.intent.transactionHash),
        ['first', 'second'],
      );
      assert.equal((await stat(path)).mode & 0o777, 0o600);
      await assert.rejects(createLocalSubmissionRecorder(path).assertReady(), /exists|reconcile/i);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('does not overwrite an existing empty or corrupt intent file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'evergreen-recorder-'));
    try {
      const path = join(dir, 'attempt.jsonl');
      await writeFile(path, 'original');
      const r = createLocalSubmissionRecorder(path);
      await assert.rejects(r.record({ transactionHash: 'new' }));
      assert.equal(await readFile(path, 'utf8'), 'original');
      await r.close();
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
  it('two writers cannot both acquire the same attempt file', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'evergreen-recorder-'));
    const a = createLocalSubmissionRecorder(join(dir, 'attempt.jsonl')),
      b = createLocalSubmissionRecorder(join(dir, 'attempt.jsonl'));
    try {
      await Promise.all([a.assertReady(), b.assertReady()]);
      const results = await Promise.allSettled([
        a.record({ transactionHash: 'a' }),
        b.record({ transactionHash: 'b' }),
      ]);
      assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    } finally {
      await a.close();
      await b.close();
      await rm(dir, { recursive: true, force: true });
    }
  });
});
