import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const built = new URL('../dist/index.js', import.meta.url).href;

describe('built notification stub exports', () => {
  it('rejects both public calls without record, credential, network or logging side effects', () => {
    const program = `
      import assert from 'node:assert/strict';
      let requests = 0;
      globalThis.fetch = async () => { requests++; throw new Error('No network allowed'); };
      process.env = new Proxy(process.env, {
        get(target, key) {
          if (/^(EMAIL_|EVERGREEN_(SIGNER|DEV|ALERT)|TELEGRAM_|WEBHOOK_)/.test(String(key)))
            throw new Error('Credential configuration must not be read');
          return Reflect.get(target, key);
        },
      });
      const { WebhookChannel, TelegramChannel, ChannelNotImplementedError } = await import(${JSON.stringify(built)});
      const record = new Proxy({}, { get() { throw new Error('Record must not be read'); } });
      const results = [];
      for (const [Channel, name] of [[WebhookChannel, 'webhook'], [TelegramChannel, 'telegram']]) {
        const channel = new Channel();
        assert.equal(channel.name, name);
        const result = channel.notify(record);
        assert.ok(result instanceof Promise);
        await assert.rejects(result, error => {
          assert.ok(error instanceof ChannelNotImplementedError);
          assert.equal(error.code, 'CHANNEL_NOT_IMPLEMENTED');
          assert.equal(error.channel, name);
          assert.match(error.message, /SOW 2/);
          results.push({ channel: name, code: error.code });
          return true;
        });
      }
      assert.equal(requests, 0);
      console.log(JSON.stringify({ results, requests }));
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', program], {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, NO_COLOR: '1' },
    });
    expect(JSON.parse(output)).toEqual({
      results: [
        { channel: 'webhook', code: 'CHANNEL_NOT_IMPLEMENTED' },
        { channel: 'telegram', code: 'CHANNEL_NOT_IMPLEMENTED' },
      ],
      requests: 0,
    });
  });
});
