/**
 * "Support Evergreen" (PH2-E3-07): the unset treasury, exact amount parsing,
 * the tip flow against stand-ins, never paying twice, and the receipt.
 */
import { describe, expect, test, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const fake = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../src/lib/evergreen', () => ({
  verifiedServer: async () => {
    fake.calls++;
    throw new Error('the real RPC must not be reached in these tests');
  },
}));

import {
  TREASURY_ADDRESS,
  createTipper,
  parseXlmAmount,
  type SupportChain,
} from '../src/lib/support';
import { TREASURY_UNSET_TEXT, tipOutcomeHtml } from '../src/lib/support-view';
import type { Wallet } from '../src/lib/wallet';
import type { ChainPort } from '../src/lib/wallet-money';
import { NETWORK } from '../src/lib/network';
import { StrKey } from '@stellar/stellar-sdk';

const ME = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const noSleep = async () => {};
const src = (p: string) => readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8');
const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');

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

function supportChain(): SupportChain & { builds: [string, string, bigint][] } {
  const c = {
    builds: [] as [string, string, bigint][],
    buildTip: async (from: string, to: string, stroops: bigint) => {
      c.builds.push([from, to, stroops]);
      return 'TIP';
    },
  };
  return c;
}

function money(over: Partial<ChainPort> = {}): ChainPort & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    prepare: async (x) => ({ xdr: `prepared:${x}` }),
    send: async (x) => {
      sent.push(x);
      return { hash: 'H1' };
    },
    status: async () => ({ status: 'SUCCESS', ledger: 9 }),
    ...over,
  };
}

// A test stand-in derived from fixed bytes, not a treasury: no real address is written here.
const valid = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));

