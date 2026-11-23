import { describe, expect, it } from 'vitest';
import {
  hostedJobCounts,
  runHostedJob,
  runHostedJobs,
  type ConfirmedMove,
  type ExtendMove,
  type HostedChain,
  type HostedJobPorts,
  type HostedJobSnapshot,
  type LedgerWrite,
} from '../src/money-path.js';

const PAYER = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWHF';
const CONTRACT = 'C'.padEnd(56, 'A');

function tx(hash: string, fee = 100n): ConfirmedMove {
  return { hash, feeDeclaredStroops: fee, feeChargedStroops: fee };
}

function chain(extend: (attempt: number) => Promise<ExtendMove>): HostedChain & {
  readonly calls: { pull: number; extend: number; refund: number; simulate: number };
} {
  const calls = { pull: 0, extend: 0, refund: 0, simulate: 0 };
  return {
    calls,
    simulateRent: () => {
      calls.simulate += 1;
      return Promise.resolve(1_000_000n);
    },
    allowanceRemaining: () => Promise.resolve(5_000_000n),
    balance: () => Promise.resolve(5_000_000n),
    pull: () => {
      calls.pull += 1;
      return Promise.resolve(tx('pull-tx'));
    },
    extend: (attempt) => {
      calls.extend += 1;
      return extend(attempt);
    },
    refund: () => {
      calls.refund += 1;
      return Promise.resolve(tx('refund-tx'));
    },
  };
}

function ports(
  over: Partial<HostedJobPorts> & { snapshot?: HostedJobSnapshot; chain: HostedChain },
): HostedJobPorts & { readonly saved: HostedJobSnapshot[]; readonly ledger: LedgerWrite[] } {
  const saved: HostedJobSnapshot[] = [];
  const ledger: LedgerWrite[] = [];
  let current: HostedJobSnapshot = over.snapshot ?? {
    id: 'job-1',
    userId: '00000000-0000-4000-8000-000000000001',
    network: 'testnet',
    contractId: CONTRACT,
    kind: 'autopilot',
    payerAccount: PAYER,
    status: 'queued',
    pullTxHash: null,
    pullAmountStroops: null,
    extendTxHash: null,
    extendRentChargedStroops: null,
    refundTxHash: null,
    shortfallStroops: null,
  };
  return {
    mode: 'live',
    retryMarginStroops: 10_000n,
    budget: () => 'ok',
    extendNowUsedToday: () => Promise.resolve(0),
    chain: over.chain,
    load: () => Promise.resolve(current),
    save: (next, rows) => {
      current = next;
      saved.push(next);
      ledger.push(...rows);
      return Promise.resolve();
    },
    ...over,
    saved,
    ledger,
  };
}

const okExtend = (): Promise<ExtendMove> =>
  Promise.resolve({
    ...tx('extend-tx', 8_000n),
    succeeded: true,
    transient: false,
    chargedRentStroops: 1_000_000n,
  });

