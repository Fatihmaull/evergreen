/**
 * PH2-E3-05 § A (components.md): the watchlist row's autopilot control.
 * Turn on goes to /allowance/; Turn off is a PATCH that leaves the allowance
 * on chain. No network.
 */
import { describe, expect, test } from 'vitest';
import type { FetchLike } from '../src/lib/api';
import { turnAutopilotOff } from '../src/lib/watchlist';
import {
  AUTOPILOT_OFF_TEXT,
  autopilotCell,
  autopilotOffOutcomeText,
  type PayerAllowance,
  type WatchItem,
} from '../src/lib/watchlist-view';
import { A, item } from './fixtures/watchlist-example';

const PAYER = 'GA2VPKMOGKHNIKK2BFVJYWDHDTOYUEZETHE74ZZQCSSCQHBTKKDTYQZL';
const off = (over: Partial<WatchItem> = {}): WatchItem =>
  ({ ...item(A), autopilot: { enabled: false }, ...over }) as WatchItem;
const on = (): WatchItem =>
  ({
    ...item(A),
    autopilot: {
      enabled: true,
      payerWallet: PAYER,
      thresholdLedgers: 17_280,
      extendToLedgers: 120_960,
    },
  }) as WatchItem;

describe('autopilot cell controls', () => {
  test('off on testnet offers Turn on, for this contract, and calls nothing itself', () => {
    const html = autopilotCell(off(), { linkedWallets: [PAYER] });
    expect(html).toContain('Off');
    expect(html).toContain('>Turn on autopilot</button>');
    expect(html).toContain(`data-autopilot-contract="${item(A).contractId}"`);
    expect(html).toContain('data-autopilot-network="testnet"');
  });

  test('off with the wallet list unknown still offers Turn on (the allowance page checks)', () => {
    expect(autopilotCell(off())).toContain('Turn on autopilot');
  });

  test('off with no linked wallet links sign-in instead of the button', () => {
    const html = autopilotCell(off(), { linkedWallets: [] });
    expect(html).toContain('href="/login/"');
    expect(html).toContain('Link a wallet first');
    expect(html).not.toContain('<button');
  });

  test('off on mainnet says testnet-only and offers nothing', () => {
    const html = autopilotCell(off({ network: 'mainnet' } as Partial<WatchItem>), {
      linkedWallets: [PAYER],
    });
    expect(html).toContain('testnet-only');
    expect(html).not.toContain('<button');
  });

  test('on offers Turn off, and the allowance part is undetermined, never healthy', () => {
    const html = autopilotCell(on(), { linkedWallets: [PAYER] });
    expect(html).toContain('>Turn off</button>');
    expect(html).toContain('chip undetermined');
    expect(html).toContain('Allowance not read yet.');
    expect(html).not.toContain('chip healthy');
    expect(html).not.toContain('Turn on autopilot');
  });

  test('the allowance part reads live, missing or undetermined (§ A)', () => {
    const at = (read: PayerAllowance) =>
      autopilotCell(on(), { linkedWallets: [PAYER], allowances: new Map([[PAYER, read]]) });
    const live = at({ kind: 'live', liveUntilLedger: 8_510_399, observedAtLedger: 5_400_000 });
    expect(live).toContain('allowance until ledger');
    expect(live).toContain('8,510,399');
    expect(live).not.toContain('chip');
    const missing = at({ kind: 'missing' });
    expect(missing).toContain('chip warning');
    expect(missing).toContain('allowance missing');
    expect(missing).toMatch(/href="\/allowance\/\?for=[^"]+">Approve an allowance →<\/a>/);
    const unread = at({ kind: 'unread' });
    expect(unread).toContain('chip undetermined');
    expect(unread).not.toContain('chip healthy');
  });
});

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function fake(...responses: Response[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next === undefined) throw new Error('unexpected call');
    return next;
  };
  return { f, calls };
}

describe('turnAutopilotOff', () => {
  test('PATCHes enabled:false with the CSRF token from GET /me, and nothing else', async () => {
    const { f, calls } = fake(json(200, { csrfToken: 'tok' }), json(200, {}));
    expect(await turnAutopilotOff('testnet', item(A).contractId, f)).toEqual({ kind: 'off' });
    expect(calls.map((c) => c.url)).toEqual([
      '/api/v1/me',
      `/api/v1/watchlist/testnet/${item(A).contractId}`,
    ]);
    expect(calls[1]!.init?.method).toBe('PATCH');
    expect(JSON.parse(String(calls[1]!.init?.body))).toEqual({ autopilot: { enabled: false } });
    expect(new Headers(calls[1]!.init?.headers).get('X-Evergreen-CSRF')).toBe('tok');
  });

  test('signed out never reaches the PATCH', async () => {
    const { f, calls } = fake(
      json(401, { error: { code: 'UNAUTHENTICATED', message: 'x', retryable: false } }),
    );
    const r = await turnAutopilotOff('testnet', item(A).contractId, f);
    expect(r).toMatchObject({ kind: 'error', code: 'UNAUTHENTICATED' });
    expect(calls).toHaveLength(1);
  });
});

describe('what Turn off says', () => {
  test('success says the allowance is unchanged and links revoke', () => {
    expect(autopilotOffOutcomeText({ kind: 'off' })).toBeUndefined();
    expect(AUTOPILOT_OFF_TEXT).toMatch(/allowance is unchanged/);
    expect(AUTOPILOT_OFF_TEXT).toContain('href="/allowance/"');
  });

  test('a failure claims neither on nor off', () => {
    for (const t of [
      autopilotOffOutcomeText({ kind: 'unavailable', reason: 'network' }),
      autopilotOffOutcomeText({ kind: 'error', status: 503, code: 'UPSTREAM_UNAVAILABLE' }),
    ]) {
      expect(t).toMatch(/not confirmed off|did not confirm autopilot off/);
      expect(t).not.toMatch(/still on/);
    }
  });
});
