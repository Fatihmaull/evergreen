import { describe, expect, it } from 'vitest';
import {
  TESTNET_TREASURY_ADDRESS,
  planSweep,
  runSweep,
  type SweepInput,
} from '../src/float-sweep.js';

const base: SweepInput = {
  network: 'testnet',
  mode: 'dry-run',
  balanceStroops: 200n,
  inFlightPullsStroops: 100n,
  sweepBufferStroops: 50n,
};

describe('planSweep', () => {
  it('keeps the in-flight pulls and the buffer, and does not submit in dry-run', () => {
    const plan = planSweep(base);
    expect(plan.amountStroops).toBe(50n);
    expect(plan.keptForRefundsStroops).toBe(100n);
    expect(plan.destination).toBe(TESTNET_TREASURY_ADDRESS);
    expect(plan.submit).toBe(false);
    expect(plan.reason).toBe('above-cap');
    expect(TESTNET_TREASURY_ADDRESS).toMatch(/^G[A-Z2-7]{55}$/);
  });

  it('does not sweep at the cap, below headroom, or without a buffer', () => {
    expect(planSweep({ ...base, balanceStroops: 150n }).reason).toBe('at-cap');
    expect(planSweep({ ...base, balanceStroops: 90n })).toMatchObject({
      reason: 'below-headroom',
      amountStroops: 0n,
      destination: undefined,
    });
    expect(planSweep({ ...base, sweepBufferStroops: undefined })).toMatchObject({
      reason: 'buffer-unset',
      aboveCap: undefined,
      amountStroops: 0n,
      submit: false,
    });
    expect(planSweep({ ...base, balanceStroops: undefined }).reason).toBe('balance-unknown');
  });

  it('refuses mainnet even when live, and names no address', () => {
    const plan = planSweep({
      ...base,
      network: 'mainnet',
      mode: 'live',
      balanceStroops: 10_000_000n,
    });
    expect(plan.reason).toBe('mainnet-treasury-unset');
    expect(plan.destination).toBeUndefined();
    expect(plan.submit).toBe(false);
    const text = Object.values(plan).filter((value) => typeof value === 'string');
    expect(text.some((value) => value.startsWith('G'))).toBe(false);
  });
});

describe('runSweep', () => {
  it('does not call send in dry-run', async () => {
    let calls = 0;
    const result = await runSweep(base, () => {
      calls += 1;
      return Promise.resolve({ hash: 'nope' });
    });
    expect(calls).toBe(0);
    expect(result.submitted).toBe(false);
  });

  it('sends once, to the testnet treasury, only the excess', async () => {
    const seen: { destination: string; amount: bigint }[] = [];
    const result = await runSweep({ ...base, mode: 'live' }, (destination, amount) => {
      seen.push({ destination, amount });
      return Promise.resolve({ hash: 'sweep-tx' });
    });
    expect(seen).toEqual([{ destination: TESTNET_TREASURY_ADDRESS, amount: 50n }]);
    expect(result).toMatchObject({ submitted: true, hash: 'sweep-tx' });
  });

  it('does not send when the buffer is unset, the network is mainnet, or send throws', async () => {
    let calls = 0;
    const send = () => {
      calls += 1;
      return Promise.resolve({ hash: 'x' });
    };
    await runSweep({ ...base, mode: 'live', sweepBufferStroops: undefined }, send);
    await runSweep({ ...base, mode: 'live', network: 'mainnet' }, send);
    expect(calls).toBe(0);
    const failed = await runSweep({ ...base, mode: 'live' }, () =>
      Promise.reject(new Error('rpc')),
    );
    expect(failed).toMatchObject({ submitted: false, code: 'SWEEP_FAILED' });
  });
});
