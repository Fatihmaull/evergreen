/**
 * Extend now, option A (Fatih, 2026-11-24): who gets the button, the estimate
 * the confirmation shows, the allowance check that gates Confirm, and the one
 * request it sends.
 */
import { describe, expect, test } from 'vitest';
import {
  coverage,
  estimateExtendNow,
  extendNowDialogHtml,
  extendNowGate,
  extendNowPanelHtml,
  extendNowResult,
  requestExtendNow,
} from '../src/lib/extend-now';
import { panelHtml } from '../src/lib/overview-view';
import { rowFor, type WatchItem } from '../src/lib/watchlist-view';
import { A, B, item } from './fixtures/watchlist-example';

const NOW = new Date('2026-10-19T12:00:00Z');
const PAYER = 'GDU3' + 'A'.repeat(52);
const on = (over: Partial<WatchItem['extendNow']> = {}): WatchItem =>
  item(A, {
    label: 'payments-v2',
    autopilot: {
      enabled: true,
      payerWallet: PAYER,
      thresholdLedgers: 4329,
      extendToLedgers: 20_000,
    },
    extendNow: {
      enabled: true,
      limitPerDay: 1,
      usedToday: 0,
      resetsAt: '2026-10-20T12:00:00Z',
      ...over,
    },
  });

describe('who gets the button', () => {
  test('🔴 flag on, autopilot on, testnet: ready, paid by the item’s payer', () => {
    expect(extendNowGate(rowFor(on(), NOW))).toEqual({ kind: 'ready', payer: PAYER });
    expect(panelHtml(rowFor(on(), NOW))).toContain(`data-extend-now="${A}"`);
  });
  test('🔴 flag off or absent (older API): no button at all', () => {
    expect(extendNowPanelHtml(rowFor(on({ enabled: false }), NOW))).toBe('');
    const old = on();
    const rest = { limitPerDay: 1, usedToday: 0, resetsAt: old.extendNow.resetsAt };
    expect(extendNowPanelHtml(rowFor({ ...old, extendNow: rest }, NOW))).toBe('');
  });
  test('🔴 autopilot off: no button, the XLM has no path to move through', () => {
    const r = rowFor({ ...on(), autopilot: { enabled: false } }, NOW);
    expect(extendNowGate(r).kind).toBe('hidden');
    expect(panelHtml(r)).not.toContain('data-extend-now');
  });
  test('🔴 used today: the button is disabled and says when it is back', () => {
    const html = extendNowPanelHtml(rowFor(on({ usedToday: 1 }), NOW));
    expect(html).toContain('<button type="button" disabled>Extend now</button>');
    expect(html).toContain('20 Oct, 12:00 UTC');
    expect(html).not.toContain('data-extend-now');
  });
  test('archived: no button, it must be restored first', () => {
    const b = item(B, {
      autopilot: { enabled: true, payerWallet: PAYER },
      extendNow: { enabled: true, limitPerDay: 1, usedToday: 0, resetsAt: '' },
    });
    const r = rowFor(b, NOW);
    if (r.binding.state !== 'expired') return; // fixture B is archived at the snapshot
    expect(extendNowGate(r).kind).toBe('archived');
    expect(extendNowPanelHtml(r)).not.toContain('data-extend-now');
  });
});

describe('the estimate', () => {
  test('🔴 rent + max(2% of rent, 25,000) + 100,000 margin, the sum the engine pulls', () => {
    // 2% of 1,000,000 is 20,000, so the 25,000 minimum binds.
    expect(estimateExtendNow(1_000_000n)).toEqual({
      rentStroops: 1_000_000n,
      feeStroops: 25_000n,
      marginStroops: 100_000n,
      totalStroops: 1_125_000n,
    });
    // 2% of 10,000,000 is 200,000, above the minimum.
    expect(estimateExtendNow(10_000_000n)?.totalStroops).toBe(10_300_000n);
  });
});

