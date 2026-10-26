/**
 * `lib/wallet.ts` against a stand-in for `@stellar/freighter-api`.
 *
 * Each test names the failure kind it pins, so removing the check that
 * produces it fails here rather than on a signing screen.
 */
import { describe, expect, test } from 'vitest';
import { DECLINED_CODE, createWallet, isWalletFailure, type WalletPort } from '../src/lib/wallet';
import { NETWORK } from '../src/lib/network';
import { exactXlm } from '../src/lib/format';

const ME = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const OTHER = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const MAINNET = 'Public Global Stellar Network ; September 2015';

function port(over: Partial<WalletPort> = {}): WalletPort & { signed: unknown[] } {
  const signed: unknown[] = [];
  return {
    signed,
    isConnected: async () => ({ isConnected: true }),
    requestAccess: async () => ({ address: ME }),
    getAddress: async () => ({ address: ME }),
    getNetworkDetails: async () => ({ networkPassphrase: NETWORK.passphrase }),
    signTransaction: async (xdr, opts) => {
      signed.push({ xdr, opts });
      return { signedTxXdr: `signed:${xdr}`, signerAddress: opts.address };
    },
    ...over,
  };
}

const opts = { networkPassphrase: NETWORK.passphrase, address: ME };

describe('connect', () => {
  test('returns the account', async () => {
    expect(await createWallet(port()).connect()).toEqual({ account: ME });
  });
  test('not-installed when isConnected is false', async () => {
    const w = createWallet(port({ isConnected: async () => ({ isConnected: false }) }));
    expect(await w.connect()).toEqual({ kind: 'not-installed' });
  });
  test('not-connected when access yields no address', async () => {
    const w = createWallet(port({ requestAccess: async () => ({ address: '' }) }));
    expect(await w.connect()).toEqual({ kind: 'not-connected' });
  });
  test('rejected (code -4) is not unavailable', async () => {
    const w = createWallet(
      port({
        requestAccess: async () => ({
          address: '',
          error: { code: DECLINED_CODE, message: 'The user rejected this request.' },
        }),
      }),
    );
    expect(await w.connect()).toEqual({ kind: 'rejected' });
  });
  test('any other error is unavailable, with its detail', async () => {
    const w = createWallet(
      port({ requestAccess: async () => ({ address: '', error: { code: -1, message: 'boom' } }) }),
    );
    expect(await w.connect()).toEqual({ kind: 'unavailable', detail: '-1: boom' });
  });
  test('a throw is unavailable, not an exception', async () => {
    const w = createWallet(
      port({
        requestAccess: async () => {
          throw new Error('gone');
        },
      }),
    );
    expect(await w.connect()).toEqual({ kind: 'unavailable', detail: 'gone' });
  });
  test('a prompt left open past the deadline is timeout', async () => {
    const w = createWallet(port({ requestAccess: () => new Promise(() => {}) }), {
      timeoutMs: 5,
    });
    expect(await w.connect()).toEqual({ kind: 'timeout' });
  });
});

describe('assertTestnet', () => {
  test('true on the passphrase NETWORK names', async () => {
    expect(await createWallet(port()).assertTestnet()).toBe(true);
  });
  test('wrong-network carries what the wallet reported', async () => {
    const w = createWallet(
      port({ getNetworkDetails: async () => ({ networkPassphrase: MAINNET }) }),
    );
    expect(await w.assertTestnet()).toEqual({ kind: 'wrong-network', reported: MAINNET });
  });
});

describe('signTransaction(xdr, { networkPassphrase, address })', () => {
  test('signs with NETWORK.passphrase and the expected address', async () => {
    const p = port();
    expect(await createWallet(p).signTransaction('AAA', opts)).toEqual({ signedXdr: 'signed:AAA' });
    expect(p.signed).toEqual([{ xdr: 'AAA', opts }]);
  });
  test('refuses a caller passphrase other than NETWORK.passphrase, before the wallet is asked', async () => {
    const p = port();
    const r = await createWallet(p).signTransaction('AAA', { ...opts, networkPassphrase: MAINNET });
    expect(r).toEqual({ kind: 'wrong-network', reported: MAINNET });
    expect(p.signed).toEqual([]);
  });
  test('a network switch after assertTestnet is caught at signing', async () => {
    let calls = 0;
    const p = port({
      getNetworkDetails: async () => ({
        networkPassphrase: calls++ === 0 ? NETWORK.passphrase : MAINNET,
      }),
    });
    const w = createWallet(p);
    expect(await w.assertTestnet()).toBe(true);
    expect(await w.signTransaction('AAA', opts)).toEqual({
      kind: 'wrong-network',
      reported: MAINNET,
    });
    expect(p.signed).toEqual([]);
  });
  test('account-mismatch when the active account is not the expected one', async () => {
    const p = port({ getAddress: async () => ({ address: OTHER }) });
    expect(await createWallet(p).signTransaction('AAA', opts)).toEqual({
      kind: 'account-mismatch',
      expected: ME,
      reported: OTHER,
    });
    expect(p.signed).toEqual([]);
  });
  test('account-mismatch when a different account signed', async () => {
    const p = port({
      signTransaction: async () => ({ signedTxXdr: 'X', signerAddress: OTHER }),
    });
    expect(await createWallet(p).signTransaction('AAA', opts)).toEqual({
      kind: 'account-mismatch',
      expected: ME,
      reported: OTHER,
    });
  });
  test('rejected at the prompt', async () => {
    const p = port({
      signTransaction: async () => ({
        signedTxXdr: '',
        signerAddress: '',
        error: { code: DECLINED_CODE, message: 'The user rejected this request.' },
      }),
    });
    expect(await createWallet(p).signTransaction('AAA', opts)).toEqual({ kind: 'rejected' });
  });
  test('timeout at the prompt', async () => {
    const p = port({ signTransaction: () => new Promise(() => {}) });
    expect(await createWallet(p, { timeoutMs: 5 }).signTransaction('AAA', opts)).toEqual({
      kind: 'timeout',
    });
  });
});

describe('the module never submits', () => {
  test('lib/wallet.ts names no submit, simulate or send path', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../src/lib/wallet.ts', import.meta.url), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/sendTransaction|submit|simulate|stellar-sdk|wallet-money/i);
  });
});

describe('exactXlm', () => {
  test('both units, unrounded', () => {
    expect(exactXlm('123456789')).toEqual({
      xlm: '12.3456789 XLM',
      stroops: '123,456,789 stroops',
    });
    expect(exactXlm(1n)).toEqual({ xlm: '0.0000001 XLM', stroops: '1 stroop' });
  });
  test('refuses what it cannot state exactly', () => {
    for (const bad of ['-1', '1.5', '', '1e9', 'abc'])
      expect(() => exactXlm(bad)).toThrow(RangeError);
  });
});

describe('isWalletFailure', () => {
  test('every wallet kind, and not a money-side kind', () => {
    expect(isWalletFailure({ kind: 'account-mismatch', expected: ME, reported: OTHER })).toBe(true);
    expect(isWalletFailure({ kind: 'timeout' })).toBe(true);
    expect(isWalletFailure({ kind: 'submit-failed' })).toBe(false);
    expect(isWalletFailure({ signedXdr: 'X' })).toBe(false);
  });
});
