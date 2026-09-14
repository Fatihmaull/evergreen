import type { BumpRecord, NotificationChannel } from '@evergreen-stellar/shared-types';

/** These extension points are not delivery implementations in this release. */
export class ChannelNotImplementedError extends Error {
  readonly code = 'CHANNEL_NOT_IMPLEMENTED';

  constructor(readonly channel: 'webhook' | 'telegram') {
    super(`${channel} delivery is not implemented; actual delivery is SOW 2 scope.`);
    this.name = 'ChannelNotImplementedError';
  }
}

export class WebhookChannel implements NotificationChannel {
  readonly name = 'webhook';

  async notify(record: BumpRecord): Promise<void> {
    void record;
    throw new ChannelNotImplementedError('webhook');
  }
}

export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram';

  async notify(record: BumpRecord): Promise<void> {
    void record;
    throw new ChannelNotImplementedError('telegram');
  }
}
