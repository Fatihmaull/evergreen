import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runEmailSmoke } from './send-test-email.mjs';

test('retired probe gives migration instructions without reading configuration or sending', async () => {
  const result = await runEmailSmoke({
    env: new Proxy(
      {},
      {
        get() {
          assert.fail('No environment read');
        },
      },
    ),
    fetchImpl() {
      assert.fail('No network');
    },
  });
  assert.equal(result.status, 'retired');
  assert.match(result.usage, /email:notify --record/);
});
test('retired help is offline and old --send fails rather than sending a stale setup message', async () => {
  assert.equal((await runEmailSmoke({ args: ['--help'] })).status, 'retired');
  await assert.rejects(
    runEmailSmoke({
      args: ['--send'],
      fetchImpl() {
        assert.fail('No network');
      },
    }),
    /retired/i,
  );
});
test('unknown or combined flags do not activate any old probe path', async () => {
  for (const args of [['--send=true'], ['--help', '--send'], ['--unknown']])
    await assert.rejects(runEmailSmoke({ args }), /retired/i);
});
