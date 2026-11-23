/** PH2-E3-05 § C and D: standing line, review panel, read-back, step D. Pure, no network. */
import { describe, expect, test } from 'vitest';
import type { ReadResult } from '../src/lib/allowance';
import { estimateAllowanceCap } from '../src/lib/allowance-cap';
import type { CapRow } from '../src/lib/allowance-candidates';
import {
  BUDGET_RULE_TEXT,
  THRESHOLD_UNPUBLISHED_TEXT,
  autopilotOnOutcomeHtml,
  autopilotRowsHtml,
  budgetProblem,
  coverageSentence,
  defaultBudget,
  floorFrom,
  liveCovers,
  parseStroops,
  readBack,
  readBackHtml,
  reviewPanelHtml,
  standingLineHtml,
} from '../src/lib/allowance-review';
import type { AllowanceHistory, AllowanceState } from '../src/lib/allowance-status';
import { SPENDER_UNSET_TEXT } from '../src/lib/allowance-view';
import { autopilotOnBody, turnAutopilotOn } from '../src/lib/autopilot-on';
import type { WatchItem } from '../src/lib/watchlist-view';
import { A, item } from './fixtures/watchlist-example';

const NOW = new Date('2026-11-23T00:00:00Z');
const SPENDER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, '')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ');

const read = (amountStroops: string, liveUntilLedger: number | null): ReadResult => ({
  kind: 'read',
  spender: SPENDER,
  raw: { amountStroops, liveUntilLedger, observedAtLedger: 5_400_000 },
});

const history = (status: AllowanceState['status']): AllowanceHistory => ({
  kind: 'state',
  state: {
    network: 'testnet',
    account: SPENDER,
    spender: SPENDER,
    amountStroops: '0',
    liveUntilLedger: null,
    status,
    lastKnown:
      status === 'expired'
        ? { amountStroops: '100', liveUntilLedger: 5_300_000, observedAtLedger: 5_000_000 }
        : null,
    balanceStroops: '0',
    observedAtLedger: 5_400_000,
    observedAt: '2026-11-23T00:00:00Z',
    expiresAtEstimate: null,
  },
});

const row = (over: Partial<CapRow> = {}): CapRow => ({
  item: { ...item(A), autopilot: { enabled: false } } as WatchItem,
  checked: true,
  rent: { kind: 'ok', stroops: 103_849n, atLedger: 5_400_000 },
  thresholdLedgers: 17_280,
  extendToLedgers: 518_400,
  ...over,
});

describe('standing line', () => {
  test('every read has one sentence, and none is healthy', () => {
    const cases = [
      standingLineHtml({ kind: 'not-connected' }),
      standingLineHtml({ kind: 'reading' }),
      standingLineHtml({ kind: 'read', read: { kind: 'spender-unset' } }),
      standingLineHtml({ kind: 'read', read: { kind: 'read-failed', detail: 'rpc down' } }),
      standingLineHtml({ kind: 'read', read: read('1080822', 8_510_399) }, NOW),
      standingLineHtml({ kind: 'read', read: read('0', null), history: history('expired') }),
      standingLineHtml({ kind: 'read', read: read('0', null), history: history('revoked') }),
      standingLineHtml({ kind: 'read', read: read('0', null) }),
    ].map(text);
    expect(cases[0]).toBe('Connect a wallet to read its allowance.');
    expect(cases[1]).toContain('reading…');
    expect(cases[2]).toContain(SPENDER_UNSET_TEXT);
    expect(cases[3]).toContain('The allowance could not be read. (rpc down)');
    expect(cases[4]).toContain('0.1080822 XLM');
    expect(cases[4]).toContain('1,080,822 stroops');
    expect(cases[4]).toContain('ledger 8,510,399');
    expect(cases[5]).toContain('Stopped. The allowance expired at ledger 5,300,000.');
    expect(cases[6]).toContain('Stopped. The allowance was revoked.');
    expect(cases[7]).toContain('undetermined');
    expect(cases.join(' ')).not.toMatch(/healthy/);
  });

  test('a live amount has no chip: an allowance is a permission, not health', () => {
    expect(standingLineHtml({ kind: 'read', read: read('5', 8_510_399) }, NOW)).not.toContain(
      'chip',
    );
  });
});

