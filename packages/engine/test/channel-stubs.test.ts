import { describe, expect, it, vi } from 'vitest';
import type { BumpRecord, NotificationChannel } from '@evergreen-stellar/shared-types';
import {
  ChannelNotImplementedError,
  TelegramChannel,
  WebhookChannel,
} from '../src/channel-stubs.js';

const record: BumpRecord = Object.freeze({
  entryKey: 'fixture-entry',
  contracts: Object.freeze(['fixture-contract']),
  payer: 'fixture-payer',
  reason: 'private-record-content',
  extendToLedgers: 1000,
  recordedAt: '2026-09-14T00:00:00.000Z',
  before: Object.freeze({ observedAtLedger: 1000, endsAtLedger: 1050 }),
  mode: 'dry-run',
  outcome: 'simulated',
});

describe.each([
  { name: 'webhook', Channel: WebhookChannel },
  { name: 'telegram', Channel: TelegramChannel },
])('$name unavailable channel', ({ name, Channel }) => {
  it('satisfies the interface and rejects explicitly instead of reporting success', async () => {
    const channel: NotificationChannel = new Channel();
    expect(channel.name).toBe(name);
    const before = JSON.stringify(record);
    const result = channel.notify(record);
    expect(result).toBeInstanceOf(Promise);
    await expect(result).rejects.toBeInstanceOf(ChannelNotImplementedError);
    await expect(result).rejects.toMatchObject({
      code: 'CHANNEL_NOT_IMPLEMENTED',
      channel: name,
      message: expect.stringContaining('SOW 2'),
    });
    expect(JSON.stringify(record)).toBe(before);
  });
  it('never reads the record, sends requests or logs its contents', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network forbidden'));
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const inaccessible = new Proxy(record, {
        get() {
          throw new Error('Record must not be read');
        },
      });
      await expect(new Channel().notify(inaccessible)).rejects.toMatchObject({
        code: 'CHANNEL_NOT_IMPLEMENTED',
        channel: name,
      });
      const error = await new Channel().notify(record).catch((e: unknown) => e);
      expect(String(error)).not.toContain('private-record-content');
      expect(fetch).not.toHaveBeenCalled();
      expect(log).not.toHaveBeenCalled();
      expect(errorLog).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
      log.mockRestore();
      errorLog.mockRestore();
    }
  });
});
