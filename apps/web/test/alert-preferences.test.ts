/**
 * PH2-E2-06: the alerts page stores a preference and does not send.
 *
 * Fixtures only. Removing `assertPreferenceRequest`'s refusal, or adding a
 * send URL to a save, fails the tests below.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, test } from 'vitest';
import { fileURLToPath } from 'node:url';
import { DEFAULT_CRITICAL_LEDGERS, SECONDS_PER_LEDGER } from '../../../packages/core/src/index';
import { renderAlertEmail } from '../../../apps/api/src/alerts/templates';
import {
  assertPreferenceRequest,
  loadPreferences,
  parsePreferenceItems,
  preferencePatchBody,
  savePreference,
  type AlertKindName,
  type PreferenceItem,
} from '../src/lib/alert-preferences';
import {
  ALLOWANCE_LEAD_LEDGERS,
  APPROACHING_AT_OR_BELOW_LEDGERS,
  LEDGER_SECONDS_ASSUMED,
  SENDING_FACT,
  alertsHtml,
  ledgerCount,
} from '../src/lib/alert-preferences-view';

const ROOT = fileURLToPath(new URL('../../../', import.meta.url));

const ORDER: readonly AlertKindName[] = [
  'preflight_failed',
  'allowance_missing',
  'allowance_expiring',
  'extend_failed_refund',
  'refund_delayed',
  'unexplained_charge',
  'testnet_reset',
  'restore_lost_changes',
  'approaching_critical',
  'extend_succeeded',
];

const OPTIONAL = new Set(['allowance_expiring', 'approaching_critical', 'extend_succeeded']);

function items(over: Partial<Record<AlertKindName, boolean>> = {}): PreferenceItem[] {
  return ORDER.map((kind) => {
    const optional = OPTIONAL.has(kind);
    const enabled = over[kind] ?? true;
    return {
      kind,
      class: optional ? 'optional' : 'required',
      enabled: optional ? enabled : true,
      defaultOn: true,
      stored: optional ? Object.hasOwn(over, kind) : false,
    };
  });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('the preference body', () => {
  test('is one kind and one boolean', () => {
    const body = preferencePatchBody('extend_succeeded', false);
    expect(JSON.stringify(body)).toBe('{"kind":"extend_succeeded","enabled":false}');
    expect(Object.keys(body)).toEqual(['kind', 'enabled']);
  });

  test('refuses a request that is not a preference read or write', () => {
    expect(() => assertPreferenceRequest('POST', '/me/alert-preferences')).toThrow(/refused/);
    expect(() => assertPreferenceRequest('DELETE', '/me/alert-preferences')).toThrow(/refused/);
    expect(() => assertPreferenceRequest('GET', '/alerts/dispatch')).toThrow(/refused/);
    expect(() => assertPreferenceRequest('POST', 'https://api.resend.com/emails')).toThrow(
      /refused/,
    );
    expect(() => assertPreferenceRequest('GET', '/me')).not.toThrow();
    expect(() => assertPreferenceRequest('PATCH', '/me/alert-preferences')).not.toThrow();
  });

  test('a save calls GET /me and PATCH preferences, and nothing else', async () => {
    const calls: { method: string; url: string; body: string }[] = [];
    const fetchImpl = (input: string, init?: RequestInit): Promise<Response> => {
      const method = init?.method ?? 'GET';
      calls.push({ method, url: input, body: typeof init?.body === 'string' ? init.body : '' });
      if (input.endsWith('/me') && method === 'GET') {
        return Promise.resolve(
          jsonResponse(200, {
            user: { id: 'u', email: 'person@example.com', createdAt: '2026-11-10T00:00:00.000Z' },
            wallets: [],
            csrfToken: 'csrf-token',
          }),
        );
      }
      if (input.endsWith('/me/alert-preferences') && method === 'PATCH') {
        return Promise.resolve(jsonResponse(200, { items: items({ extend_succeeded: false }) }));
      }
      return Promise.resolve(jsonResponse(500, { error: { code: 'UNRECOGNISED' } }));
    };
    const saved = await savePreference('extend_succeeded', false, fetchImpl);
    expect(saved.kind).toBe('saved');
    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      'GET /api/v1/me',
      'PATCH /api/v1/me/alert-preferences',
    ]);
    expect(calls[1]?.body).toBe('{"kind":"extend_succeeded","enabled":false}');
    expect(Object.keys(JSON.parse(calls[1]?.body ?? '{}') as object)).toEqual(['kind', 'enabled']);
  });

  test('a missing token does not PATCH', async () => {
    const methods: string[] = [];
    const fetchImpl = (input: string, init?: RequestInit): Promise<Response> => {
      methods.push(init?.method ?? 'GET');
      return Promise.resolve(jsonResponse(200, { user: { email: 'person@example.com' } }));
    };
    const saved = await savePreference('allowance_expiring', true, fetchImpl);
    expect(saved.kind).toBe('not-saved');
    expect(methods).toEqual(['GET']);
  });
});

describe('the read', () => {
  test('ten kinds, or nothing', () => {
    expect(parsePreferenceItems(items())).toHaveLength(10);
    expect(parsePreferenceItems(items().slice(0, 9))).toBeNull();
    const extra = items().map((item) => ({ ...item, updated_at: '2026-11-10' }));
    expect(parsePreferenceItems(extra)).toBeNull();
    const requiredOff = items().map((item) =>
      item.kind === 'preflight_failed' ? { ...item, enabled: false } : item,
    );
    expect(parsePreferenceItems(requiredOff)).toBeNull();
  });

  test('no session, no list', async () => {
    const fetchImpl = (): Promise<Response> =>
      Promise.resolve(jsonResponse(401, { error: { code: 'UNAUTHENTICATED' } }));
    const read = await loadPreferences(fetchImpl);
    expect(read.kind).toBe('no-session');
    expect(alertsHtml(read)).not.toContain('role="switch"');
    expect(alertsHtml(read)).toContain('Sign in');
    expect(alertsHtml(read)).toContain('Signing in with email cannot move XLM.');
  });
});

describe('the screen', () => {
  const ready = {
    kind: 'ready' as const,
    email: 'person@example.com',
    items: items({ allowance_expiring: false }),
  };

  test('three switches, no healthy chip, required rows have no switch', () => {
    const html = alertsHtml(ready);
    expect(html.match(/role="switch"/g)).toHaveLength(3);
    expect(html).not.toContain('chip healthy');
    expect(html).not.toContain('disabled');
    expect(html).toContain('undetermined');
    expect(html).toContain('person@example.com');
    expect(html).toContain('Whether any alert email is being sent is undetermined');
    expect(html).toContain('How often a saved choice is checked for a send is undetermined');
    expect(html).toContain('Email is the channel. No other channel is on this page.');
    expect(html).toContain('Which address a message would come from is undetermined.');
    expect(html).toContain('Nothing is sent until');
    for (const kind of ['preflight_failed', 'refund_delayed', 'testnet_reset']) {
      expect(html).not.toMatch(new RegExp(`role="switch"[^>]*${kind}`));
      expect(html).toContain(`data-kind="${kind}"`);
    }
    expect(html).toContain('aria-checked="false"');
    expect(html).toContain(ledgerCount(APPROACHING_AT_OR_BELOW_LEDGERS));
    for (const lead of ALLOWANCE_LEAD_LEDGERS) expect(html).toContain(ledgerCount(lead));
  });

  test('sending on and a confirmed address still are not a healthy chip', () => {
    const on = alertsHtml(ready, { sending: 'on', emailVerification: 'confirmed' });
    expect(on).not.toContain('chip healthy');
    expect(on).toContain('sending');
    expect(on).toContain('does not confirm a later alert arrived');
    const off = alertsHtml(ready, { sending: 'off' });
    expect(off).toContain('not sending');
    expect(off).not.toContain('chip healthy');
    const unknown = alertsHtml(ready, { emailVerification: 'not-verified' });
    expect(unknown).toContain('chip undetermined');
    expect(unknown).toContain('has not been confirmed for alerts');
  });

  test('an empty watchlist is not health, and a failed read does not say empty', () => {
    const empty = alertsHtml(ready, { watchlist: 'empty' });
    expect(empty).toContain('An empty list is not a healthy contract.');
    expect(empty).toContain('href="/dashboard/scanner/"');
    const unread = alertsHtml(ready, { watchlist: 'unread' });
    expect(unread).toContain('does not say whether any entry would be named');
    expect(unread).not.toContain('Your watchlist is empty');
    const pending = alertsHtml(ready, { watchlist: 'pending' });
    expect(pending).not.toContain('Your watchlist is empty');
    expect(pending).not.toContain('could not be read');
  });

  test('required sentences are the email leads', () => {
    const html = alertsHtml(ready);
    for (const kind of [
      'preflight_failed',
      'allowance_missing',
      'extend_failed_refund',
      'refund_delayed',
      'unexplained_charge',
      'testnet_reset',
      'restore_lost_changes',
    ] as const) {
      const lead = renderAlertEmail(kind, { entry: 'CABC', network: 'testnet' }).body.split(
        '\n',
      )[0];
      expect(lead?.length).toBeGreaterThan(20);
      expect(html).toContain(lead);
    }
  });

  test('the ledger figures are the repo constants, not a fresh guess', () => {
    expect(APPROACHING_AT_OR_BELOW_LEDGERS).toBe(DEFAULT_CRITICAL_LEDGERS);
    expect(LEDGER_SECONDS_ASSUMED).toBe(SECONDS_PER_LEDGER);
    expect(ALLOWANCE_LEAD_LEDGERS).toEqual([
      (30 * 86_400) / SECONDS_PER_LEDGER,
      (7 * 86_400) / SECONDS_PER_LEDGER,
      (1 * 86_400) / SECONDS_PER_LEDGER,
    ]);
    expect(SENDING_FACT).toBe('unknown');
  });

  test('the page source does not send', () => {
    const files = [
      'apps/web/src/lib/alert-preferences.ts',
      'apps/web/src/lib/alert-preferences-view.ts',
      'apps/web/src/pages/alerts.ts',
      'apps/web/src/pages/alerts.mjs',
    ];
    for (const file of files) {
      const src = readFileSync(`${ROOT}${file}`, 'utf8');
      expect(src).not.toMatch(/dispatchUserAlert|resend\.com|mailto:|alertsMode\(/);
    }
    const page = readFileSync(`${ROOT}apps/web/src/pages/alerts.ts`, 'utf8');
    expect(page).not.toMatch(/method:\s*'PATCH'/);
    expect(page).toContain("'/watchlist'");
    expect(page).not.toContain('sending:');
  });
});
