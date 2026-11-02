/**
 * PH2-E2-06 templates and the preview-only test send. No network: global
 * fetch throws and the Resend client is a fake.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  ALERT_SPECS,
  ALERT_TEMPLATE_KINDS,
  renderAlertEmail,
  runPreviewTestSend,
  type ResendLikeClient,
} from '../src/index.js';

const ADDR = 'tester@alerts.example.test';
const OK = { ENVIRONMENT: 'preview', ALERTS_SEND: 'send', ALERTS_TEST_ALLOWLIST: ADDR };

function fakeClient(
  fail = false,
): ResendLikeClient & { calls: { to: string; key: string; subject: string }[] } {
  const calls: { to: string; key: string; subject: string }[] = [];
  return {
    calls,
    send(e, key) {
      calls.push({ to: e.to, key, subject: e.subject });
      return fail ? Promise.reject(new Error('boom')) : Promise.resolve({ id: 'em_1' });
    },
  };
}
const deps = (client: ResendLikeClient) => ({ client, from: 'alerts@example.test', runId: 'r1' });

beforeEach(() => {
  vi.stubGlobal('fetch', () => {
    throw new Error('network is not allowed in tests');
  });
});
afterEach(() => vi.unstubAllGlobals());

describe('renderAlertEmail', () => {
  it('has a template for every AlertKind in policy', () => {
    expect([...ALERT_TEMPLATE_KINDS].sort()).toEqual(Object.keys(ALERT_SPECS).sort());
  });

  it.each(ALERT_TEMPLATE_KINDS)('%s renders text and html with the entry', (kind) => {
    const e = renderAlertEmail(kind, { entry: 'CABC', network: 'testnet', detail: 'x' });
    expect(e.subject).toContain('CABC');
    expect(e.subject).not.toMatch(/[\r\n]/);
    expect(e.body).toContain('Entry: CABC');
    expect(e.html).toContain('<code>CABC</code>');
    expect(e.html.startsWith('<!doctype html>')).toBe(true);
  });

  it('required kinds say they cannot be turned off; optional ones say they can', () => {
    expect(renderAlertEmail('refund_delayed', { entry: 'C', network: 'testnet' }).body).toContain(
      'cannot be turned off',
    );
    expect(renderAlertEmail('extend_succeeded', { entry: 'C', network: 'testnet' }).body).toContain(
      'turn this alert off',
    );
  });

  it('escapes HTML and strips CR/LF from caller values', () => {
    const e = renderAlertEmail('preflight_failed', {
      entry: '<b>x</b>\r\nBcc: evil',
      network: 'testnet',
      detail: '"&"',
    });
    expect(e.html).not.toContain('<b>x</b>');
    expect(e.html).toContain('&lt;b&gt;');
    expect(e.html).toContain('&quot;&amp;&quot;');
    expect(e.subject).not.toMatch(/[\r\n]/);
  });

  it('an empty entry renders as undetermined', () => {
    expect(
      renderAlertEmail('testnet_reset', { entry: '  ', network: 'testnet' }).subject,
    ).toContain('undetermined');
  });
});

describe('runPreviewTestSend guards', () => {
  it('guard removal: with every guard satisfied it sends one email per kind', async () => {
    const c = fakeClient();
    const out = await runPreviewTestSend(OK, deps(c));
    expect(out).toEqual({
      action: 'sent',
      recipients: 1,
      sent: ALERT_TEMPLATE_KINDS.length,
      failed: 0,
    });
    expect(c.calls).toHaveLength(ALERT_TEMPLATE_KINDS.length);
    expect(c.calls.every((x) => x.to === ADDR && x.subject.startsWith('[TEST] '))).toBe(true);
    expect(new Set(c.calls.map((x) => x.key)).size).toBe(c.calls.length);
    expect(c.calls.every((x) => !x.key.includes(ADDR))).toBe(true);
  });

  it.each([
    ['production', { ...OK, ENVIRONMENT: 'production' }, 'not_preview'],
    ['ENVIRONMENT unset', { ...OK, ENVIRONMENT: undefined }, 'not_preview'],
    ['ALERTS_SEND unset', { ...OK, ALERTS_SEND: undefined }, 'alerts_send_off'],
    ['ALERTS_SEND=SEND', { ...OK, ALERTS_SEND: 'SEND' }, 'alerts_send_off'],
    ['allowlist unset', { ...OK, ALERTS_TEST_ALLOWLIST: undefined }, 'no_allowlist'],
    ['allowlist blank', { ...OK, ALERTS_TEST_ALLOWLIST: ' , ' }, 'no_allowlist'],
  ])('guard: %s sends nothing', async (_n, env, reason) => {
    const c = fakeClient();
    const out = await runPreviewTestSend(env, deps(c));
    expect(out).toMatchObject({ action: 'dry-run', reason });
    expect(c.calls).toEqual([]);
  });

  it('a failing client is counted, not thrown, and the result has no address', async () => {
    const out = await runPreviewTestSend(OK, deps(fakeClient(true)), ['testnet_reset']);
    expect(out).toEqual({ action: 'sent', recipients: 1, sent: 0, failed: 1 });
    expect(JSON.stringify(out)).not.toContain(ADDR);
  });
});
