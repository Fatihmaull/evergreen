/**
 * `lib/wallet-money.ts` against stand-ins for the wallet and the RPC.
 */
import { describe, expect, test, vi } from 'vitest';

const fake = vi.hoisted(() => ({ server: undefined as unknown, calls: 0 }));
vi.mock('../src/lib/evergreen', () => ({
  verifiedServer: async () => {
    fake.calls++;
    return fake.server;
  },
}));
import {
  describeTxResult,
  isMoneyFailure,
  rpcChain,
  signAndSubmit,
  type ChainPort,
} from '../src/lib/wallet-money';
import { isWalletFailure, type Wallet } from '../src/lib/wallet';
import { NETWORK } from '../src/lib/network';
import { rpc, xdr } from '@stellar/stellar-sdk';

const ME = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const noSleep = async () => {};

function wallet(over: Partial<Wallet> = {}): Wallet & { asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    connect: async () => ({ account: ME }),
    assertTestnet: async () => true,
    signTransaction: async (xdr, opts) => {
      asked.push({ xdr, opts });
      return { signedXdr: `signed:${xdr}` };
    },
    ...over,
  };
}

function chain(over: Partial<ChainPort> = {}): ChainPort & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    prepare: async (xdr) => ({ xdr: `prepared:${xdr}` }),
    send: async (x) => {
      sent.push(x);
      return { hash: 'H' };
    },
    status: async () => ({ status: 'SUCCESS', ledger: 7 }),
    ...over,
  };
}

describe('signAndSubmit', () => {
  test('prepares, signs with NETWORK.passphrase and the address, submits, reads back', async () => {
    const w = wallet();
    const c = chain();
    expect(await signAndSubmit(w, 'T', ME, { chain: c, sleep: noSleep })).toEqual({
      hash: 'H',
      ledger: 7,
    });
    expect(w.asked).toEqual([
      { xdr: 'prepared:T', opts: { networkPassphrase: NETWORK.passphrase, address: ME } },
    ]);
    expect(c.sent).toEqual(['signed:prepared:T']);
  });

  test('the passphrase it signs with is the testnet one', async () => {
    const w = wallet();
    await signAndSubmit(w, 'T', ME, { chain: chain(), sleep: noSleep });
    expect((w.asked[0] as { opts: { networkPassphrase: string } }).opts.networkPassphrase).toBe(
      'Test SDF Network ; September 2015',
    );
  });

  test('a simulation failure never reaches the wallet', async () => {
    const w = wallet();
    const r = await signAndSubmit(w, 'T', ME, {
      chain: chain({ prepare: async () => ({ kind: 'simulation-failed', detail: 'x' }) }),
    });
    expect(r).toEqual({ kind: 'simulation-failed', detail: 'x' });
    expect(w.asked).toEqual([]);
  });

  test('a signing timeout is possibly-signed and nothing is submitted or retried', async () => {
    const w = wallet({ signTransaction: async () => ({ kind: 'timeout' }) });
    const c = chain();
    expect(await signAndSubmit(w, 'T', ME, { chain: c })).toEqual({ kind: 'possibly-signed' });
    expect(c.sent).toEqual([]);
  });

  test('other wallet failures pass through unchanged', async () => {
    const w = wallet({ signTransaction: async () => ({ kind: 'rejected' }) });
    const c = chain();
    const r = await signAndSubmit(w, 'T', ME, { chain: c });
    expect(r).toEqual({ kind: 'rejected' });
    expect(isWalletFailure(r)).toBe(true);
    expect(c.sent).toEqual([]);
  });

  test('failed on chain carries the hash', async () => {
    const c = chain({ status: async () => ({ status: 'FAILED', detail: 'txFailed' }) });
    expect(await signAndSubmit(wallet(), 'T', ME, { chain: c, sleep: noSleep })).toEqual({
      kind: 'failed-on-chain',
      hash: 'H',
      detail: 'txFailed',
    });
  });

  test('read-back that never settles is pending, not failed', async () => {
    const c = chain({ status: async () => ({ status: 'NOT_FOUND' }) });
    expect(
      await signAndSubmit(wallet(), 'T', ME, {
        chain: c,
        sleep: noSleep,
        pollIntervalMs: 1,
        pollTimeoutMs: 3,
      }),
    ).toEqual({ kind: 'pending', hash: 'H' });
  });

  test('status that throws after send keeps the hash as pending and never resubmits', async () => {
    const c = chain({
      send: async (x) => {
        c.sent.push(x);
        return { hash: 'H1' };
      },
      status: async () => {
        throw new Error('rpc down');
      },
    });
    expect(
      await signAndSubmit(wallet(), 'T', ME, {
        chain: c,
        sleep: noSleep,
        pollIntervalMs: 1,
        pollTimeoutMs: 3,
      }),
    ).toEqual({ kind: 'pending', hash: 'H1' });
    expect(c.sent).toHaveLength(1);
  });
});

