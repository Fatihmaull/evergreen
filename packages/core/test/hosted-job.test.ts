import { describe, expect, it } from 'vitest';
import {
  EXTEND_NOW_DAILY_LIMIT,
  ledgerUnexplained,
  preflightHostedJob,
  settleHostedJob,
  type PreflightHostedInput,
} from '../src/hosted-job.js';

const ready: PreflightHostedInput = {
  network: 'testnet',
  kind: 'autopilot',
  simulatedRentStroops: 1_000_000n,
  retryMarginStroops: 10_000n,
  allowanceRemainingStroops: 2_000_000n,
  balanceStroops: 2_000_000n,
  budget: 'ok',
  extendNowUsedToday: 0,
};

describe('preflightHostedJob', () => {
  it('pulls simulated rent plus the estimated fee plus the margin', () => {
    const result = preflightHostedJob(ready);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pull).toEqual({
      rentStroops: 1_000_000n,
      feeStroops: 25_000n,
      marginStroops: 10_000n,
      totalStroops: 1_035_000n,
    });
  });

  it('refuses mainnet, a failed simulation, and an unset margin before any amount exists', () => {
    expect(preflightHostedJob({ ...ready, network: 'mainnet' })).toEqual({
      ok: false,
      reason: 'not-testnet',
    });
    expect(preflightHostedJob({ ...ready, simulatedRentStroops: undefined })).toEqual({
      ok: false,
      reason: 'simulation-failed',
    });
    expect(preflightHostedJob({ ...ready, retryMarginStroops: undefined })).toEqual({
      ok: false,
      reason: 'margin-unset',
    });
  });

  it('stops an extend-now at the daily limit and leaves autopilot uncapped by it', () => {
    expect(
      preflightHostedJob({
        ...ready,
        kind: 'extend-now',
        extendNowUsedToday: EXTEND_NOW_DAILY_LIMIT,
      }),
    ).toEqual({ ok: false, reason: 'daily-limit' });
    expect(preflightHostedJob({ ...ready, kind: 'autopilot', extendNowUsedToday: 100 }).ok).toBe(
      true,
    );
  });

  it('stops when the allowance or the balance cannot cover the pull', () => {
    expect(preflightHostedJob({ ...ready, allowanceRemainingStroops: 1n })).toEqual({
      ok: false,
      reason: 'allowance-short',
    });
    expect(preflightHostedJob({ ...ready, balanceStroops: 1n })).toEqual({
      ok: false,
      reason: 'balance-short',
    });
    expect(preflightHostedJob({ ...ready, budget: 'over-per-job' })).toEqual({
      ok: false,
      reason: 'budget',
    });
  });
});

describe('settleHostedJob', () => {
  const pull = 1_035_000n;

  it('refunds the margin when the charged rent matches the simulation', () => {
    const settled = settleHostedJob({
      pullStroops: pull,
      extendSucceeded: true,
      chargedRentStroops: 1_000_000n,
      networkFees: [{ txHash: 'extend-tx', feeChargedStroops: 8_000n }],
      refundTxHash: 'refund-tx',
    });
    expect(settled.shortfallStroops).toBe(0n);
    expect(settled.refundStroops).toBe(10_000n);
    expect(settled.finalFeeStroops).toBe(25_000n);
    expect(settled.operatorAlert).toBeNull();
    expect(settled.disableAutopilot).toBe(false);
    expect(settled.rows.map((row) => row.kind)).toEqual([
      'network-fee',
      'rent',
      'evergreen-fee',
      'refund',
    ]);
    expect(ledgerUnexplained(pull, settled.rows)).toBe(0n);
  });

  it('records a shortfall and does not invent a second pull or a difference row', () => {
    const settled = settleHostedJob({
      pullStroops: pull,
      extendSucceeded: true,
      chargedRentStroops: 2_000_000n,
      networkFees: [],
      refundTxHash: null,
    });
    expect(settled.status).toBe('extended');
    expect(settled.refundStroops).toBe(0n);
    expect(settled.differenceStroops).toBe(0n);
    expect(settled.shortfallStroops).toBe(2_000_000n + 40_000n - pull);
    expect(settled.operatorAlert).toBe('shortfall-p1');
    expect(settled.disableAutopilot).toBe(false);
    expect(settled.rows.some((row) => row.kind === 'pull' || row.kind === 'difference')).toBe(
      false,
    );
    expect(ledgerUnexplained(pull, settled.rows)).toBe(-settled.shortfallStroops);
  });

  it('refunds the whole pull, fee included, when the extend finally fails', () => {
    const settled = settleHostedJob({
      pullStroops: pull,
      extendSucceeded: false,
      chargedRentStroops: 0n,
      networkFees: [{ txHash: 'extend-tx', feeChargedStroops: 1_315n }],
      refundTxHash: 'refund-tx',
    });
    expect(settled.status).toBe('refunded');
    expect(settled.refundStroops).toBe(pull);
    expect(settled.finalFeeStroops).toBe(0n);
    expect(settled.shortfallStroops).toBe(0n);
    expect(settled.userNotice).toBe('extend_failed_refund');
    expect(settled.rows.some((row) => row.kind === 'evergreen-fee' || row.kind === 'rent')).toBe(
      false,
    );
    expect(ledgerUnexplained(pull, settled.rows)).toBe(0n);
    const evidence = settled.rows.find((row) => row.kind === 'network-fee');
    expect(evidence?.amountStroops).toBe(1_315n);
    expect(
      ledgerUnexplained(
        pull,
        settled.rows.filter((row) => row.kind !== 'network-fee'),
      ),
    ).toBe(ledgerUnexplained(pull, settled.rows));
  });
});
