import { describe, expect, it, vi } from 'vitest';
import { EmailChannel, previewBumpNotification } from '../src/email-channel.js';
import { success, submitted, failed, simulated, emailId } from './email-fixtures.js';

function setup(mode?: 'send' | 'dry-run') {
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: emailId })));
  const readApiKey = vi.fn(() => 'test-only-placeholder');
  const options = {
    from: 'sender@example.com',
    to: 'recipient@example.com',
    readApiKey,
    fetchImpl,
    ...(mode ? { mode } : {}),
  };
  return { options, channel: new EmailChannel(options), fetchImpl, readApiKey };
}
describe('EmailChannel', () => {
  it('previews by default without API key or network and redacts private addresses', async () => {
    const s = setup();
    const r = await s.channel.deliver(previewBumpNotification(success)!, 'event-1');
    expect(r).toMatchObject({ status: 'preview', submitted: false });
    expect(JSON.stringify(r)).not.toContain('sender@example.com');
    expect(JSON.stringify(r)).not.toContain('recipient@example.com');
    expect(s.readApiKey).not.toHaveBeenCalled();
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });
  it('routes actual record variants without inventing a successful bump', async () => {
    const s = setup('send');
    expect(previewBumpNotification(submitted)?.subject).toContain('UNCONFIRMED');
    expect(previewBumpNotification(failed)?.body).toContain('could not be verified');
    expect(previewBumpNotification(success)?.body).toContain('CONFIRMED');
    expect(previewBumpNotification(simulated)).toBeUndefined();
    await s.channel.notify(simulated);
    expect(s.fetchImpl).not.toHaveBeenCalled();
    expect(s.readApiKey).not.toHaveBeenCalled();
  });
  it('sends one exact request and reports acceptance separately from inbox receipt', async () => {
    const s = setup('send');
    const message = previewBumpNotification(success)!;
    expect(await s.channel.deliver(message, 'event-1')).toMatchObject({
      status: 'accepted',
      emailId,
      receivedInInbox: 'unverified',
    });
    const [url, options] = s.fetchImpl.mock.calls[0]!;
    expect(url).toBe('https://api.resend.com/emails');
    expect(options?.redirect).toBe('error');
    expect(JSON.parse(options!.body as string)).toEqual({
      from: s.options.from,
      to: [s.options.to],
      subject: message.subject,
      text: message.body,
    });
    expect(new Headers(options?.headers).get('Authorization')).toBe('Bearer test-only-placeholder');
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('reuses a key only for the same event and exact payload', async () => {
    const s = setup('send'),
      n = previewBumpNotification(success)!;
    await s.channel.deliver(n, 'event');
    await s.channel.deliver(n, 'event');
    await s.channel.deliver(n, 'different');
    await s.channel.deliver({ ...n, subject: 'Changed' }, 'event');
    const keys = s.fetchImpl.mock.calls.map(([, o]) =>
      new Headers(o?.headers).get('Idempotency-Key'),
    );
    expect(keys[0]).toBe(keys[1]);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).not.toContain(s.options.to);
  });
  it.each([401, 429, 500, 503])(
    'surfaces HTTP %s without retry, leaking provider body, or changing the record',
    async (status) => {
      const s = setup('send');
      const original = JSON.stringify(failed);
      s.fetchImpl.mockResolvedValue(new Response('private provider body', { status }));
      await expect(s.channel.notify(failed)).rejects.toMatchObject({
        code: 'EMAIL_REJECTED',
        classification: status >= 500 ? 'unknown' : 'rejected',
      });
      expect(s.fetchImpl).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(failed)).toBe(original);
    },
  );
  it.each(['not json', '{}', '{"id":"bad"}'])(
    'keeps ambiguous acceptance unknown for %s',
    async (body) => {
      const s = setup('send');
      s.fetchImpl.mockResolvedValue(new Response(body));
      await expect(s.channel.notify(success)).rejects.toMatchObject({ classification: 'unknown' });
      expect(s.fetchImpl).toHaveBeenCalledTimes(1);
    },
  );
  it('sanitizes network/redirect and secret-provider errors', async () => {
    const s = setup('send');
    s.fetchImpl.mockRejectedValue(new Error('private token and address'));
    await expect(s.channel.notify(success)).rejects.toThrow(
      'Email request or response could not be verified',
    );
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
    const t = setup('send');
    t.readApiKey.mockImplementation(() => {
      throw new Error('private token');
    });
    await expect(t.channel.notify(success)).rejects.toMatchObject({ code: 'EMAIL_CONFIG' });
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
        code: 'EMAIL_TIMEOUT',
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
  it.each(['', 'bad', 'one@example.com,two@example.com', 'a@example.com\nb@example.com'])(
    'rejects invalid private addresses %j',
    async (to) => {
      const s = setup('send');
      expect(() => new EmailChannel({ ...s.options, to })).toThrow('plain email address');
      expect(s.fetchImpl).not.toHaveBeenCalled();
    },
  );
});

describe('EmailChannel review boundaries', () => {
  it('validates the sender independently of recipient validation', () => {
    const s = setup('send');
    expect(() => new EmailChannel({ ...s.options, from: 'bad\naddress@example.com' })).toThrow(
      /plain email address/,
    );
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });
  it.each(['', '   ', 'token with space'])(
    'refuses invalid API key %# before any request',
    async (key) => {
      const s = setup('send');
      s.readApiKey.mockReturnValue(key);
      await expect(s.channel.notify(success)).rejects.toMatchObject({
        code: 'EMAIL_CONFIG',
        classification: 'rejected',
      });
      expect(s.fetchImpl).not.toHaveBeenCalled();
    },
  );
  it('does not reuse an idempotency key across private recipients', async () => {
    const s = setup('send'),
      other = new EmailChannel({ ...s.options, to: 'different@example.com' });
    const message = previewBumpNotification(success)!;
    await s.channel.deliver(message, 'same-event');
    await other.deliver(message, 'same-event');
    expect(new Headers(s.fetchImpl.mock.calls[0]![1]!.headers).get('Idempotency-Key')).not.toBe(
      new Headers(s.fetchImpl.mock.calls[1]![1]!.headers).get('Idempotency-Key'),
    );
  });
});