describe('MoneyFailure and WalletFailure are told apart', () => {
  test('no money kind passes isWalletFailure, and no wallet kind passes isMoneyFailure', () => {
    for (const kind of [
      'simulation-failed',
      'restore-required',
      'possibly-signed',
      'submit-failed',
      'failed-on-chain',
      'pending',
    ]) {
      expect(isWalletFailure({ kind })).toBe(false);
      expect(isMoneyFailure({ kind })).toBe(true);
    }
    for (const kind of ['timeout', 'rejected', 'account-mismatch', 'wrong-network'])
      expect(isMoneyFailure({ kind })).toBe(false);
  });
});

describe('describeTxResult', () => {
  // Built with the SDK's own xdr constructors (17.0.1) and frozen here.
  test('a failed invoke names the transaction, operation and invoke results', () => {
    expect(describeTxResult('AAAAAAAAAGT/////AAAAAQAAAAAAAAAY/////gAAAAA=')).toBe(
      'txFailed; op 0: invokeHostFunction → invokeHostFunctionTrapped',
    );
  });
  test('a fee bump names the inner transaction too', () => {
    expect(
      describeTxResult(
        'AAAAAAAAAGT////zAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf////8AAAABAAAAAAAAABj////+AAAAAAAAAAA=',
      ),
    ).toBe(
      'txFeeBumpInnerFailed; inner txFailed; op 0: invokeHostFunction → invokeHostFunctionTrapped',
    );
  });
  test('a transaction-level code with no operations', () => {
    expect(describeTxResult('AAAAAAAAAGT////7AAAAAA==')).toBe('txBadSeq');
  });
  test('what does not decode comes back raw', () => {
    expect(describeTxResult('not-xdr')).toBe('not-xdr');
    expect(describeTxResult('AAAA')).toBe('AAAA');
  });
});

describe('rpcChain status', () => {
  test('a FAILED transaction carries the decoded codes', async () => {
    const server = {
      getTransaction: async () => ({
        status: rpc.Api.GetTransactionStatus.FAILED,
        resultXdr: xdr.TransactionResult.fromXdr('AAAAAAAAAGT////7AAAAAA==', 'base64'),
      }),
    } as unknown as rpc.Server;
    fake.server = server;
    const before = fake.calls;
    expect(await rpcChain().status('H')).toEqual({
      status: 'FAILED',
      detail: 'txBadSeq',
    });
    expect(fake.calls).toBe(before + 1);
  });
});

/** WEBF's review points on #327 for this module, pinned to its source. */
describe('lib/wallet-money.ts source', () => {
  const read = async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/lib/wallet-money.ts', import.meta.url), 'utf8');
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  };
  test('reaches the RPC only through verifiedServer()', async () => {
    const code = await read();
    expect(code).not.toMatch(/new\s+rpc\.Server|new\s+Server\(|rpcUrl/);
    expect(code).toMatch(/verifiedServer/);
  });
  test('carries no literal network passphrase', async () => {
    expect(await read()).not.toMatch(/Test SDF|Public Global|Networks\.(TESTNET|PUBLIC)/);
  });
  test('never uses the rounding formatter', async () => {
    expect(await read()).not.toMatch(/approxXlm/);
  });
});

describe('rejected is not failed and not pending', () => {
  test('a rejection is the wallet kind, never a money kind, and nothing is sent', async () => {
    const c = chain();
    const r = await signAndSubmit(
      wallet({ signTransaction: async () => ({ kind: 'rejected' }) }),
      'T',
      ME,
      {
        chain: c,
      },
    );
    expect(r).toEqual({ kind: 'rejected' });
    expect(isMoneyFailure(r)).toBe(false);
    expect(c.sent).toEqual([]);
  });
});
