import { describe, expect, it, vi } from 'vitest';
import { previewBumpNotification } from '../src/email-channel.js';
import { TELEGRAM_TEXT_LIMIT, TelegramChannel, telegramText } from '../src/telegram-channel.js';
import { success, submitted, failed, simulated } from './email-fixtures.js';

const chatId = '-1001234567890';
const token = '123456:test-only-telegram-token';
const okBody = () => new Response(JSON.stringify({ ok: true, result: {} }), { status: 200 });

function setup(
  mode?: 'send' | 'dry-run',
  extras: { chatId?: string; readBotToken?: () => string } = {},
) {
  const fetchImpl = vi.fn<typeof fetch>(async () => okBody());
  const readBotToken = extras.readBotToken ?? vi.fn(() => token);
  const options = {
    chatId: extras.chatId ?? chatId,
    fetchImpl,
    readBotToken,
    ...(mode ? { mode } : {}),
  };
  return { options, channel: new TelegramChannel(options), fetchImpl, readBotToken };
}

describe('TelegramChannel', () => {
  it('previews by default without network, token, or echoing the chat id', async () => {
    const s = setup();
    const r = await s.channel.deliver(previewBumpNotification(success)!, 'event-1');
    expect(r).toMatchObject({ status: 'preview', submitted: false });
    expect(JSON.stringify(r)).not.toContain(chatId);
    expect(s.readBotToken).not.toHaveBeenCalled();
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('skips simulated records and does not invent success', async () => {
    const s = setup('send');
    expect(previewBumpNotification(submitted)?.subject).toContain('UNCONFIRMED');
    await s.channel.notify(simulated);
    expect(s.fetchImpl).not.toHaveBeenCalled();
    expect(s.readBotToken).not.toHaveBeenCalled();
  });

  it('posts plain-text sendMessage and reports acceptance, not receipt', async () => {
    const s = setup('send');
    const message = previewBumpNotification(success)!;
    expect(await s.channel.deliver(message, 'event-1')).toEqual({
      status: 'accepted',
      submitted: true,
      httpStatus: 200,
      receivedByChat: 'unverified',
    });
    const [url, options] = s.fetchImpl.mock.calls[0]!;
    expect(url).toBe(`https://api.telegram.org/bot${token}/sendMessage`);
    expect(options?.method).toBe('POST');
    expect(options?.redirect).toBe('error');
    expect(new Headers(options?.headers).get('Content-Type')).toBe('application/json');
    const body = JSON.parse(options!.body as string);
    expect(body).toEqual({
      chat_id: chatId,
      text: `${message.subject}\n\n${message.body}`,
      disable_web_page_preview: true,
    });
    expect(body).not.toHaveProperty('parse_mode');
    expect(options!.body as string).not.toContain(token);
    expect(s.readBotToken).toHaveBeenCalledTimes(1);
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('truncates text to the Bot API limit with a fixed suffix', () => {
    const long = telegramText({ severity: 'info', subject: 'S', body: 'x'.repeat(5000) });
    expect(long).toHaveLength(TELEGRAM_TEXT_LIMIT);
    expect(long.endsWith('…(truncated)')).toBe(true);
    const short = telegramText({ severity: 'info', subject: 'S', body: 'b' });
    expect(short).toBe('S\n\nb');
  });

  it.each([
    ['ok false', JSON.stringify({ ok: false, description: 'private description' })],
    ['not json', 'private provider body'],
    ['empty', ''],
  ])('treats a 200 with %s as unverified, without leaking the body', async (_, text) => {
    const s = setup('send');
    s.fetchImpl.mockResolvedValue(new Response(text, { status: 200 }));
    const err = await s.channel.notify(success).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'TELEGRAM_UNVERIFIED', classification: 'unknown' });
    expect(String(err)).not.toContain('private');
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([400, 401, 403, 429, 500, 502])(
    'surfaces HTTP %s without retry, leaking provider body, token or chat id',
    async (status) => {
      const s = setup('send');
      const original = JSON.stringify(failed);
      s.fetchImpl.mockResolvedValue(
        new Response(JSON.stringify({ ok: false, description: `private ${chatId}` }), { status }),
      );
      const err = await s.channel.notify(failed).catch((e: unknown) => e);
      expect(err).toMatchObject({
        code: 'TELEGRAM_REJECTED',
        classification: status >= 500 ? 'unknown' : 'rejected',
      });
      for (const secret of ['private', chatId, token]) expect(String(err)).not.toContain(secret);
      expect(s.fetchImpl).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(failed)).toBe(original);
    },
  );

  it('sanitizes network errors that could carry the token-bearing URL', async () => {
    const s = setup('send');
    s.fetchImpl.mockRejectedValue(new Error(`fetch failed for /bot${token}/sendMessage`));
    const err = await s.channel.notify(success).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'TELEGRAM_UNVERIFIED' });
    expect(String(err)).not.toContain(token);
    expect(s.fetchImpl).toHaveBeenCalledTimes(1);
  });

  it.each([
    [
      'throws',
      () => {
        throw new Error(`private ${token}`);
      },
    ],
    ['empty', () => ''],
    ['has slash', () => '123/../evil'],
    ['has space', () => '123 456'],
    ['undefined', () => undefined as unknown as string],
  ])('refuses a bot token that %s before any request', async (_, readBotToken) => {
    const s = setup('send', { readBotToken: vi.fn(readBotToken) });
    const err = await s.channel.notify(success).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'TELEGRAM_CONFIG', classification: 'rejected' });
    expect(String(err)).not.toContain(token);
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });

  it('refuses send with no token reader at all', async () => {
    const fetchImpl = vi.fn<typeof fetch>();
    const channel = new TelegramChannel({ chatId, mode: 'send', fetchImpl });
    await expect(channel.notify(success)).rejects.toMatchObject({ code: 'TELEGRAM_CONFIG' });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it.each(['fetch', 'body'])('bounds a stalled %s, aborts and never retries', async (stage) => {
    vi.useFakeTimers();
    try {
      const s = setup('send');
      if (stage === 'fetch') s.fetchImpl.mockImplementation(() => new Promise(() => {}));
      else s.fetchImpl.mockResolvedValue(new Response(new ReadableStream({ start() {} })));
      const promise = s.channel.notify(success);
      const assertion = expect(promise).rejects.toMatchObject({
        code: 'TELEGRAM_TIMEOUT',
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

  it.each(['', ' ', '-100 123', '@chan\nnel', 'x'.repeat(257)])(
    'rejects invalid chat id %j at construction',
    (bad) => {
      const fetchImpl = vi.fn<typeof fetch>();
      expect(() => new TelegramChannel({ chatId: bad, mode: 'send', fetchImpl })).toThrow(
        'Configure one Telegram chat id.',
      );
    },
  );

  it('rejects an unknown mode and invalid messages', async () => {
    expect(() => new TelegramChannel({ chatId, mode: 'live' as unknown as 'send' })).toThrow(
      'Invalid Telegram mode.',
    );
    const s = setup('send');
    await expect(
      s.channel.deliver({ severity: 'info', subject: 'a\nb', body: 'x' }, 'e'),
    ).rejects.toMatchObject({ code: 'TELEGRAM_CONFIG' });
    await expect(s.channel.deliver(previewBumpNotification(success)!, ' ')).rejects.toMatchObject({
      code: 'TELEGRAM_CONFIG',
    });
    expect(s.fetchImpl).not.toHaveBeenCalled();
  });
});
