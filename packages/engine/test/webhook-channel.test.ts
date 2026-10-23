import { createHmac } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';
import { previewBumpNotification } from '../src/email-channel.js';
import { WebhookChannel } from '../src/webhook-channel.js';
import { success, submitted, failed, simulated } from './email-fixtures.js';

const hookUrl = 'https://example.invalid/evergreen-hook';

function setup(mode?: 'send' | 'dry-run', extras: { url?: string; readSecret?: () => string | undefined } = {}) {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(null, { status: 204 }));
  const readSecret = extras.readSecret ?? vi.fn(() => undefined);
  const options = {
    url: extras.url ?? hookUrl,
    fetchImpl,
    readSecret,
    ...(mode ? { mode } : {}),
  };
  return { options, channel: new WebhookChannel(options), fetchImpl, readSecret };
}

describe('WebhookChannel', () => {
  it('previews by default without network, secret, or echoing the destination URL', async () => {
    const s = setup();
    const r = await s.channel.deliver(previewBumpNotification(success)!, 'event-1');
    expect(r).toMatchObject({ status: 'preview', submitted: false });
    expect(JSON.stringify(r)).not.toContain(hookUrl);
    expect(s.readSecret).not.toHaveBeenCalled();
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('skips simulated records and does not invent success', async () => {
    const s = setup('send');
    expect(previewBumpNotification(submitted)?.subject).toContain('UNCONFIRMED');
    expect(previewBumpNotification(failed)?.body).toContain('could not be verified');
    expect(previewBumpNotification(success)?.body).toContain('CONFIRMED');
    expect(previewBumpNotification(simulated)).toBeUndefined();
    await s.channel.notify(simulated);
    expect(s.fetchImpl).not.toHaveBeenCalled();
    expect(s.readSecret).not.toHaveBeenCalled();
  });

  it('sends a plain HTTPS POST when the secret is unset', async () => {
    const s = setup('send');
    const message = previewBumpNotification(success)!;
    expect(await s.channel.deliver(message, 'event-1')).toMatchObject({
      status: 'accepted',
      submitted: true,
      httpStatus: 204,
      receivedByEndpoint: 'unverified',
    });
    const [url, options] = s.fetchImpl.mock.calls[0]!;
    expect(url).toBe(hookUrl);
    expect(options?.method).toBe('POST');
    expect(options?.redirect).toBe('error');
    expect(JSON.parse(options!.body as string)).toEqual({
      subject: message.subject,
      body: message.body,
      severity: message.severity,
    });
    const headers = new Headers(options?.headers);
    expect(headers.get('Content-Type')).toBe('application/json');
    expect(headers.get('Idempotency-Key')).toMatch(/^evergreen-webhook-[0-9a-f]{64}$/);
    expect(headers.get('X-Evergreen-Signature')).toBeNull();
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('HMAC-signs the body when WEBHOOK_SECRET-style readSecret returns a value', async () => {
    const secret = 'test-only-webhook-secret';
    const s = setup('send', { readSecret: vi.fn(() => secret) });
    const message = previewBumpNotification(success)!;
    await s.channel.deliver(message, 'event-1');
    const [, options] = s.fetchImpl.mock.calls[0]!;
    const body = options!.body as string;
    const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    expect(new Headers(options?.headers).get('X-Evergreen-Signature')).toBe(expected);
    expect(JSON.stringify(options?.headers)).not.toContain(secret);
    expect(s.readSecret).toHaveBeenCalledTimes(1);
  });

  it('reuses a key only for the same event, payload and destination', async () => {
    const s = setup('send');
    const n = previewBumpNotification(success)!;
    await s.channel.deliver(n, 'event');
    await s.channel.deliver(n, 'event');
    await s.channel.deliver(n, 'different');
    await s.channel.deliver({ ...n, subject: 'Changed' }, 'event');
    const other = new WebhookChannel({
      ...s.options,
      url: 'https://example.invalid/other-hook',
    });
    await other.deliver(n, 'event');
    const keys = s.fetchImpl.mock.calls.map(([, o]) =>
      new Headers(o?.headers).get('Idempotency-Key'),
    );
    expect(keys[0]).toBe(keys[1]);
    expect(new Set(keys).size).toBe(4);
    expect(keys[0]).not.toContain('example.invalid');
  });

  it.each([401, 429, 500, 503])(
    'surfaces HTTP %s without retry, leaking provider body, or changing the record',
    async (status) => {
      const s = setup('send');
      const original = JSON.stringify(failed);
      s.fetchImpl.mockResolvedValue(new Response('private provider body', { status }));
      const err = await s.channel.notify(failed).catch((e: unknown) => e);
      expect(err).toMatchObject({
        code: 'WEBHOOK_REJECTED',
        classification: status >= 500 ? 'unknown' : 'rejected',
      });
      expect(String(err)).not.toContain('private provider body');
      expect(s.fetchImpl).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(failed)).toBe(original);
    },
  );

  it('sanitizes network and secret-provider errors', async () => {
    const s = setup('send');
    s.fetchImpl.mockRejectedValue(new Error('private token and address'));
    await expect(s.channel.notify(success)).rejects.toThrow(
      'Webhook request or response could not be verified',
    );
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
    const t = setup('send', {
      readSecret: vi.fn(() => {
        throw new Error('private secret');
      }),
    });
    await expect(t.channel.notify(success)).rejects.toMatchObject({ code: 'WEBHOOK_CONFIG' });
    expect(t.fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['fetch', 'body'])('bounds a stalled %s, aborts and never retries', async (stage) => {
    vi.useFakeTimers();
    try {
      const s = setup('send');
      if (stage === 'fetch') s.fetchImpl.mockImplementation(() => new Promise(() => {}));
      else s.fetchImpl.mockResolvedValue(new Response(new ReadableStream({ start() {} })));
      const promise = s.channel.notify(success);
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'WEBHOOK_TIMEOUT',
        classification: 'unknown',
      });
      await vi.advanceTimersByTimeAsync(10000);
      await assertion;
      expect(s.fetchImpl).toHaveBeenCalledTimes(1);
      expect(s.fetchImpl.mock.calls[0]![1]!.signal?.aborted).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    '',
    'not-a-url',
    'http://example.invalid/insecure',
    'https://user:secret@example.invalid/hook',
    'https://example.invalid/hook\nhttps://evil.example/',
  ])('rejects invalid webhook URL %j before any request', (url) => {
    const fetchImpl = vi.fn<typeof fetch>();
    expect(() => new WebhookChannel({ url, mode: 'send', fetchImpl })).toThrow(
      /webhook URL|credentials/,
    );
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['secret with space', 'has\nnewline'])(
    'refuses invalid webhook secret %j before any request',
    async (secret) => {
      const s = setup('send', { readSecret: vi.fn(() => secret) });
      await expect(s.channel.notify(success)).rejects.toMatchObject({
        code: 'WEBHOOK_CONFIG',
        classification: 'rejected',
      });
      expect(s.fetchImpl).not.toHaveBeenCalled();
    },
  );
});
