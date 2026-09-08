import assert from 'node:assert/strict';
import { test } from 'node:test';
import { connectionOptions, schemaName } from './persistence-store.mjs';
import { parseMode, runSpike } from './persistence-spike.mjs';

test('preview and help never connect even with a configured database', async () => {
  const connectImpl = () => {
    throw new Error('must not connect');
  };
  const preview = await runSpike({ env: { PERSISTENCE_DATABASE_URL: 'unused' }, connectImpl });
  assert.equal(preview.status, 'dry-run');
  assert.equal(preview.databaseWrites, false);
  assert.equal((await runSpike({ args: ['--help'], connectImpl })).checks.length, 8);
});

test('only an exact explicit run flag permits the database experiment', () => {
  assert.equal(parseMode([]), 'preview');
  assert.equal(parseMode(['--run']), 'run');
  for (const args of [['--send'], ['--run', '--run'], ['--help', '--run'], ['--run=true']]) {
    assert.throws(() => parseMode(args));
  }
});

test('remote connections verify TLS even when the URI only says require', () => {
  const options = connectionOptions(
    'postgresql://tester:dummy@db.example.test/probe?sslmode=require&channel_binding=require',
  );
  assert.deepEqual(options.ssl, { rejectUnauthorized: true });
  assert.equal(options.enableChannelBinding, true);
  assert.equal(options.database, 'probe');
});

test('remote downgrade options and unreviewed URI settings are refused', () => {
  for (const params of [
    'sslmode=disable',
    'sslmode=no-verify',
    'sslmode=prefer',
    'options=unsafe',
    'channel_binding=disable',
  ]) {
    assert.throws(() => connectionOptions(`postgres://tester@db.example.test/probe?${params}`));
  }
});

test('unencrypted connections are confined to explicit loopback hosts', () => {
  for (const host of ['localhost', '127.0.0.1', '[::1]']) {
    assert.equal(connectionOptions(`postgres://tester@${host}:5432/probe`).ssl, false);
  }
  assert.deepEqual(connectionOptions('postgres://tester@localhost.example.test/probe').ssl, {
    rejectUnauthorized: true,
  });
});

test('schema names cannot point at an existing user namespace or inject SQL', () => {
  assert.equal(
    schemaName(`evergreen_spike_${'a'.repeat(32)}`),
    `"evergreen_spike_${'a'.repeat(32)}"`,
  );
  for (const value of [
    'public',
    'evergreen_spike_',
    'public; DROP SCHEMA public CASCADE',
    'evergreen_spike_' + 'g'.repeat(32),
  ]) {
    assert.throws(() => schemaName(value));
  }
});

test('invalid URLs and transport errors never disclose credentials', async () => {
  const secret = 'private-database-password';
  for (const value of [
    undefined,
    secret,
    `https://tester:${secret}@db.example.test/probe`,
    'postgres://tester@localhost/',
  ]) {
    assert.throws(
      () => connectionOptions(value),
      (error) => !error.message.includes(secret),
    );
  }
  const result = await runSpike({
    args: ['--run'],
    connectImpl: () => {
      throw new Error(secret);
    },
  });
  assert.equal(result.status, 'failed');
  assert.equal(result.databaseWrites, false);
  assert.equal(result.cleanup, 'not-needed');
  assert.equal(JSON.stringify(result).includes(secret), false);
});
