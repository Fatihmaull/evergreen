import { describe, expect, it } from 'vitest';
import {
  consecutiveFailedTicks,
  RPC_FAILED_TICKS_ALERT,
  RPC_SLOW_MAX_MS,
  RPC_SLOW_TOTAL_MS,
  rpcSlowReasons,
} from '../src/rpc-health.js';

// The 8 preview ticks the provisional thresholds come from (2026-10-30 13:05–13:40 WIB).
const MS = [419, 277, 94, 80, 39, 473, 57, 611];
const MAX = [368, 156, 59, 40, 25, 395, 40, 310];

describe('F9 provisional thresholds', () => {
  it('derive as 5 x observed max rounded up to 500 ms', () => {
    expect(RPC_SLOW_MAX_MS).toBe(Math.ceil((5 * Math.max(...MAX)) / 500) * 500);
    expect(RPC_SLOW_TOTAL_MS).toBe(Math.ceil((5 * Math.max(...MS)) / 500) * 500);
    expect(RPC_FAILED_TICKS_ALERT).toBe(3);
  });

  it('flags none of the observed ticks', () => {
    MS.forEach((rpcMs, i) =>
      expect(rpcSlowReasons({ rpcMs, rpcBatches: 2, rpcMaxMs: MAX[i]! })).toEqual([]),
    );
  });

  it('flags at the boundaries, by reason', () => {
    expect(rpcSlowReasons({ rpcMs: 2000, rpcBatches: 2, rpcMaxMs: 2000 })).toEqual(['max']);
    expect(rpcSlowReasons({ rpcMs: 3500, rpcBatches: 2, rpcMaxMs: 1999 })).toEqual(['total']);
    expect(rpcSlowReasons({ rpcMs: 3499, rpcBatches: 2, rpcMaxMs: 1999 })).toEqual([]);
    expect(rpcSlowReasons({ rpcMs: 0, rpcBatches: 0, rpcMaxMs: 0 })).toEqual([]);
  });
});

describe('consecutiveFailedTicks', () => {
  it('counts only the trailing run', () => {
    expect(consecutiveFailedTicks([])).toEqual({ count: 0, alert: false });
    expect(consecutiveFailedTicks([true, true, false])).toEqual({ count: 0, alert: false });
    expect(consecutiveFailedTicks([false, true, true])).toEqual({ count: 2, alert: false });
    expect(consecutiveFailedTicks([false, true, true, true])).toEqual({ count: 3, alert: true });
  });
});
