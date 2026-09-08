import assert from 'node:assert/strict';
import { test } from 'node:test';
import { runEmailSmoke } from './send-test-email.mjs';

const env = { EMAIL_TO: 'recipient@example.com', EMAIL_API_KEY: 'test-only-placeholder' };
const emailId = '49a3999c-0ce1-4ea6-ab68-afcd6dc2e794';
const noNetwork = () => assert.fail('This path must not access the network');

test('default preview works without an API key and makes no request', async () => {
  const result = await runEmailSmoke({ env: { EMAIL_TO: env.EMAIL_TO }, fetchImpl: noNetwork });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.submitted, false);
  assert.ok(!JSON.stringify(result).includes(env.EMAIL_TO));
});

test('help works without configuration and unknown flags never send', async () => {
  assert.equal((await runEmailSmoke({ args: ['--help'], fetchImpl: noNetwork })).status, 'help');
  for (const args of [['--submit'], ['--send=true'], ['--send', '--help'], ['--send', '--send']]) {
    await assert.rejects(
      runEmailSmoke({ args, env, fetchImpl: noNetwork }),
      /Expected no arguments/,
    );
  }
});

test('missing or multiple recipients and malformed senders fail before requesting', async () => {
  for (const value of [
    '',
    'invalid',
    'one@example.com,two@example.com',
    'one@example.com\nbcc@example.com',
  ]) {
    await assert.rejects(
      runEmailSmoke({ args: ['--send'], env: { ...env, EMAIL_TO: value }, fetchImpl: noNetwork }),
      /EMAIL_TO/,
    );
  }
  await assert.rejects(
    runEmailSmoke({
      args: ['--send'],
      env: { ...env, EMAIL_FROM: 'bad sender' },
      fetchImpl: noNetwork,
    }),
    /EMAIL_FROM/,
  );
});

test('sending needs a key and is refused in CI', async () => {
  await assert.rejects(
    runEmailSmoke({ args: ['--send'], env: { EMAIL_TO: env.EMAIL_TO }, fetchImpl: noNetwork }),
    /EMAIL_API_KEY/,
  );
  await assert.rejects(
    runEmailSmoke({ args: ['--send'], env: { ...env, CI: 'true' }, fetchImpl: noNetwork }),
    /CI cannot send/,
  );
});

test('explicit send posts one email and reports acceptance without claiming inbox receipt', async () => {
  const calls = [];
  const result = await runEmailSmoke({
    args: ['--send'],
    env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return new globalThis.Response(JSON.stringify({ id: emailId }), { status: 200 });
    },
  });
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://api.resend.com/emails');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.headers.Authorization, `Bearer ${env.EMAIL_API_KEY}`);
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.from, 'onboarding@resend.dev');
  assert.deepEqual(body.to, [env.EMAIL_TO]);
  assert.equal(result.emailId, emailId);
  assert.equal(result.status, 'accepted');
  assert.equal(result.receivedInInbox, 'unverified');
  assert.ok(!JSON.stringify(result).includes(env.EMAIL_TO));
  assert.ok(!JSON.stringify(result).includes(env.EMAIL_API_KEY));
});

test('manual retries use the same idempotency key and another recipient uses a different key', async () => {
  const keys = [];
  const fetchImpl = async (_url, options) => {
    keys.push(options.headers['Idempotency-Key']);
    return new globalThis.Response(JSON.stringify({ id: emailId }));
  };
  await runEmailSmoke({ args: ['--send'], env, fetchImpl });
  await runEmailSmoke({ args: ['--send'], env, fetchImpl });
  await runEmailSmoke({
    args: ['--send'],
    env: { ...env, EMAIL_TO: 'other@example.com' },
    fetchImpl,
  });
  assert.equal(keys[0], keys[1]);
  assert.notEqual(keys[1], keys[2]);
});

test('provider rejection does not echo its response body or retry automatically', async () => {
  let calls = 0;
  await assert.rejects(
    runEmailSmoke({
      args: ['--send'],
      env,
      fetchImpl: async () => {
        calls++;
        return new globalThis.Response(`${env.EMAIL_API_KEY} ${env.EMAIL_TO}`, { status: 403 });
      },
    }),
    { message: 'Resend rejected the request (HTTP 403); check its dashboard' },
  );
  assert.equal(calls, 1);
});

test('transport failures discard raw error details and do not retry', async () => {
  let calls = 0;
  await assert.rejects(
    runEmailSmoke({
      args: ['--send'],
      env,
      fetchImpl: async () => {
        calls++;
        throw new Error(env.EMAIL_API_KEY);
      },
    }),
    { message: 'Resend request failed or timed out; check the dashboard before retrying' },
  );
  assert.equal(calls, 1);
});

test('invalid JSON or missing email IDs cannot be recorded as accepted', async () => {
  for (const body of ['not-json', '{}', 'null', JSON.stringify({ id: env.EMAIL_TO })]) {
    await assert.rejects(
      runEmailSmoke({
        args: ['--send'],
        env,
        fetchImpl: async () => new globalThis.Response(body),
      }),
      /invalid JSON|missing a valid email ID/,
    );
  }
});
