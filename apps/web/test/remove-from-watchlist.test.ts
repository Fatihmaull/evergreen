/**
 * PH2-E3-02: removing an item, against spec #350 §6 (`DELETE`, `204`, a soft
 * delete), with no network. Only a 204 from the API reads as removed.
 */
import { describe, expect, test } from 'vitest';
import type { FetchLike } from '../src/lib/api';
import { removeFromWatchlist } from '../src/lib/watchlist';

const ID = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const envelope = (status: number, code: string) =>
  json(status, { error: { code, message: 'm', retryable: false, details: {} } });

function fake(...responses: (Response | Error)[]) {
  const calls: { url: string; init: RequestInit | undefined }[] = [];
  const f: FetchLike = async (url, init) => {
    calls.push({ url, init });
    const next = responses.shift();
    if (next === undefined) throw new Error('unexpected call');
    if (next instanceof Error) throw next;
    return next;
  };
  return { f, calls };
}

describe('removeFromWatchlist', () => {
  test('204 is removed, with CSRF from GET /me, on the §6 path', async () => {
    const { f, calls } = fake(json(200, { csrfToken: 'tok' }), new Response(null, { status: 204 }));
    expect(await removeFromWatchlist('testnet', ID, f)).toEqual({ kind: 'removed' });
    expect(calls.map((c) => c.url)).toEqual(['/api/v1/me', `/api/v1/watchlist/testnet/${ID}`]);
    expect(calls[1]!.init!.method).toBe('DELETE');
    expect((calls[1]!.init!.headers as Record<string, string>)['X-Evergreen-CSRF']).toBe('tok');
  });

  test('no API on the site: unavailable, and nothing is DELETEd', async () => {
    const { f, calls } = fake(
      new Response('<html>', { status: 404, headers: { 'Content-Type': 'text/html' } }),
    );
    expect(await removeFromWatchlist('testnet', ID, f)).toEqual({
      kind: 'unavailable',
      reason: 'no-api',
    });
    expect(calls).toHaveLength(1);
  });

  test('GET /me without a csrfToken is UNRECOGNISED, and nothing is DELETEd', async () => {
    const { f, calls } = fake(json(200, {}));
    expect((await removeFromWatchlist('testnet', ID, f)).kind).toBe('error');
    expect(calls).toHaveLength(1);
  });

  test.each(['NOT_FOUND', 'CSRF_FAILED', 'UNAUTHENTICATED'])('%s passes through', async (code) => {
    const { f } = fake(json(200, { csrfToken: 't' }), envelope(400, code));
    expect(await removeFromWatchlist('testnet', ID, f)).toMatchObject({ kind: 'error', code });
  });

  test('a 200 is not §6’s answer: UNRECOGNISED, not removed', async () => {
    const { f } = fake(json(200, { csrfToken: 't' }), json(200, {}));
    expect(await removeFromWatchlist('testnet', ID, f)).toEqual({
      kind: 'error',
      status: 200,
      code: 'UNRECOGNISED',
    });
  });
});
