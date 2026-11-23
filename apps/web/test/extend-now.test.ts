/**
 * PH2-E3-04: one click queues one hosted extend and signs nothing.
 *
 * A missing jobs route, an unknown status, a zero idempotency key and a rent
 * whose fee is folded into the rent all fail here.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import type { FetchLike } from '../src/lib/api';
import {
  ROUTER_CONTRACT_ID,
  extendRows,
  parseExtendJob,
  queueExtendNow,
} from '../src/lib/extend-job';
import { oneExtendQuoteHtml, queueHtml, rowHtml } from '../src/lib/extend-view';
import { exactXlm } from '../src/lib/format';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const KEY = '11111111-1111-4111-8111-111111111111';
const text = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });

const job = (status: string) => ({
  id: 'job-1',
  network: 'testnet',
  contractId: A,
  kind: 'extend-now',
  createdAt: '2026-11-23T00:00:00Z',
  status,
  steps: {
    pull: { at: '2026-11-23T00:01:00Z', txHash: 'pullhash', amountStroops: '100' },
  },
});

function fake(responses: Response[]): { fetch: FetchLike; urls: string[]; bodies: string[] } {
  const urls: string[] = [];
  const bodies: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    urls.push(url);
    bodies.push(typeof init?.body === 'string' ? init.body : '');
    const next = responses.shift();
    if (next === undefined) throw new Error('unexpected call');
    return next;
  };
  return { fetch, urls, bodies };
}

describe('queueExtendNow', () => {
  test('a missing key does not call the API', async () => {
    const seen = fake([]);
    expect(await queueExtendNow(A, '', seen.fetch)).toEqual({
      kind: 'not-queued',
      reason: 'no-key',
    });
    expect(seen.urls).toEqual([]);
  });

  test('a 202 queues one job and does not retry', async () => {
    const seen = fake([json(200, { csrfToken: 'tok' }), json(202, { job: job('queued') })]);
    const outcome = await queueExtendNow(A, KEY, seen.fetch);
    expect(outcome.kind).toBe('queued');
    expect(seen.urls).toEqual(['/api/v1/me', '/api/v1/jobs']);
    expect(seen.bodies[1]).toBe(
      JSON.stringify({ network: 'testnet', contractId: A, kind: 'extend-now' }),
    );
    expect(text(queueHtml(outcome))).toContain('Queued');
    expect(text(queueHtml(outcome))).not.toMatch(/protected/i);
  });

  test('an HTML 404 queues nothing', async () => {
    const seen = fake([
      json(200, { csrfToken: 'tok' }),
      new Response('<html>', { status: 404, headers: { 'Content-Type': 'text/html' } }),
    ]);
    expect(await queueExtendNow(A, KEY, seen.fetch)).toEqual({
      kind: 'not-queued',
      reason: 'unavailable',
    });
    expect(seen.urls).toHaveLength(2);
  });

  test('a status this screen does not know is not extended', () => {
    expect(parseExtendJob(job('succeeded'))).toBeUndefined();
    expect(parseExtendJob(job('dry-run'))).toBeUndefined();
    expect(parseExtendJob(job('orphaned'))).toBeUndefined();
    const parsed = parseExtendJob(job('extended'));
    expect(parsed?.status).toBe('extended');
    expect(text(queueHtml({ kind: 'queued', job: parsed!, replay: false }))).toContain('extended');
    expect(text(queueHtml({ kind: 'queued', job: parsed!, replay: false }))).not.toMatch(
      /protected/i,
    );
  });
});

describe('the estimate and the rows', () => {
  test('rent and the fee stay apart, and the pull amount stays undetermined', () => {
    const html = text(oneExtendQuoteHtml(1n));
    expect(html).toContain(exactXlm(1n).stroops);
    expect(html).toContain(exactXlm(25_000n).stroops);
    expect(html).toContain('undetermined');
    expect(html).not.toContain(exactXlm(25_001n).stroops);
    expect(text(oneExtendQuoteHtml(undefined))).toContain('undetermined');
    expect(ROUTER_CONTRACT_ID).toBeUndefined();
  });

  test('autopilot off has no button, and a spent daily limit is disabled', () => {
    const off = rowHtml({ contractId: A, autopilot: false });
    expect(off).not.toContain('Extend now</button>');
    const spent = rowHtml({ contractId: A, autopilot: true, limitPerDay: 3, usedToday: 3 });
    expect(spent).toMatch(/disabled>Extend now/);
    const open = rowHtml({ contractId: A, autopilot: true, limitPerDay: 3, usedToday: 1 });
    expect(open).toContain('>Extend now</button>');
    expect(open).not.toMatch(/disabled>Extend now/);
  });

  test('only testnet rows with a contract id are offered', () => {
    const parsed = extendRows([
      {
        network: 'testnet',
        contractId: A,
        autopilot: { enabled: true },
        extendNow: { limitPerDay: 3, usedToday: 0, resetsAt: '2026-11-24T00:00:00Z' },
      },
      { network: 'mainnet', contractId: A, autopilot: { enabled: true } },
      { network: 'testnet', contractId: 'nope' },
    ]);
    expect(parsed.rows).toHaveLength(1);
    expect(parsed.rows[0]?.autopilot).toBe(true);
    expect(parsed.unreadable).toBe(1);
  });
});

describe('the page does not sign', () => {
  test('the extend modules do not build a transaction or a second signature', () => {
    const root = fileURLToPath(new URL('../src/', import.meta.url));
    const jobSrc = readFileSync(root + 'lib/extend-job.ts', 'utf8');
    const page = readFileSync(root + 'pages/extend.ts', 'utf8');
    const shell = readFileSync(root + 'pages/extend.mjs', 'utf8');
    for (const src of [jobSrc, page, shell]) {
      expect(src).not.toMatch(
        /stellar-sdk|wallet-money|ExtendFootprint|signAndSubmit|call\(\s*['"]approve['"]/,
      );
    }
    expect(shell).toContain('Nothing is queued when this page loads');
    expect(page).toContain("addEventListener('click'");
  });
});
