/**
 * /allowance/ (PH2-E3-05): the unset spender, the raw read, the revoke flow
 * against stand-ins, and one distinct sentence per outcome.
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

import { ENGINE_SPENDER, readAllowance, type AllowanceChain } from '../src/lib/allowance';
import { createRevoker, type RevokeOutcome } from '../src/lib/allowance-revoke';
import { readHtml, revokeOutcomeHtml, SPENDER_UNSET_TEXT } from '../src/lib/allowance-view';
import type { Wallet } from '../src/lib/wallet';
import type { ChainPort } from '../src/lib/wallet-money';
import { NETWORK } from '../src/lib/network';

const ME = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SPENDER = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'; // a test stand-in, not an engine
const noSleep = async () => {};
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

function allowanceChain(): AllowanceChain & { reads: number; builds: string[][] } {
  const c = {
    reads: 0,
    builds: [] as string[][],
    readAllowance: async () => {
      c.reads++;
      return {
        amountStroops: '500000000',
        liveUntilLedger: 1_100_000,
        observedAtLedger: 1_000_000,
      };
    },
    buildRevoke: async (from: string, spender: string) => {
      c.builds.push([from, spender]);
      return 'REVOKE';
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

describe('the spender is unset', () => {
  test('ENGINE_SPENDER ships unset: no engine address is guessed', () => {
    expect(ENGINE_SPENDER).toBeUndefined();
    const src = readFileSync(
      fileURLToPath(new URL('../src/lib/allowance.ts', import.meta.url)),
      'utf8',
    );
    expect(src).not.toMatch(/\bG[A-Z2-7]{55}\b/);
  });

  test('no chain read happens, and the status is undetermined with the reason', async () => {
    const c = allowanceChain();
    const before = fake.calls;
    const read = await readAllowance(ME, { chain: c });
    expect(read).toEqual({ kind: 'spender-unset' });
    expect(c.reads).toBe(0);
    expect(fake.calls).toBe(before);
    const html = text(readHtml(read));
    expect(html).toContain('undetermined');
    expect(html).toContain("The engine's spender address is not published yet");
  });

  test('the revoker is unavailable and builds, signs and sends nothing', async () => {
    const w = wallet();
    const c = allowanceChain();
    const m = money();
    const r = createRevoker({ wallet: w, allowanceChain: c, moneyChain: m });
    expect(r.available).toBe(false);
    expect(await r.revoke(ME)).toEqual({ kind: 'spender-unset' });
    expect([c.builds.length, w.asked.length, m.sent.length]).toEqual([0, 0, 0]);
  });

  test('the page renders the revoke button disabled', () => {
    const page = readFileSync(
      fileURLToPath(new URL('../src/pages/allowance.mjs', import.meta.url)),
      'utf8',
    );
    expect(page).toMatch(/id="revoke-button"[^>]*disabled/);
  });
});

describe('a configured spender (tests only)', () => {
  test('shows the raw read exactly, with status undetermined and never a conclusion', async () => {
    const read = await readAllowance(ME, { spender: SPENDER, chain: allowanceChain() });
    const html = text(readHtml(read, new Date('2026-10-31T00:00:00Z')));
    expect(html).toContain('undetermined');
    expect(html).toContain('50.0000000 XLM · 500,000,000 stroops');
    expect(html).toContain('ledger 1,100,000');
    expect(html).toMatch(/~\w+ \d+, 2026/);
    expect(html).not.toMatch(/\b(revoked|expired|active|protected)\b(?! after)/i);
    expect(html).not.toMatch(/about \d/); // exactXlm, never approxXlm
  });

  test('a zero read with no entry is still undetermined, not "none"', async () => {
    const zero: AllowanceChain = {
      readAllowance: async () => ({
        amountStroops: '0',
        liveUntilLedger: null,
        observedAtLedger: 5,
      }),
      buildRevoke: async () => 'X',
    };
    const html = text(readHtml(await readAllowance(ME, { spender: SPENDER, chain: zero })));
    expect(html).toContain('undetermined');
    expect(html).toContain('0 XLM · 0 stroops');
    expect(html).not.toMatch(/\bnone\b/i);
  });

  test('a read that throws is reported, not turned into zero', async () => {
    const broken: AllowanceChain = {
      readAllowance: async () => {
        throw new Error('rpc down');
      },
      buildRevoke: async () => 'X',
    };
    const read = await readAllowance(ME, { spender: SPENDER, chain: broken });
    expect(read).toEqual({ kind: 'read-failed', detail: 'rpc down' });
    expect(text(readHtml(read))).not.toContain('0 XLM');
  });
});

describe('the revoke flow', () => {
  const deps = (over: { w?: Wallet; m?: ChainPort } = {}) => {
    const c = allowanceChain();
    const w = (over.w ?? wallet()) as Wallet & { asked?: unknown[] };
    const m = (over.m ?? money()) as ChainPort & { sent: string[] };
    return {
      c,
      w,
      m,
      r: createRevoker({
        wallet: w,
        spender: SPENDER,
        allowanceChain: c,
        moneyChain: m,
        sleep: noSleep,
      }),
    };
  };

  test('builds approve(0) for (me, spender), signs with NETWORK.passphrase, sends once', async () => {
    const { c, w, m, r } = deps();
    expect(r.available).toBe(true);
    expect(await r.revoke(ME)).toEqual({ hash: 'H1', ledger: 9 });
    expect(c.builds).toEqual([[ME, SPENDER]]);
    expect((w as Wallet & { asked: unknown[] }).asked).toEqual([
      { xdr: 'prepared:REVOKE', opts: { networkPassphrase: NETWORK.passphrase, address: ME } },
    ]);
    expect(m.sent).toEqual(['signed:prepared:REVOKE']);
  });

  test.each([
    ['possibly-signed', { w: wallet({ signTransaction: async () => ({ kind: 'timeout' }) }) }],
    ['pending', { m: money({ status: async () => ({ status: 'NOT_FOUND' }) }) }],
    [
      'pending (status throws after send returned H1)',
      {
        m: money({
          status: async () => {
            throw new Error('read-back failed');
          },
        }),
      },
    ],
    [
      'submit-failed',
      { m: money({ send: async () => ({ kind: 'submit-failed', detail: 'ERROR' }) }) },
    ],
    [
      'failed-on-chain',
      { m: money({ status: async () => ({ status: 'FAILED', detail: 'txFailed' }) }) },
    ],
  ])('after %s it never sends again', async (_name, over) => {
    const { m, r } = deps(over as { w?: Wallet; m?: ChainPort });
    const first = await r.revoke(ME);
    expect('kind' in first).toBe(true);
    expect(r.available).toBe(false);
    const sentBefore = m.sent.length;
    expect(sentBefore).toBeLessThanOrEqual(1);
    expect(await r.revoke(ME)).toEqual({ kind: 'already-sent' });
    expect(m.sent.length).toBe(sentBefore);
  });

  test('status throwing after H1: pending with the hash, send called exactly once', async () => {
    const { m, r } = deps({
      m: money({
        status: async () => {
          throw new Error('x');
        },
      }),
    });
    expect(await r.revoke(ME)).toEqual({ kind: 'pending', hash: 'H1' });
    expect(m.sent).toHaveLength(1);
  });

  test('rejected is the user saying no: nothing sent, asking again is allowed', async () => {
    const { m, r } = deps({ w: wallet({ signTransaction: async () => ({ kind: 'rejected' }) }) });
    expect(await r.revoke(ME)).toEqual({ kind: 'rejected' });
    expect(m.sent).toEqual([]);
    expect(r.available).toBe(true);
  });

  test.each([
    ['simulation-failed', { kind: 'simulation-failed', detail: 'd' }],
    ['restore-required', { kind: 'restore-required', detail: 'd' }],
  ])('%s sends nothing and leaves revoke available', async (_n, failure) => {
    const { m, r } = deps({ m: money({ prepare: async () => failure as never }) });
    expect(await r.revoke(ME)).toEqual(failure);
    expect(m.sent).toEqual([]);
    expect(r.available).toBe(true);
  });
});

describe('every outcome renders distinctly', () => {
  const outcomes: RevokeOutcome[] = [
    { hash: 'H1', ledger: 9 },
    { kind: 'simulation-failed', detail: 'd' },
    { kind: 'restore-required', detail: 'd' },
    { kind: 'possibly-signed' },
    { kind: 'submit-failed', detail: 'd' },
    { kind: 'failed-on-chain', hash: 'H1', detail: 'd' },
    { kind: 'pending', hash: 'H1' },
    { kind: 'rejected' },
    { kind: 'spender-unset' },
    { kind: 'already-sent' },
    { kind: 'build-failed', detail: 'd' },
    { kind: 'not-installed' },
    { kind: 'locked' },
    { kind: 'not-connected' },
    { kind: 'wrong-network', reported: 'x' },
    { kind: 'account-mismatch', expected: ME, reported: SPENDER },
    { kind: 'unavailable', detail: 'd' },
    { kind: 'timeout' },
  ];

  test('each kind has its own sentence', () => {
    const rendered = outcomes.map((o) => text(revokeOutcomeHtml(o)));
    expect(new Set(rendered).size).toBe(outcomes.length);
    for (const r of rendered) expect(r).not.toMatch(/undefined|NaN|\[object/);
  });

  test('rejected reads as a choice, not a failure', () => {
    const html = revokeOutcomeHtml({ kind: 'rejected' });
    expect(html).toContain('panel note');
    expect(text(html)).toContain('You declined');
  });

  test('possibly-signed and pending say no second send, and pending keeps the hash', () => {
    expect(text(revokeOutcomeHtml({ kind: 'possibly-signed' }))).toContain('will not send another');
    const pending = text(revokeOutcomeHtml({ kind: 'pending', hash: 'H1' }));
    expect(pending).toContain('H1');
    expect(pending).toContain('undetermined');
    expect(pending).toContain('will not send another');
  });

  test('the unset-spender sentence is the one the read panel shows', () => {
    expect(text(revokeOutcomeHtml({ kind: 'spender-unset' }))).toContain(SPENDER_UNSET_TEXT);
  });
});
