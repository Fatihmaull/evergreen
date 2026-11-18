/**
 * PH2-E3-05, the part that does not need a published spender: the cap
 * estimate, the approve guards, the reminder dates, and an expired history
 * reading as stopped.
 *
 * The guards are the mutation points. A fee that is a bare percentage, a
 * margin filled in with a guess, an approve of zero, an expiry one ledger
 * past the measured ceiling, or a status of expired rendered as anything but
 * stopped, fails here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test, vi } from 'vitest';
import { hostedFeeStroops, pullAmountStroops } from '../../../packages/core/src/index';

const fake = vi.hoisted(() => ({ calls: 0 }));
vi.mock('../src/lib/evergreen', () => ({
  verifiedServer: async () => {
    fake.calls++;
    throw new Error('the real RPC must not be reached in these tests');
  },
}));

import { approveScVals, type AllowanceChain } from '../src/lib/allowance';
import { createApprover } from '../src/lib/allowance-approve';
import {
  ALLOWANCE_RETRY_MARGIN_STROOPS,
  MAX_ALLOWANCE_EXTENSION_LEDGERS,
  actionFitsBudget,
  estimateAllowanceCap,
  parseBudgetLines,
  parseHostedActions,
  parseRentLines,
  refusalForApprove,
  reminderInstants,
} from '../src/lib/allowance-cap';
import { parseAllowanceState, readAllowanceHistory } from '../src/lib/allowance-status';
import {
  approveDisclosureHtml,
  budgetNoteHtml,
  capHtml,
  reminderHtml,
  standingHtml,
} from '../src/lib/allowance-view';
import { exactXlm, approxDate } from '../src/lib/format';
import { approxDateOfLedger, ledgerInstant } from '../src/lib/view';
import type { Wallet } from '../src/lib/wallet';
import type { ChainPort } from '../src/lib/wallet-money';
import { NETWORK } from '../src/lib/network';
import type { FetchLike } from '../src/lib/api';

const ME = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
const SPENDER = 'GBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB';
const NOW = new Date('2026-11-18T03:00:00Z');
const OBSERVED = 5_191_523;

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, ' ')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ');

function wallet(): Wallet & { asked: unknown[] } {
  const asked: unknown[] = [];
  return {
    asked,
    connect: async () => ({ account: ME }),
    assertTestnet: async () => true,
    signTransaction: async (xdr, opts) => {
      asked.push({ xdr, opts });
      return { signedXdr: `signed:${xdr}` };
    },
  };
}

function chain(amount = '100'): AllowanceChain & { approved: unknown[][] } {
  const c = {
    approved: [] as unknown[][],
    readAllowance: async () => ({
      amountStroops: amount,
      liveUntilLedger: OBSERVED + 10,
      observedAtLedger: OBSERVED,
    }),
    buildRevoke: async () => {
      throw new Error('approve tests must not build a revoke');
    },
    buildApprove: async (...args: unknown[]) => {
      c.approved.push(args);
      return 'APPROVE';
    },
  };
  return c;
}

function money(): ChainPort & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    prepare: async (x) => ({ xdr: `prepared:${x}` }),
    send: async (x) => {
      sent.push(x);
      return { hash: 'H1' };
    },
    status: async () => ({ status: 'SUCCESS', ledger: 9 }),
  };
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

function historyBody(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    network: 'testnet',
    account: ME,
    spender: SPENDER,
    amountStroops: '0',
    liveUntilLedger: null,
    status: 'expired',
    lastKnown: {
      amountStroops: '500000000',
      liveUntilLedger: 1_100_000,
      observedAtLedger: 1_000_000,
    },
    balanceStroops: '10000000',
    observedAtLedger: 1_200_000,
    observedAt: '2026-11-18T00:00:00Z',
    expiresAtEstimate: '2026-11-01T00:00:00Z',
    ...over,
  };
}

describe('the cap estimate', () => {
  test('the margin ships unset, and an unset margin is not an amount', () => {
    expect(ALLOWANCE_RETRY_MARGIN_STROOPS).toBeUndefined();
    const src = readFileSync(
      fileURLToPath(new URL('../src/lib/allowance-cap.ts', import.meta.url)),
      'utf8',
    );
    expect(src).toContain('ALLOWANCE_RETRY_MARGIN_STROOPS: bigint | undefined = undefined');
    const estimate = estimateAllowanceCap([{ simulatedRentStroops: 1n, hostedActions: 3n }]);
    expect(estimate.amountStroops).toBeUndefined();
    expect(estimate.lines[0]?.perActionFeeStroops).toBe(25_000n);
    expect(estimate.feeStroops).toBe(75_000n);
    expect(estimate.rentStroops).toBe(3n);
    const html = text(capHtml(estimate));
    expect(html).toContain('undetermined');
    expect(html).toContain(exactXlm(1n).stroops);
    expect(html).toContain(exactXlm(25_000n).stroops);
    expect(html).toContain(exactXlm(75_000n).stroops);
    expect(html).not.toContain(exactXlm(25_001n).stroops);
    expect(html).not.toMatch(/protected/i);
  });

  test('the fee minimum binds once per extend, and the amount is the engine pull', () => {
    const rent = 10_000_000n;
    const margin = 6_100n;
    const actions = 4n;
    const estimate = estimateAllowanceCap(
      [{ simulatedRentStroops: rent, hostedActions: actions }],
      margin,
    );
    const pull = pullAmountStroops({ simulatedRentStroops: rent, retryMarginStroops: margin });
    expect(pull).toBeDefined();
    expect(estimate.feeStroops).toBe(hostedFeeStroops(rent) * actions);
    expect(estimate.amountStroops).toBe(pull!.totalStroops * actions);
    expect(estimate.rentStroops + estimate.feeStroops + margin * actions).toBe(
      estimate.amountStroops,
    );
    const html = text(capHtml(estimate));
    expect(html).toContain('replaces the cap');
    expect(html).toContain(exactXlm(estimate.rentStroops).stroops);
    expect(html).toContain(exactXlm(estimate.feeStroops).stroops);
    expect(html).toContain(exactXlm(estimate.amountStroops!).stroops);
  });

  test('a per-job budget below the rent and the fee can never run, and the two stay separate', () => {
    const fit = actionFitsBudget(25_000n, 1n, undefined);
    expect(fit.kind).toBe('never');
    if (fit.kind !== 'never') return;
    const html = text(budgetNoteHtml(fit));
    expect(html).toContain('never run');
    expect(html).toContain(exactXlm(fit.perActionRentStroops).stroops);
    expect(html).toContain(exactXlm(fit.perActionFeeStroops).stroops);
    expect(html).not.toContain(
      exactXlm(fit.perActionRentStroops + fit.perActionFeeStroops).stroops,
    );
    expect(actionFitsBudget(25_001n, 1n, undefined).kind).toBe('undetermined');
    expect(actionFitsBudget(25_001n, 1n, 1n).kind).toBe('short');
    expect(actionFitsBudget(25_002n, 1n, 1n).kind).toBe('covers');
  });

  test('blank budgets are absent, and a mismatched list is refused', () => {
    expect(parseBudgetLines('  \n', 2)).toEqual({ ok: true, budgets: undefined });
    expect(parseBudgetLines('10\n', 2).ok).toBe(false);
    expect(parseRentLines('')).toMatchObject({ ok: false });
    expect(parseRentLines('1\nnope').ok).toBe(false);
    expect(parseRentLines('1\n2')).toEqual({ ok: true, rents: [1n, 2n] });
    expect(parseHostedActions('0')).toBeUndefined();
    expect(parseHostedActions('')).toBeUndefined();
    expect(parseHostedActions('3')).toBe(3n);
  });
});

describe('approve guards', () => {
  const terms = {
    spender: SPENDER,
    amountStroops: 10n,
    liveUntilLedger: OBSERVED + MAX_ALLOWANCE_EXTENSION_LEDGERS,
    observedAtLedger: OBSERVED,
  };

  test('the measured ceiling is the last ledger accepted, and zero is not a grant', () => {
    expect(refusalForApprove(terms)).toBeUndefined();
    expect(
      refusalForApprove({
        ...terms,
        liveUntilLedger: OBSERVED + MAX_ALLOWANCE_EXTENSION_LEDGERS + 1,
      }),
    ).toBe('expiry-too-far');
    expect(refusalForApprove({ ...terms, spender: undefined })).toBe('spender-unset');
    expect(refusalForApprove({ ...terms, amountStroops: undefined })).toBe('cap-undetermined');
    expect(refusalForApprove({ ...terms, amountStroops: 0n })).toBe('amount-not-positive');
    expect(refusalForApprove({ ...terms, liveUntilLedger: OBSERVED })).toBe(
      'expiry-not-after-read',
    );
    expect(() => approveScVals(0n, OBSERVED)).toThrow(/positive/);
    expect(approveScVals(5n, 10)).toEqual({ amount: 5n, liveUntil: 10 });
  });

  test('spender unset builds, signs and sends nothing', async () => {
    const w = wallet();
    const c = chain();
    const m = money();
    const before = fake.calls;
    const approver = createApprover({
      wallet: w,
      allowanceChain: c,
      moneyChain: m,
      sleep: async () => {},
    });
    expect(approver.available).toBe(false);
    expect(
      await approver.approve(ME, {
        amountStroops: 10n,
        liveUntilLedger: terms.liveUntilLedger,
        observedAtLedger: OBSERVED,
        shownCurrentStroops: '100',
      }),
    ).toEqual({ kind: 'spender-unset' });
    expect([c.approved.length, w.asked.length, m.sent.length, fake.calls]).toEqual([
      0,
      0,
      0,
      before,
    ]);
  });

  test('a stale chain read is not signed', async () => {
    const w = wallet();
    const c = chain('999');
    const m = money();
    const approver = createApprover({
      wallet: w,
      spender: SPENDER,
      allowanceChain: c,
      moneyChain: m,
      sleep: async () => {},
    });
    expect(
      await approver.approve(ME, {
        amountStroops: 10n,
        liveUntilLedger: terms.liveUntilLedger,
        observedAtLedger: OBSERVED,
        shownCurrentStroops: '100',
      }),
    ).toEqual({ kind: 'stale-read', currentStroops: '999' });
    expect(c.approved).toEqual([]);
    expect(w.asked).toEqual([]);
    expect(m.sent).toEqual([]);
  });

  test('signs the disclosed amount and expiry once, then locks', async () => {
    const w = wallet();
    const c = chain('100');
    const m = money();
    const approver = createApprover({
      wallet: w,
      spender: SPENDER,
      allowanceChain: c,
      moneyChain: m,
      sleep: async () => {},
    });
    const ask = {
      amountStroops: 10n,
      liveUntilLedger: terms.liveUntilLedger,
      observedAtLedger: OBSERVED,
      shownCurrentStroops: '100',
    };
    expect(await approver.approve(ME, ask)).toEqual({ hash: 'H1', ledger: 9 });
    expect(c.approved).toEqual([[ME, SPENDER, 10n, terms.liveUntilLedger]]);
    expect(w.asked).toEqual([
      { xdr: 'prepared:APPROVE', opts: { networkPassphrase: NETWORK.passphrase, address: ME } },
    ]);
    expect(m.sent).toEqual(['signed:prepared:APPROVE']);
    expect(await approver.approve(ME, ask)).toEqual({ kind: 'already-sent' });
    expect(c.approved).toHaveLength(1);
    const disclosure = text(
      approveDisclosureHtml(
        {
          amountStroops: 10n,
          spender: SPENDER,
          liveUntilLedger: terms.liveUntilLedger,
          observedAtLedger: OBSERVED,
          currentAmountStroops: '100',
          rentStroops: 4n,
          feeStroops: 25_000n,
        },
        NOW,
      ),
    );
    expect(disclosure).toContain('replaces');
    expect(disclosure).toContain('never access to a contract');
    expect(disclosure).toContain(exactXlm(10n).xlm);
    expect(disclosure).toContain(exactXlm(10n).stroops);
    expect(disclosure).toContain(exactXlm(4n).stroops);
    expect(disclosure).toContain(exactXlm(25_000n).stroops);
    expect(disclosure).toContain(`ledger ${terms.liveUntilLedger.toLocaleString('en-US')}`);
    expect(disclosure).not.toContain(exactXlm(25_004n).stroops);
  });

  test('an expiry past the ceiling never reaches the chain', async () => {
    const w = wallet();
    const c = chain();
    const m = money();
    const approver = createApprover({
      wallet: w,
      spender: SPENDER,
      allowanceChain: c,
      moneyChain: m,
      sleep: async () => {},
    });
    expect(
      await approver.approve(ME, {
        amountStroops: 10n,
        liveUntilLedger: OBSERVED + MAX_ALLOWANCE_EXTENSION_LEDGERS + 1,
        observedAtLedger: OBSERVED,
        shownCurrentStroops: '100',
      }),
    ).toEqual({ kind: 'expiry-too-far' });
    expect(c.approved).toEqual([]);
  });
});

describe('renewal reminders', () => {
  test('are 30, 7 and 1 days before the expiry, and absent when the expiry is not known', () => {
    const expiry = new Date('2026-12-31T00:00:00.000Z');
    const rows = reminderInstants(expiry);
    expect(rows.map((row) => row.daysBefore)).toEqual([30, 7, 1]);
    expect(rows.map((row) => row.at.toISOString())).toEqual([
      '2026-12-01T00:00:00.000Z',
      '2026-12-24T00:00:00.000Z',
      '2026-12-30T00:00:00.000Z',
    ]);
    const known = text(
      reminderHtml({ liveUntilLedger: OBSERVED + 100, observedAtLedger: OBSERVED }, NOW),
    );
    expect(known).toContain('30 days before');
    expect(known).toContain('7 days before');
    expect(known).toContain('1 day before');
    expect(known).toContain('does not send them');
    const at = ledgerInstant(OBSERVED + 100, OBSERVED, NOW);
    expect(at).toBeDefined();
    expect(known).toContain(approxDate(reminderInstants(at!)[0]!.at));
    expect(approxDateOfLedger(OBSERVED + 100, OBSERVED, NOW)).toBe(approxDate(at!));
    expect(text(reminderHtml(undefined, NOW))).toContain('undetermined');
    expect(text(reminderHtml(undefined, NOW))).not.toMatch(/~\w+ \d+/);
  });
});

describe('expired shows as stopped', () => {
  test('a parsed expired history is Stopped, with the recorded amount and ledger, and never protected', () => {
    const state = parseAllowanceState(historyBody(), ME);
    expect(state?.status).toBe('expired');
    const html = standingHtml({ kind: 'state', state: state! }, new Date('2026-11-18T03:04:00Z'));
    const plain = text(html);
    expect(plain).toContain('Stopped');
    expect(plain).toContain('Autopilot is stopped');
    expect(plain).toContain(exactXlm('500000000').xlm);
    expect(plain).toContain('ledger 1,100,000');
    expect(plain).toContain('17 days, 3 hours and 4 minutes');
    expect(plain).not.toMatch(/protected/i);
    expect(html).toContain('chip expired');
  });

  test('expired without a record, or a body that is not the spec, stays unread', () => {
    expect(parseAllowanceState(historyBody({ lastKnown: null }), ME)).toBeUndefined();
    expect(parseAllowanceState(historyBody({ network: 'mainnet' }), ME)).toBeUndefined();
    expect(parseAllowanceState(historyBody({ account: SPENDER }), ME)).toBeUndefined();
    expect(
      parseAllowanceState(
        historyBody({
          status: 'active',
          liveUntilLedger: null,
          amountStroops: '5',
          lastKnown: null,
        }),
        ME,
      ),
    ).toBeUndefined();
    const unread = text(standingHtml({ kind: 'unread', reason: 'unavailable' }));
    expect(unread).toContain('undetermined');
    expect(unread).not.toContain('Stopped');
    expect(unread).not.toMatch(/protected/i);
  });

  test('a missing route is unread, and a well-formed body is the state', async () => {
    const missing: FetchLike = async () =>
      new Response('<html>', { status: 404, headers: { 'Content-Type': 'text/html' } });
    expect(await readAllowanceHistory(ME, missing)).toEqual({
      kind: 'unread',
      reason: 'unavailable',
    });
    const signedOut: FetchLike = async () => json(401, { error: { code: 'UNAUTHENTICATED' } });
    expect(await readAllowanceHistory(ME, signedOut)).toEqual({
      kind: 'unread',
      reason: 'not-signed-in',
    });
    const ok: FetchLike = async (url) => {
      expect(url).toBe(`/api/v1/wallets/${ME}/allowance`);
      return json(200, historyBody());
    };
    const read = await readAllowanceHistory(ME, ok);
    expect(read.kind).toBe('state');
  });
});

describe('the page', () => {
  test('offers approve and the reminder schedule, with approve disabled and revoke still disabled', () => {
    const page = readFileSync(
      fileURLToPath(new URL('../src/pages/allowance.mjs', import.meta.url)),
      'utf8',
    );
    expect(page).toMatch(/id="revoke-button"[^>]*disabled/);
    expect(page).toMatch(/id="approve-button"[^>]*disabled/);
    expect(page).toContain('replaces the cap');
    expect(page).toContain('never access to a contract');
    expect(page).toContain('30, 7 and 1 days');
    expect(page).toContain('3,110,399');
    expect(page).not.toMatch(/protected/i);
    const src = readFileSync(
      fileURLToPath(new URL('../src/lib/allowance.ts', import.meta.url)),
      'utf8',
    );
    expect(src).toContain("nativeToScVal(0n, { type: 'i128' })");
    expect(src).toContain("nativeToScVal(terms.amount, { type: 'i128' })");
  });
});
