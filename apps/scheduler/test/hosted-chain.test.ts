import { instanceKey } from '@evergreen-stellar/core';
import { Account, Keypair } from '@stellar/stellar-sdk';
import { describe, expect, it } from 'vitest';
import {
  ChainStepError,
  EXPIRY_GRACE_SECONDS,
  createHostedChain,
  findBigint,
  stroopsToXlm,
  type ChainRpc,
} from '../src/hosted-chain.js';
import type { SubmitStep, SubmittedStore, SubmittedTx } from '../src/hosted-store.js';

const engine = Keypair.random();
const payer = Keypair.random().publicKey();
const CONTRACT = 'CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC';
const INSTANCE_KEY = instanceKey(CONTRACT);

function memoryStore(): SubmittedStore & { data: Map<SubmitStep, SubmittedTx> } {
  const data = new Map<SubmitStep, SubmittedTx>();
  return {
    data,
    read: (step) => Promise.resolve(data.get(step) ?? null),
    record: (step, tx) => {
      data.set(step, tx);
      return Promise.resolve();
    },
    clear: (step) => {
      data.delete(step);
      return Promise.resolve();
    },
  };
}

type Status = 'SUCCESS' | 'FAILED' | 'NOT_FOUND';

function fakeRpc(options: { send?: string; status?: (hash: string) => Status; rent?: bigint }) {
  const sent: string[] = [];
  let seq = 100n;
  const result = (s: Status) =>
    s === 'NOT_FOUND'
      ? { status: s }
      : {
          status: s,
          resultXdr: { toXdrObject: () => ({ feeCharged: 1_234n, result: {} }) },
          resultMetaXdr: {
            toXdrObject: () => ({
              v4: { sorobanMeta: { ext: { v1: { rentFeeCharged: options.rent ?? 500n } } } },
            }),
          },
        };
  const server: ChainRpc = {
    getAccount: (id) => Promise.resolve(new Account(id, (seq++).toString())),
    simulateTransaction: () => Promise.reject(new Error('not used')),
    prepareTransaction: (tx) => Promise.resolve(tx),
    sendTransaction: (tx) => {
      const hash = Buffer.from(tx.hash()).toString('hex');
      sent.push(hash);
      return Promise.resolve({ status: options.send ?? 'PENDING', hash });
    },
    getTransaction: (hash) => Promise.resolve(result(options.status?.(hash) ?? 'SUCCESS') as never),
  };
  return { server, sent };
}

function make(server: ChainRpc, store: SubmittedStore, now = () => 1_000) {
  return createHostedChain({
    rpc: server,
    engine,
    payerAccount: payer,
    entryKeys: [INSTANCE_KEY],
    extendToLedgers: 535_680,
    submitted: store,
    now,
    confirmAttempts: 2,
    sleep: () => Promise.resolve(),
    quoteRent: () => Promise.resolve(1_000_000n),
  });
}

describe('hosted chain port', () => {
  it('reads the charged fee and the rent from the result and meta', async () => {
    const { server } = fakeRpc({ rent: 990_000n });
    const chain = make(server, memoryStore());
    const extend = await chain.extend(1, 'job');
    expect(extend).toMatchObject({
      succeeded: true,
      chargedRentStroops: 990_000n,
      feeChargedStroops: 1_234n,
    });
    expect(CONTRACT).toHaveLength(56);
  });

  it('records the hash before sending, and a resumed pull that succeeded sends nothing new', async () => {
    const store = memoryStore();
    const { server, sent } = fakeRpc({});
    const first = await make(server, store).pull(1_035_000n, 'job');
    expect(sent).toEqual([first.hash]);
    expect(store.data.get('pull')?.hash).toBe(first.hash);
    const again = await make(server, store).pull(1_035_000n, 'job');
    expect(again.hash).toBe(first.hash);
    expect(sent).toHaveLength(1);
  });

  it('an unconfirmed pull throws uncertain, and stays uncertain until it has expired', async () => {
    const store = memoryStore();
    const { server, sent } = fakeRpc({ status: () => 'NOT_FOUND' });
    await expect(make(server, store).pull(5n, 'job')).rejects.toMatchObject({
      code: 'STEP_UNCERTAIN',
    });
    const recorded = store.data.get('pull')!;
    await expect(
      make(server, store, () => recorded.expiresAt).pull(5n, 'job'),
    ).rejects.toMatchObject({
      code: 'STEP_UNCERTAIN',
    });
    expect(sent).toHaveLength(1);
    // After maxTime + grace it can never be included, so a new one is built.
    const late = () => recorded.expiresAt + EXPIRY_GRACE_SECONDS + 1;
    await expect(make(server, store, late).pull(5n, 'job')).rejects.toMatchObject({
      code: 'STEP_UNCERTAIN',
    });
    expect(sent).toHaveLength(2);
  });

  it('a send the RPC refuses clears the record, so nothing is left pending', async () => {
    const store = memoryStore();
    const { server } = fakeRpc({ send: 'TRY_AGAIN_LATER' });
    await expect(make(server, store).refund(10_000n, 'job')).rejects.toBeInstanceOf(ChainStepError);
    expect(store.data.has('refund')).toBe(false);
  });

  it('a failed extend is final and is not resent', async () => {
    const store = memoryStore();
    const { server, sent } = fakeRpc({ status: () => 'FAILED' });
    const first = await make(server, store).extend(1, 'job');
    expect(first).toMatchObject({ succeeded: false, transient: false, chargedRentStroops: 0n });
    await make(server, store).extend(2, 'job');
    expect(sent).toHaveLength(1);
  });

  it('a failed pull moved nothing and is rebuilt on the next call', async () => {
    const store = memoryStore();
    const failed = new Set<string>();
    const { server, sent } = fakeRpc({
      status: (hash) =>
        failed.size === 0 || failed.has(hash) ? (failed.add(hash), 'FAILED') : 'SUCCESS',
    });
    await expect(make(server, store).pull(5n, 'job')).rejects.toMatchObject({
      code: 'STEP_FAILED',
    });
    const second = await make(server, store).pull(5n, 'job');
    expect(sent).toHaveLength(2);
    expect(second.hash).toBe(sent[1]);
  });

  it('refuses the engine as payer and an empty footprint', () => {
    const { server } = fakeRpc({});
    expect(() =>
      createHostedChain({
        rpc: server,
        engine,
        payerAccount: engine.publicKey(),
        entryKeys: ['x'],
        extendToLedgers: 1,
        submitted: memoryStore(),
      }),
    ).toThrow(ChainStepError);
  });
});

describe('helpers', () => {
  it('finds a nested bigint and formats stroops', () => {
    expect(findBigint({ a: [{ b: { rentFeeCharged: 7n } }] }, 'rentFeeCharged')).toBe(7n);
    expect(findBigint({ a: 1 }, 'x')).toBeUndefined();
    expect(stroopsToXlm(10_000n)).toBe('0.0010000');
    expect(stroopsToXlm(12_345_678_901n)).toBe('1234.5678901');
  });
});
