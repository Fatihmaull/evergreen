import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRunJournal } from './run-journal.mjs';
import { runAlertCommand } from './engine-alert-run.mjs';
test('run IDs are exclusive and intent/receipt are distinct retained files', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alert-journal-'));
  try {
    const j = createRunJournal(dir);
    await j.start('run');
    await j.execution({ execution: { records: [] } });
    await j.intent({ id: 'event', notification: {} });
    await j.receipt({ id: 'event', status: 'accepted' });
    assert.equal((await readdir(join(dir, 'run'))).length, 4);
    await assert.rejects(createRunJournal(dir).start('run'));
    assert.deepEqual(JSON.parse(await readFile(join(dir, 'run', 'execution.json'), 'utf8')), {
      execution: { records: [] },
    });
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('a config failure reaches the actual wrapper and email adapter without a fake record', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'alert-command-'));
  let requests = 0;
  try {
    const result = await runAlertCommand(
      ['--run-id', 'bad-config', '--output-dir', dir, '--send-alerts'],
      {
        read: async () => '{invalid',
        env: (name) =>
          ({ EMAIL_API_KEY: 'test-only-placeholder', EVERGREEN_ALERT_TO: 'recipient@example.com' })[
            name
          ],
        fetchImpl: async () => {
          requests++;
          return new globalThis.Response(
            JSON.stringify({ id: '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794' }),
          );
        },
        rpcFactory: () => {
          throw new Error('No RPC should be created');
        },
      },
    );
    assert.equal(result.exitCode, 2);
    assert.equal(result.execution, undefined);
    assert.equal(result.runFailure.code, 'CONFIG_FAILED');
    assert.equal(requests, 1);
    assert.equal(result.alertReceipts[0].status, 'accepted');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
test('help does not create storage or touch configuration', async () => {
  assert.equal(
    (
      await runAlertCommand(['--help'], {
        env: () => {
          throw Error('no env');
        },
        read: () => {
          throw Error('no file');
        },
      })
    ).exitCode,
    0,
  );
  await assert.rejects(runAlertCommand(['--submit']));
});
