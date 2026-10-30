/** PH2-E4-05 F10 operator monitor. No network: global fetch throws. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { lookbackTicks, runTestnetResetCheck, type AlertTransport } from '../src/index.js';

const OP = 'operator@alerts.example.test';
const tick = (tickedAt: number, l: number) => ({ tickedAt, observedLedger: BigInt(l) });
const DROP = [tick(1, 100), tick(2, 10)];
const FLAT = [tick(1, 100), tick(2, 100), tick(3, 105)];

function fake(): AlertTransport & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    deliver(_n, e) {
      calls.push(e);
      return Promise.resolve({ status: 200 });
    },
  };
}
const deps = (ticks: ReturnType<typeof tick>[], t: AlertTransport) => ({
  recentTicks: () => Promise.resolve(ticks),
  transportFor: () => t,
});
const ON = { ALERTS_SEND: 'send', ALERTS_ALLOWLIST: OP, TESTNET_RESET_LOOKBACK_TICKS: '12' };

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('runTestnetResetCheck', () => {
  it.each([[undefined], [''], ['1'], ['0'], ['x'], ['12 ']])('lookback %j means no check', (v) => {
    expect(lookbackTicks(v)).toBeUndefined();
  });

  it('guard: ALERTS_SEND off never sends on a drop', async () => {
    const t = fake();
    const out = await runTestnetResetCheck({ ...ON, ALERTS_SEND: undefined }, deps(DROP, t));
    expect(out).toEqual({ action: 'dry-run', reason: 'alerts_send_off', decreases: 1 });
    expect(t.calls).toEqual([]);
  });

  it('guard: no operator on the allowlist never sends', async () => {
    const t = fake();
    const out = await runTestnetResetCheck({ ...ON, ALERTS_ALLOWLIST: '' }, deps(DROP, t));
    expect(out).toMatchObject({ action: 'dry-run', reason: 'no_operator' });
    expect(t.calls).toEqual([]);
  });

  it('guard: an equal or rising ledger sends nothing', async () => {
    const t = fake();
    expect(await runTestnetResetCheck(ON, deps(FLAT, t))).toEqual({
      action: 'none',
      reason: 'no_decrease',
    });
    expect(t.calls).toEqual([]);
  });

  it('a drop alerts each operator with one stable event id', async () => {
    const t = fake();
    expect(await runTestnetResetCheck(ON, deps(DROP, t))).toEqual({
      action: 'sent',
      recipients: 1,
      decreases: 1,
    });
    expect(t.calls).toEqual(['f10-ledger-decrease:100->10']);
  });

  it('a failed read is reported, not treated as healthy', async () => {
    const t = fake();
    const out = await runTestnetResetCheck(ON, {
      recentTicks: () => Promise.reject(new Error('permission denied')),
      transportFor: () => t,
    });
    expect(out).toEqual({ action: 'read_failed' });
  });
});