describe('the allowance gate', () => {
  const read = (amount: string, liveUntil: number | null = 200, at = 100) =>
    ({
      kind: 'read',
      spender: 'G' + 'S'.repeat(55),
      raw: { amountStroops: amount, liveUntilLedger: liveUntil, observedAtLedger: at },
    }) as const;
  test('🔴 covered only when a live allowance is at least the pull', () => {
    expect(coverage(1_125_000n, read('1125000')).kind).toBe('covered');
    expect(coverage(1_125_000n, read('1124999')).kind).toBe('short');
  });
  test('🔴 unread is never covered; expired or zero is none', () => {
    expect(coverage(1n, undefined).kind).toBe('unread');
    expect(coverage(1n, { kind: 'read-failed', detail: 'x' }).kind).toBe('unread');
    expect(coverage(1n, read('5', 100, 100)).kind).toBe('none');
    expect(coverage(1n, read('0')).kind).toBe('none');
  });
  test('🔴 Confirm is disabled unless covered, and the dialog says why', () => {
    const e = estimateExtendNow(1_000_000n)!;
    const base = { phase: 'confirm', estimate: e, extendByLedgers: 20_000, payer: PAYER } as const;
    const ok = extendNowDialogHtml(on(), {
      ...base,
      coverage: { kind: 'covered', allowanceStroops: 5_000_000n },
    });
    expect(ok).toMatch(/<button type="button" data-en-confirm>Confirm Extend now<\/button>/);
    expect(ok).toContain('0.1125000 XLM');
    expect(ok).toContain('runs within about 15 minutes');
    const short = extendNowDialogHtml(on(), {
      ...base,
      coverage: { kind: 'short', allowanceStroops: 1n },
    });
    expect(short).toContain('data-en-confirm disabled');
    expect(short).toContain('Raise the allowance');
    expect(extendNowDialogHtml(on(), { ...base, coverage: { kind: 'unread' } })).toContain(
      'data-en-confirm disabled',
    );
  });
  test('while sending, Confirm is disabled so a double click sends once', () => {
    const e = estimateExtendNow(1_000_000n)!;
    const html = extendNowDialogHtml(on(), {
      phase: 'confirm',
      estimate: e,
      extendByLedgers: 20_000,
      payer: PAYER,
      coverage: { kind: 'covered', allowanceStroops: 5_000_000n },
      sending: true,
    });
    expect(html).toContain('data-en-confirm disabled>Queuing…');
  });
});

describe('the request', () => {
  test('🔴 POST /jobs with the CSRF token, the one key and the option-A body', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const out = await requestExtendNow(A, 'k-1', async (url, init) => {
      calls.push({ url, ...(init === undefined ? {} : { init }) });
      return url.endsWith('/me')
        ? json(200, { csrfToken: 't0k' })
        : json(202, { job: { id: 'j-1' } });
    });
    expect(out.kind).toBe('ok');
    const post = calls[1]!;
    expect(post.url).toBe('/api/v1/jobs');
    expect(post.init?.method).toBe('POST');
    expect(post.init?.headers).toMatchObject({
      'X-Evergreen-CSRF': 't0k',
      'Idempotency-Key': 'k-1',
    });
    expect(JSON.parse(String(post.init?.body))).toEqual({
      network: 'testnet',
      contractId: A,
      kind: 'extend-now',
    });
    expect(extendNowResult(out)).toEqual({ phase: 'queued', jobId: 'j-1', again: false });
  });
  test('the same key answered 200 is the same job, said so', () => {
    expect(extendNowResult({ kind: 'ok', status: 200, data: { job: { id: 'j-1' } } })).toEqual({
      phase: 'queued',
      jobId: 'j-1',
      again: true,
    });
  });
  test('🔴 refusals say nothing was queued, with the reset time for the daily limit', () => {
    const limit = extendNowResult({
      kind: 'error',
      status: 429,
      code: 'DAILY_LIMIT_REACHED',
      details: { limit: 1, used: 1, resetsAt: '2026-11-25T16:05:00.000Z' },
    });
    expect(limit).toMatchObject({ phase: 'refused' });
    expect(JSON.stringify(limit)).toContain('25 Nov, 16:05 UTC');
    expect(
      extendNowResult({ kind: 'error', status: 403, code: 'EXTEND_NOW_DISABLED' }),
    ).toMatchObject({
      phase: 'refused',
    });
    // No answer is not "nothing happened": the person is sent to Activity.
    expect(JSON.stringify(extendNowResult({ kind: 'unavailable', reason: 'network' }))).toContain(
      'Check Activity',
    );
  });
});