describe('the treasury is unset', () => {
  test('TREASURY_ADDRESS ships unset and no address is written in the module', () => {
    expect(TREASURY_ADDRESS).toBeUndefined();
    expect(src('../src/lib/support.ts')).not.toMatch(/\bG[A-Z2-7]{55}\b/);
    expect(src('../src/pages/support.ts')).not.toMatch(/\bG[A-Z2-7]{55}\b/);
  });

  test('the tipper is unavailable and builds, signs and sends nothing', async () => {
    const w = wallet();
    const c = supportChain();
    const m = money();
    const before = fake.calls;
    const t = createTipper({ wallet: w, supportChain: c, moneyChain: m });
    expect(t.available).toBe(false);
    expect(await t.send(ME, '5')).toEqual({ kind: 'treasury-unset' });
    expect([c.builds.length, w.asked.length, m.sent.length, fake.calls - before]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(text(tipOutcomeHtml({ kind: 'treasury-unset' }))).toContain(TREASURY_UNSET_TEXT);
  });

  test('the page hides the send control rather than showing it disabled', () => {
    const page = src('../src/pages/support.ts');
    expect(page).toMatch(/send-button'\)\.hidden = true/);
    expect(src('../src/pages/support.mjs')).not.toMatch(/disabled/);
  });

  test('the page is not registered in the build, the nav or the dashboard routes yet', () => {
    expect(src('../build.mjs')).not.toContain('support.mjs');
    expect(src('../src/chrome.mjs')).not.toContain('/support/');
    expect(src('../../dashboard/src/index.ts')).not.toContain('/support/');
  });
});

describe('amount parsing is exact', () => {
  test.each([
    ['5', 50_000_000n],
    ['2.5', 25_000_000n],
    ['0.0000001', 1n],
    [' 1.2345678 ', 12_345_678n],
  ])('%s XLM is %s stroops', (input, stroops) => {
    expect(parseXlmAmount(input)).toEqual({ ok: true, stroops });
  });

  test.each(['', '0', '0.0000000', '-1', '1e3', '1.23456789', '1,5', 'abc', '.5'])(
    'refuses %j',
    (input) => {
      expect(parseXlmAmount(input).ok).toBe(false);
    },
  );

  test('there is no default amount: the field starts empty', () => {
    expect(src('../src/pages/support.mjs')).toMatch(/id="amount-input"[^>]*value=""/);
  });
});

describe('a configured treasury (tests only)', () => {
  test('sends the typed amount once, to the treasury, signed with the testnet passphrase', async () => {
    const w = wallet();
    const c = supportChain();
    const m = money();
    const t = createTipper({
      wallet: w,
      treasury: valid,
      supportChain: c,
      moneyChain: m,
      sleep: noSleep,
    });
    const out = await t.send(ME, '2.5');
    expect(out).toEqual({ hash: 'H1', ledger: 9 });
    expect(c.builds).toEqual([[ME, valid, 25_000_000n]]);
    expect(w.asked).toEqual([
      { xdr: 'prepared:TIP', opts: { networkPassphrase: NETWORK.passphrase, address: ME } },
    ]);
    expect(m.sent).toEqual(['signed:prepared:TIP']);
    expect(t.locked).toBe(true);
    expect(await t.send(ME, '2.5')).toEqual({ kind: 'already-sent' });
    expect(m.sent.length).toBe(1);
  });

  test('the receipt states the exact amount, the full address and the transaction', () => {
    const html = text(
      tipOutcomeHtml({ hash: 'H1', ledger: 1_234 }, { stroops: 25_000_000n, to: valid }),
    );
    expect(html).toContain('2.5000000 XLM · 25,000,000 stroops');
    expect(html).toContain(valid);
    expect(html).toContain('H1');
    expect(html).toContain('ledger 1,234');
    expect(html).not.toMatch(/about \d/);
  });

  test('an invalid amount asks nothing of the wallet and leaves the page open', async () => {
    const w = wallet();
    const t = createTipper({
      wallet: w,
      treasury: valid,
      supportChain: supportChain(),
      moneyChain: money(),
    });
    expect((await t.send(ME, '0')).kind).toBe('invalid-amount');
    expect(w.asked.length).toBe(0);
    expect(t.available).toBe(true);
  });

  test('declining in the wallet sends nothing and leaves the page open', async () => {
    const w = wallet({ signTransaction: async () => ({ kind: 'rejected' }) });
    const m = money();
    const t = createTipper({
      wallet: w,
      treasury: valid,
      supportChain: supportChain(),
      moneyChain: m,
    });
    expect(await t.send(ME, '1')).toEqual({ kind: 'rejected' });
    expect(m.sent.length).toBe(0);
    expect(t.available).toBe(true);
    expect(text(tipOutcomeHtml({ kind: 'rejected' }))).toContain('Nothing was signed or sent');
  });

  test('a read-back error after send keeps the hash, reports pending and never pays twice', async () => {
    const m = money({
      status: async () => {
        throw new Error('rpc down');
      },
    });
    const t = createTipper({
      wallet: wallet(),
      treasury: valid,
      supportChain: supportChain(),
      moneyChain: m,
      sleep: noSleep,
    });
    expect(await t.send(ME, '1')).toEqual({ kind: 'pending', hash: 'H1' });
    expect(t.locked).toBe(true);
    expect(await t.send(ME, '1')).toEqual({ kind: 'already-sent' });
    expect(m.sent.length).toBe(1);
  });

  test('a wallet timeout is possibly-signed and locks', async () => {
    const t = createTipper({
      wallet: wallet({ signTransaction: async () => ({ kind: 'timeout' }) }),
      treasury: valid,
      supportChain: supportChain(),
      moneyChain: money(),
    });
    expect(await t.send(ME, '1')).toEqual({ kind: 'possibly-signed' });
    expect(t.locked).toBe(true);
  });

  test('the treasury cannot tip itself', async () => {
    const t = createTipper({
      wallet: wallet(),
      treasury: valid,
      supportChain: supportChain(),
      moneyChain: money(),
    });
    expect(await t.send(valid, '1')).toEqual({ kind: 'self-payment' });
  });
});

describe('copy', () => {
  test('promises nothing a tip buys and names no fee', () => {
    const all = src('../src/pages/support.mjs') + src('../src/lib/support-view.ts');
    expect(all).not.toMatch(/\b(priority|faster|guarantee|premium|fees?|non-custodial)\b/i);
    expect(all).toMatch(/does not change how your contracts are watched or extended/);
  });
});
