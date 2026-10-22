/**
 * `lib/wallet-money.ts` against stand-ins for the wallet and the RPC.
 */
import { describe, expect, test } from 'vitest';
import { isMoneyFailure, signAndSubmit, type ChainPort } from '../src/lib/wallet-money';
import { isWalletFailure, type Wallet } from '../src/lib/wallet';
import { NETWORK } from '../src/lib/network';

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
    expect(await signAndSubmit(w, c, 'T', ME, { sleep: noSleep })).toEqual({
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
    await signAndSubmit(w, chain(), 'T', ME, { sleep: noSleep });
    expect((w.asked[0] as { opts: { networkPassphrase: string } }).opts.networkPassphrase).toBe(
      'Test SDF Network ; September 2015',
    );
  });

  test('a simulation failure never reaches the wallet', async () => {
    const w = wallet();
    const r = await signAndSubmit(
      w,
      chain({ prepare: async () => ({ kind: 'simulation-failed', detail: 'x' }) }),
      'T',
      ME,
    );
    expect(r).toEqual({ kind: 'simulation-failed', detail: 'x' });
    expect(w.asked).toEqual([]);
  });

  test('a signing timeout is possibly-signed and nothing is submitted or retried', async () => {
    const w = wallet({ signTransaction: async () => ({ kind: 'timeout' }) });
    const c = chain();
    expect(await signAndSubmit(w, c, 'T', ME)).toEqual({ kind: 'possibly-signed' });
    expect(c.sent).toEqual([]);
  });

  test('other wallet failures pass through unchanged', async () => {
    const w = wallet({ signTransaction: async () => ({ kind: 'rejected' }) });
    const c = chain();
    const r = await signAndSubmit(w, c, 'T', ME);
    expect(r).toEqual({ kind: 'rejected' });
    expect(isWalletFailure(r)).toBe(true);
    expect(c.sent).toEqual([]);
  });

  test('failed on chain carries the hash', async () => {
    const c = chain({ status: async () => ({ status: 'FAILED', detail: 'txFailed' }) });
    expect(await signAndSubmit(wallet(), c, 'T', ME, { sleep: noSleep })).toEqual({
      kind: 'failed-on-chain',
      hash: 'H',
      detail: 'txFailed',
    });
  });

  test('read-back that never settles is pending, not failed', async () => {
    const c = chain({ status: async () => ({ status: 'NOT_FOUND' }) });
    expect(
      await signAndSubmit(wallet(), c, 'T', ME, {
        sleep: noSleep,
        pollIntervalMs: 1,
        pollTimeoutMs: 3,
      }),
    ).toEqual({ kind: 'pending', hash: 'H' });
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
