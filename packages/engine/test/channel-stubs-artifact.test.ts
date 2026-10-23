import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

const built = new URL('../dist/index.js', import.meta.url).href;

describe('built notification channel exports', () => {
  it('previews webhook dry-run and refuses telegram without credential, network or logging side effects', () => {
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
      const {
        WebhookChannel,
        TelegramChannel,
        ChannelNotImplementedError,
      } = await import(${JSON.stringify(built)});

      const webhook = new WebhookChannel({ url: 'https://example.invalid/evergreen-hook' });
      assert.equal(webhook.name, 'webhook');
      const preview = await webhook.deliver(
        { severity: 'info', subject: 'Fixture', body: 'Fixture body' },
        'artifact-event',
      );
      assert.equal(preview.status, 'preview');
      assert.equal(preview.submitted, false);
      assert.equal(requests, 0);

      const record = new Proxy({}, { get() { throw new Error('Record must not be read'); } });
      const telegram = new TelegramChannel();
      assert.equal(telegram.name, 'telegram');
      await assert.rejects(telegram.notify(record), error => {
        assert.ok(error instanceof ChannelNotImplementedError);
        assert.equal(error.code, 'CHANNEL_NOT_IMPLEMENTED');
        assert.equal(error.channel, 'telegram');
        assert.match(error.message, /SOW 2/);
        return true;
      });
      assert.equal(requests, 0);
      console.log(JSON.stringify({ webhook: preview.status, telegram: 'CHANNEL_NOT_IMPLEMENTED', requests }));
    `;
    const output = execFileSync(process.execPath, ['--input-type=module', '-e', program], {
      encoding: 'utf8',
      timeout: 15000,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { PATH: process.env.PATH, NO_COLOR: '1' },
    });
    expect(JSON.parse(output)).toEqual({
      webhook: 'preview',
      telegram: 'CHANNEL_NOT_IMPLEMENTED',
      requests: 0,
    });
  });
});