describe('coverage sentence', () => {
  test('ledgers first, days as the estimate, the end ledger only when known', () => {
    const s = coverageSentence(row(), 2n, 8_510_399)!;
    expect(s).toContain('One extend adds about 501,120 ledgers');
    expect(s).toContain('~29 days');
    expect(s).toContain('so 2 extends cover about 1,002,240 ledgers.');
    expect(s).toContain('The allowance itself ends at ledger 8,510,399.');
    expect(coverageSentence(row(), 2n)).not.toContain('ends at ledger');
  });

  test('absent, not guessed, without usable settings or a number of extends', () => {
    expect(coverageSentence(row(), undefined)).toBeUndefined();
    expect(coverageSentence(row({ thresholdLedgers: undefined }), 2n)).toBeUndefined();
    expect(coverageSentence(row({ extendToLedgers: 100 }), 2n)).toBeUndefined();
  });
});

describe('review panel', () => {
  const cap = estimateAllowanceCap(
    [{ simulatedRentStroops: 103_849n, hostedActions: 2n }],
    100_000n,
  );

  test('the cap is the one serif figure; rent, fee and margin are three lines', () => {
    expect(cap.amountStroops).toBe(457_698n);
    const html = reviewPanelHtml(
      {
        cap,
        currentAmountStroops: '0',
        liveUntilLedger: 8_510_399,
        observedAtLedger: 5_400_000,
        spender: SPENDER,
      },
      NOW,
    );
    expect(html.match(/cap-figure/g)).toHaveLength(1);
    const t = text(html);
    expect(t).toContain('0.0457698 XLM');
    expect(t).toContain('Rent 207,698 stroops');
    expect(t).toContain('Evergreen fee 50,000 stroops');
    expect(t).toContain('Retry margin 200,000 stroops');
    expect(t).toContain('is replaced by this cap. It is not added to it.');
    expect(t).toContain('ledger 8,510,399');
    expect(t).toContain('The ledger is the rule. The date is an estimate.');
    // The spender is the full address, never shortened.
    expect(t).toContain(SPENDER);
    expect(t).toContain('never access to a contract');
  });

  test('before the margin, the spender and the read: every line says why, no figure', () => {
    const margin = estimateAllowanceCap(
      [{ simulatedRentStroops: 1n, hostedActions: 2n }],
      undefined,
    );
    const html = reviewPanelHtml({
      cap: margin,
      currentAmountStroops: undefined,
      liveUntilLedger: undefined,
      observedAtLedger: undefined,
      spender: undefined,
    });
    expect(html).not.toContain('cap-figure');
    const t = text(html);
    expect(t).toContain('The retry margin is not set');
    expect(t).toContain('Retry margin: not set');
    expect(t).toContain('Not known until the allowance is read.');
    expect(t).toContain(SPENDER_UNSET_TEXT);
    expect(t).toContain('Whatever it is, this cap replaces it.');
  });
});

describe('read-back', () => {
  const signed = { amountStroops: 457_698n, liveUntilLedger: 8_510_399 };

  test('only the same amount and the same ledger match', () => {
    expect(readBack(read('457698', 8_510_399), signed)).toEqual({ kind: 'matches' });
    expect(readBack(read('457697', 8_510_399), signed).kind).toBe('differs');
    expect(readBack(read('457698', 8_510_398), signed).kind).toBe('differs');
    expect(readBack({ kind: 'read-failed', detail: 'x' }, signed).kind).toBe('unread');
  });

  test('a difference says not to turn autopilot on, with both values', () => {
    const t = text(readBackHtml(readBack(read('1', 9), signed), signed));
    expect(t).toContain('Do not turn on autopilot.');
    expect(t).toContain('457,698 stroops');
    expect(t).toContain('ledger 9');
  });

  test('a live allowance covers the cap only when it is at least the cap', () => {
    const cap = estimateAllowanceCap([{ simulatedRentStroops: 1n, hostedActions: 1n }], 0n);
    expect(cap.amountStroops).toBe(25_001n);
    expect(liveCovers(read('25001', 8_510_399), cap)).toBe(true);
    expect(liveCovers(read('25000', 8_510_399), cap)).toBe(false);
    expect(liveCovers(read('25001', 5_400_000), cap)).toBe(false);
    expect(liveCovers({ kind: 'spender-unset' }, cap)).toBe(false);
  });
});

