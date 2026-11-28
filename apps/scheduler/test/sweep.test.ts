import { describe, expect, it } from 'vitest';
import { TESTNET_TREASURY_ADDRESS } from '@evergreen-stellar/core';
import { parseSweepConfig, runSweepTick } from '../src/sweep.js';

describe('parseSweepConfig', () => {
  it('is dry-run with no buffer unless live is asked for', () => {
    expect(parseSweepConfig({})).toEqual({ mode: 'dry-run', sweepBufferStroops: undefined });
    expect(parseSweepConfig({ SWEEP_MODE: 'yes', SWEEP_BUFFER_STROOPS: '10' }).mode).toBe(
      'dry-run',
    );
    expect(parseSweepConfig({ SWEEP_MODE: 'live', SWEEP_BUFFER_STROOPS: 'nope' })).toEqual({
      mode: 'live',
      sweepBufferStroops: undefined,
    });
    expect(parseSweepConfig({ SWEEP_MODE: 'live', SWEEP_BUFFER_STROOPS: '250000' })).toEqual({
      mode: 'live',
      sweepBufferStroops: 250_000n,
    });
  });
});

describe('runSweepTick', () => {
  it('dry-run logs the excess and does not send', async () => {
    let sent = 0;
    const counts = await runSweepTick({
      config: { mode: 'dry-run', sweepBufferStroops: 50n },
      inFlightStroops: 100n,
      balanceStroops: 200n,
      send: () => {
        sent += 1;
        return Promise.resolve({ hash: 'nope' });
      },
    });
    expect(sent).toBe(0);
    expect(counts).toEqual({
      dryRun: true,
      reason: 'above-cap',
      inFlight: '100',
      amount: '50',
      submitted: false,
    });
    expect(JSON.stringify(counts)).not.toContain(TESTNET_TREASURY_ADDRESS);
  });

  it('sends only when live, and only to the testnet treasury', async () => {
    const seen: { destination: string; amount: bigint }[] = [];
    const counts = await runSweepTick({
      config: { mode: 'live', sweepBufferStroops: 50n },
      inFlightStroops: 100n,
      balanceStroops: 200n,
      send: (destination, amount) => {
        seen.push({ destination, amount });
        return Promise.resolve({ hash: 'sweep-tx' });
      },
    });
    expect(seen).toEqual([{ destination: TESTNET_TREASURY_ADDRESS, amount: 50n }]);
    expect(counts.submitted).toBe(true);
    expect(counts.dryRun).toBe(false);
  });

  it('does not send when the buffer or the balance is unknown', async () => {
    let sent = 0;
    const send = () => {
      sent += 1;
      return Promise.resolve({ hash: 'x' });
    };
    const unset = await runSweepTick({
      config: { mode: 'live', sweepBufferStroops: undefined },
      inFlightStroops: 0n,
      balanceStroops: 1_000n,
      send,
    });
    const blind = await runSweepTick({
      config: { mode: 'live', sweepBufferStroops: 1n },
      inFlightStroops: 0n,
      balanceStroops: undefined,
      send,
    });
    expect(sent).toBe(0);
    expect(unset.reason).toBe('buffer-unset');
    expect(blind.reason).toBe('balance-unknown');
    expect(unset.submitted).toBe(false);
  });
});
