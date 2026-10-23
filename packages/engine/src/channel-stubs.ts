import type { BumpRecord, NotificationChannel } from '@evergreen-stellar/shared-types';

/** Telegram remains an unavailable extension point until a later PH2-BL-02 slice. */
export class ChannelNotImplementedError extends Error {
  readonly code = 'CHANNEL_NOT_IMPLEMENTED';

  constructor(readonly channel: 'telegram') {
    super(`${channel} delivery is not implemented; actual delivery is SOW 2 scope.`);
    this.name = 'ChannelNotImplementedError';
  }
}

export class TelegramChannel implements NotificationChannel {
  readonly name = 'telegram';

  async notify(record: BumpRecord): Promise<void> {
    void record;
    throw new ChannelNotImplementedError('telegram');
  }
}