describe('runHostedJob', () => {
  it('dry-run reads and submits nothing', async () => {
    const c = chain(okExtend);
    const job = ports({ mode: 'dry-run', chain: c });
    const outcome = await runHostedJob(job);
    expect(outcome.status).toBe('dry-run');
    expect(outcome.submitted).toBe(false);
    expect(c.calls).toEqual({ pull: 0, extend: 0, refund: 0, simulate: 1 });
    expect(job.ledger).toEqual([]);
  });

  it('pulls once, extends, and refunds only the excess', async () => {
    const c = chain(okExtend);
    const job = ports({ chain: c });
    const outcome = await runHostedJob(job);
    expect(outcome).toMatchObject({
      status: 'extended',
      submitted: true,
      refunded: true,
      shortfallStroops: 0n,
      operatorAlert: null,
    });
    expect(c.calls.pull).toBe(1);
    expect(c.calls.extend).toBe(1);
    expect(c.calls.refund).toBe(1);
    expect(job.ledger.filter((row) => row.kind === 'pull')).toHaveLength(1);
    expect(job.ledger.some((row) => row.kind === 'evergreen-fee')).toBe(true);
    expect(JSON.stringify(hostedJobCounts([outcome]))).not.toContain(PAYER);

    const again = await runHostedJob(job);
    expect(again.submitted).toBe(false);
    expect(c.calls.pull).toBe(1);
    expect(c.calls.refund).toBe(1);
  });

  it('does not pull a job that already has a pull hash', async () => {
    const c = chain(okExtend);
    const job = ports({
      chain: c,
      snapshot: {
        id: 'job-1',
        userId: '00000000-0000-4000-8000-000000000001',
        network: 'testnet',
        contractId: CONTRACT,
        kind: 'autopilot',
        payerAccount: PAYER,
        status: 'pulled',
        pullTxHash: 'pull-tx',
        pullAmountStroops: 1_035_000n,
        extendTxHash: null,
        extendRentChargedStroops: null,
        refundTxHash: null,
        shortfallStroops: null,
      },
    });
    const outcome = await runHostedJob(job);
    expect(c.calls.pull).toBe(0);
    expect(outcome.submitted).toBe(false);
    expect(outcome.status).toBe('extended');
  });

  it('records a shortfall, keeps the job extended, and does not pull again', async () => {
    const c = chain(() =>
      Promise.resolve({
        ...tx('extend-tx'),
        succeeded: true,
        transient: false,
        chargedRentStroops: 2_000_000n,
      }),
    );
    const job = ports({ chain: c });
    const outcome = await runHostedJob(job);
    expect(outcome.operatorAlert).toBe('shortfall-p1');
    expect(outcome.shortfallStroops > 0n).toBe(true);
    expect(outcome.status).toBe('extended');
    expect(c.calls).toMatchObject({ pull: 1, refund: 0 });
    expect(job.saved.at(-1)?.shortfallStroops).toBe(outcome.shortfallStroops);
    expect(job.ledger.some((row) => row.kind === 'difference')).toBe(false);
  });

  it('refunds the whole pull when the extend fails for good', async () => {
    const c = chain(() =>
      Promise.resolve({
        ...tx('extend-tx', 1_315n),
        succeeded: false,
        transient: false,
        chargedRentStroops: 0n,
      }),
    );
    const job = ports({ chain: c });
    const outcome = await runHostedJob(job);
    expect(outcome.status).toBe('refunded');
    expect(outcome.userNotice).toBe('extend_failed_refund');
    expect(c.calls.extend).toBe(1);
    const refund = job.ledger.find((row) => row.kind === 'refund');
    const pull = job.ledger.find((row) => row.kind === 'pull');
    expect(refund?.amountStroops).toBe(pull?.amountStroops);
    expect(job.ledger.some((row) => row.kind === 'evergreen-fee')).toBe(false);
  });

  it('retries one transient extend failure and does not refund when the extend throws', async () => {
    let attempt = 0;
    const c = chain(() => {
      attempt += 1;
      if (attempt === 1) {
        return Promise.resolve({
          ...tx('extend-1'),
          succeeded: false,
          transient: true,
          chargedRentStroops: 0n,
        });
      }
      return okExtend();
    });
    const job = ports({ chain: c });
    await runHostedJob(job);
    expect(c.calls.extend).toBe(2);

    const thrown = chain(() => Promise.reject(new Error('timeout')));
    const stuck = ports({ chain: thrown });
    const outcome = await runHostedJob(stuck);
    expect(outcome.code).toBe('EXTEND_UNCERTAIN');
    expect(thrown.calls.refund).toBe(0);
    expect(thrown.calls.pull).toBe(1);
  });

  it('does not pull when the margin is unset or the network is not testnet', async () => {
    const unset = chain(okExtend);
    const noMargin = ports({ chain: unset, retryMarginStroops: undefined });
    const refused = await runHostedJob(noMargin);
    expect(refused.preflightReason).toBe('margin-unset');
    expect(unset.calls.pull).toBe(0);
    // Live records why it stopped on `jobs.preflight` (preview, 2026-11-23: it was left null).
    expect(noMargin.saved).toHaveLength(1);
    expect(noMargin.saved[0]).toMatchObject({
      status: 'preflight-failed',
      preflight: { ok: false, reason: 'margin-unset' },
    });

    const mainnet = chain(okExtend);
    const off = ports({
      chain: mainnet,
      snapshot: {
        id: 'job-m',
        userId: '00000000-0000-4000-8000-000000000001',
        network: 'mainnet',
        contractId: CONTRACT,
        kind: 'autopilot',
        payerAccount: PAYER,
        status: 'queued',
        pullTxHash: null,
        pullAmountStroops: null,
        extendTxHash: null,
        extendRentChargedStroops: null,
        refundTxHash: null,
        shortfallStroops: null,
      },
    });
    expect((await runHostedJob(off)).preflightReason).toBe('not-testnet');
    expect(off.saved[0]?.preflight).toEqual({ ok: false, reason: 'not-testnet' });
    expect(mainnet.calls.simulate).toBe(0);
    expect(mainnet.calls.pull).toBe(0);
  });
});

