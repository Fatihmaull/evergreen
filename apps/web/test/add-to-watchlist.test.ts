/**
 * PH2-E3-03: "Add to watchlist" against spec #350 §6, with no network.
 *
 * The property that matters: only a 201 or 200 from the API reads as added.
 * A missing API (404 page, HTML, connection refused) reads undetermined, and
 * so does any code this client does not know.
 */
import { describe, expect, test } from 'vitest';
import { apiRequest, type FetchLike } from '../src/lib/api';
import { addOutcomeCopy, addOutcomeHtml, addToWatchlist, scopeFor } from '../src/lib/watchlist';

const ID = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });

interface Call {
  url: string;
  init: RequestInit | undefined;
}
function fake(...responses: (Response | Error)[]): { f: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next === undefined) throw new Error('unexpected call');
    if (next instanceof Error) throw next;
    return next;
  };
  return { f, calls };
}
const req = { network: 'testnet' as const, contractId: ID, scope: scopeFor([]) };

describe('addToWatchlist', () => {
  test('201 is added, with CSRF from GET /me, on the relative /api/v1 path', async () => {
    const { f, calls } = fake(json(200, { csrfToken: 'tok' }), json(201, {}));
    expect(await addToWatchlist(req, f)).toEqual({ kind: 'added' });
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/me', '/api/v1/watchlist']);
    const post = calls[1]!.init!;
    expect(post.method).toBe('POST');
    expect((post.headers as Record<string, string>)['X-Evergreen-CSRF']).toBe('tok');
    expect(JSON.parse(post.body as string)).toEqual({
      network: 'testnet',
      contractId: ID,
      scope: { noDataKeys: true },
    });
  });

  test('200 is already present (idempotent per §6)', async () => {
    const { f } = fake(json(200, { csrfToken: 't' }), json(200, {}));
    expect(await addToWatchlist(req, f)).toEqual({ kind: 'already-present' });
  });

  test('a network error is unavailable, and nothing is POSTed', async () => {
    const { f, calls } = fake(new TypeError('Failed to fetch'));
    expect(await addToWatchlist(req, f)).toEqual({ kind: 'unavailable', reason: 'network' });
    expect(calls).toHaveLength(1);
  });

  test('a plain 404 page (API not deployed) is unavailable, not an API error', async () => {
    const { f } = fake(
      new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/html' } }),
    );
    expect(await addToWatchlist(req, f)).toEqual({ kind: 'unavailable', reason: 'no-api' });
  });

  test('the site HTML answering 200 for /api/v1/me is unavailable, never success', async () => {
    const { f, calls } = fake(
      new Response('<!doctype html>', { status: 200, headers: { 'Content-Type': 'text/html' } }),
    );
    expect(await addToWatchlist(req, f)).toEqual({ kind: 'unavailable', reason: 'no-api' });
    expect(calls).toHaveLength(1);
  });

  test('a JSON-looking body without a JSON content type is not the API', async () => {
    const { f, calls } = fake(
      new Response('{"csrfToken":"t"}', { status: 200, headers: { 'Content-Type': 'text/plain' } }),
    );
    expect(await addToWatchlist(req, f)).toEqual({ kind: 'unavailable', reason: 'no-api' });
    expect(calls).toHaveLength(1);
  });

  test('/me without a csrfToken is undetermined and nothing is POSTed', async () => {
    const { f, calls } = fake(json(200, {}));
    expect(await addToWatchlist(req, f)).toMatchObject({ kind: 'error', code: 'UNRECOGNISED' });
    expect(calls).toHaveLength(1);
  });

  test('UNAUTHENTICATED from /me is an error code, branched on code', async () => {
    const { f } = fake(
      json(401, { error: { code: 'UNAUTHENTICATED', message: 'x', retryable: false } }),
    );
    expect(await addToWatchlist(req, f)).toMatchObject({ kind: 'error', code: 'UNAUTHENTICATED' });
  });

  test('an unknown code is UNRECOGNISED', async () => {
    const { f } = fake(
      json(200, { csrfToken: 't' }),
      json(409, { error: { code: 'SOMETHING_NEW' } }),
    );
    expect(await addToWatchlist(req, f)).toMatchObject({ kind: 'error', code: 'UNRECOGNISED' });
  });

  test('an unexpected 2xx status is not success', async () => {
    const { f } = fake(json(200, { csrfToken: 't' }), json(202, {}));
    expect(await addToWatchlist(req, f)).toMatchObject({ kind: 'error', code: 'UNRECOGNISED' });
  });

  test('scope carries the scan data keys', () => {
    expect(scopeFor(['AAAA'])).toEqual({ dataKeys: ['AAAA'] });
  });
});

describe('apiRequest', () => {
  test('RATE_LIMITED keeps Retry-After', async () => {
    const { f } = fake(json(429, { error: { code: 'RATE_LIMITED' } }, { 'Retry-After': '120' }));
    expect(await apiRequest('/x', {}, f)).toEqual({
      kind: 'error',
      status: 429,
      code: 'RATE_LIMITED',
      retryAfterSeconds: 120,
    });
  });
  test('JSON without the §9 envelope is unavailable', async () => {
    const { f } = fake(json(500, { oops: true }));
    expect(await apiRequest('/x', {}, f)).toEqual({ kind: 'unavailable', reason: 'no-api' });
  });
});

describe('addOutcomeCopy', () => {
  const nonSuccess = [
    { kind: 'unavailable', reason: 'network' },
    { kind: 'unavailable', reason: 'no-api' },
    { kind: 'error', status: 401, code: 'UNAUTHENTICATED' },
    { kind: 'error', status: 500, code: 'UNRECOGNISED' },
    { kind: 'error', status: 503, code: 'UPSTREAM_UNAVAILABLE' },
    { kind: 'error', status: 403, code: 'CSRF_FAILED' },
    { kind: 'error', status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 61 },
  ] as const;

  test.each(nonSuccess)('%o never reads as added or healthy', (o) => {
    const c = addOutcomeCopy(o, ID);
    expect(c.tone).not.toBe('healthy');
    expect(c.html).not.toMatch(/is on your watchlist|already on your watchlist/);
  });

  test('unavailable says undetermined and that the scan is unaffected', () => {
    const html = addOutcomeHtml({ kind: 'unavailable', reason: 'no-api' }, ID);
    expect(html).toContain('chip undetermined');
    expect(html).toContain('nothing was added');
  });

  test('rate limit shows minutes from Retry-After', () => {
    expect(
      addOutcomeCopy(
        { kind: 'error', status: 429, code: 'RATE_LIMITED', retryAfterSeconds: 61 },
        ID,
      ).html,
    ).toContain('2 minutes');
  });

  test('no copy calls anything fully safe, and none renders undefined', () => {
    for (const o of [
      ...nonSuccess,
      { kind: 'added' } as const,
      { kind: 'already-present' } as const,
    ]) {
      const html = addOutcomeHtml(o, ID);
      expect(html).not.toMatch(/fully safe|undefined|NaN/i);
    }
  });
});