describe('step D', () => {
  test('per job is the pull; per 30 days is per job × extends, capped at the cap', () => {
    expect(defaultBudget(103_849n, 2n, 100_000n, 457_698n)).toEqual({
      perJobMaxStroops: 228_849n,
      per30DaysMaxStroops: 457_698n,
    });
    expect(defaultBudget(103_849n, 2n, 100_000n, 300_000n)?.per30DaysMaxStroops).toBe(300_000n);
    expect(defaultBudget(103_849n, 2n, undefined, 457_698n)).toBeUndefined();
  });

  test('the API budget rule is said before the request', () => {
    expect(parseStroops('1,000')).toBe(1000n);
    expect(parseStroops('0')).toBeUndefined();
    expect(budgetProblem(2n, 1n)).toBe(BUDGET_RULE_TEXT);
    expect(budgetProblem(undefined, 1n)).toBe(BUDGET_RULE_TEXT);
    expect(budgetProblem(1n, 1n)).toBeUndefined();
    expect(autopilotRowsHtml([])).toContain(BUDGET_RULE_TEXT);
  });

  test('the floor is quoted from the API and offered, never applied', () => {
    const refusal = {
      kind: 'error',
      status: 422,
      code: 'THRESHOLD_BELOW_FLOOR',
      details: { floorLedgers: 4329 },
    } as const;
    expect(floorFrom(refusal)).toBe(4329);
    const t = text(autopilotOnOutcomeHtml(refusal));
    expect(t).toContain('The engine acts no earlier than 4,329 ledgers left. Use 4,329?');
    expect(autopilotOnOutcomeHtml(refusal)).toContain('data-auto-use-floor="4329"');
    expect(
      floorFrom({ kind: 'error', status: 422, code: 'THRESHOLD_BELOW_FLOOR' }),
    ).toBeUndefined();
  });

  test('503 says the threshold is unpublished and the allowance stays', () => {
    expect(
      text(autopilotOnOutcomeHtml({ kind: 'error', status: 503, code: 'UPSTREAM_UNAVAILABLE' })),
    ).toBe(THRESHOLD_UNPUBLISHED_TEXT);
    expect(text(autopilotOnOutcomeHtml({ kind: 'on' }))).toBe('On.');
  });

  test('one PATCH per contract with exactly the settings shown', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fetchImpl = async (url: string, init?: RequestInit) => {
      calls.push({ url, ...(init ? { init } : {}) });
      const body = url.endsWith('/me') ? { csrfToken: 'tok' } : { ok: true };
      return new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    };
    const settings = {
      payerWallet: SPENDER,
      thresholdLedgers: 17_280,
      extendToLedgers: 518_400,
      perJobMaxStroops: 228_849n,
      per30DaysMaxStroops: 457_698n,
    };
    expect(await turnAutopilotOn('testnet', A, settings, fetchImpl)).toEqual({ kind: 'on' });
    expect(calls).toHaveLength(2);
    expect(calls[1]!.url).toBe(`/api/v1/watchlist/testnet/${A}`);
    expect(calls[1]!.init?.method).toBe('PATCH');
    expect((calls[1]!.init?.headers as Record<string, string>)['X-Evergreen-CSRF']).toBe('tok');
    expect(JSON.parse(calls[1]!.init?.body as string)).toEqual({
      autopilot: {
        enabled: true,
        payerWallet: SPENDER,
        thresholdLedgers: 17_280,
        extendToLedgers: 518_400,
        budget: { perJobMaxStroops: '228849', per30DaysMaxStroops: '457698' },
      },
    });
    expect(autopilotOnBody(settings)).toBe(calls[1]!.init?.body);
  });

  test('the floor reaches the page through the API envelope', async () => {
    const fetchImpl = async (url: string) =>
      new Response(
        JSON.stringify(
          url.endsWith('/me')
            ? { csrfToken: 'tok' }
            : {
                error: {
                  code: 'THRESHOLD_BELOW_FLOOR',
                  message: 'm',
                  retryable: false,
                  details: { floorLedgers: 4329 },
                },
              },
        ),
        {
          status: url.endsWith('/me') ? 200 : 422,
          headers: { 'Content-Type': 'application/json' },
        },
      );
    const outcome = await turnAutopilotOn(
      'testnet',
      A,
      {
        payerWallet: SPENDER,
        thresholdLedgers: 100,
        extendToLedgers: 518_400,
        perJobMaxStroops: 1n,
        per30DaysMaxStroops: 1n,
      },
      fetchImpl,
    );
    expect(floorFrom(outcome)).toBe(4329);
  });
});