describe('runHostedJobs', () => {
  it('keeps going after one job throws', async () => {
    const counts = await runHostedJobs([
      () => Promise.reject(new Error('down')),
      () =>
        Promise.resolve({
          jobId: 'ok',
          mode: 'dry-run' as const,
          status: 'dry-run' as const,
          submitted: false,
          refunded: false,
          shortfallStroops: 0n,
          userNotice: null,
          operatorAlert: null,
        }),
    ]);
    expect(counts.jobs).toBe(2);
    expect(counts.failed).toBe(1);
    expect(counts.submitted).toBe(0);
  });
});

describe('review of #630', () => {
  it('P1: a failed refund after a confirmed extend resumes with the refund only', async () => {
    let refunds = 0;
    const refunded: bigint[] = [];
    const c = chain(okExtend);
    c.refund = (amount) => {
      c.calls.refund += 1;
      refunds += 1;
      if (refunds === 1) return Promise.reject(new Error('rpc down'));
      refunded.push(amount);
      return Promise.resolve(tx('refund-tx'));
    };
    const job = ports({ chain: c });
    const first = await runHostedJob(job);
    expect(first.code).toBe('REFUND_FAILED');
    expect(job.saved.at(-1)).toMatchObject({
      status: 'pulled',
      extendTxHash: 'extend-tx',
      extendRentChargedStroops: 1_000_000n,
    });

    const second = await runHostedJob(job);
    expect(second.status).toBe('extended');
    expect(c.calls.extend).toBe(1);
    // pull 1,035,000 = rent 1,000,000 + fee 25,000 + margin 10,000: only the margin goes back.
    expect(refunded).toEqual([10_000n]);
    const rows = job.ledger.filter((row) => row.kind !== 'network-fee');
    expect(rows.map((row) => [row.kind, row.amountStroops])).toEqual([
      ['pull', 1_035_000n],
      ['rent', 1_000_000n],
      ['evergreen-fee', 25_000n],
      ['refund', 10_000n],
    ]);
  });

  it('P2.2: the pull row is written in the same save as the pulled status', async () => {
    const c = chain(() => Promise.reject(new Error('timeout')));
    const saves: { status: string; kinds: string[] }[] = [];
    const job = ports({ chain: c });
    const base = job.save;
    const wrapped: HostedJobPorts = {
      ...job,
      save: (next, rows) => {
        saves.push({ status: next.status, kinds: rows.map((row) => row.kind) });
        return base(next, rows);
      },
    };
    await runHostedJob(wrapped);
    expect(saves[0]).toEqual({ status: 'pulled', kinds: ['pull', 'network-fee'] });
  });

  it('records an ok preflight with the simulated rent on the pull save, and only there', async () => {
    const c = chain(okExtend);
    const job = ports({ chain: c });
    await runHostedJob(job);
    expect(job.saved[0]).toMatchObject({
      status: 'pulled',
      preflight: { ok: true, rentStroops: 1_000_000n },
    });
    for (const later of job.saved.slice(1)) expect(later.preflight).toBeNull();
  });

  it('P2.4: dry-run writes nothing, even when preflight fails', async () => {
    const c = chain(okExtend);
    const job = ports({ mode: 'dry-run', chain: c, retryMarginStroops: undefined });
    const outcome = await runHostedJob(job);
    expect(outcome.preflightReason).toBe('margin-unset');
    expect(job.saved).toEqual([]);
    expect(job.ledger).toEqual([]);
  });

  it('P3: a resumed job keeps the pull evidence and settles once', async () => {
    const c = chain(okExtend);
    const job = ports({ chain: c });
    await runHostedJob(job);
    const evidence = job.ledger
      .filter((row) => row.kind === 'network-fee')
      .map((row) => row.txHash);
    expect(evidence).toEqual(['pull-tx', 'extend-tx', 'refund-tx']);
    await runHostedJob(job);
    expect(job.ledger.filter((row) => row.kind === 'rent')).toHaveLength(1);
  });
});
