import { describe, expect, it, vi } from 'vitest';
import { onRequest, type ServiceBinding } from '../../../functions/api/[[path]].js';

const ORIGIN = 'https://preview.evergreen.test';

function recordingBinding(response: Response): ServiceBinding & { seen: Request[] } {
  const seen: Request[] = [];
  return {
    seen,
    fetch: vi.fn(async (request: Request) => {
      seen.push(request);
      return response;
    }),
  };
}

describe('Pages Function /api/* proxy', () => {
  it('forwards method, path, query, headers and body unchanged to env.API', async () => {
    const upstream = new Response('{"ok":true}', {
      status: 201,
      headers: { 'content-type': 'application/json', 'x-upstream': 'yes' },
    });
    const api = recordingBinding(upstream);
    const request = new Request(`${ORIGIN}/api/v1/watchlist?x=1`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-csrf-token': 'abc', cookie: 's=1' },
      body: '{"contractId":"C1"}',
    });

    const res = await onRequest({ request, env: { API: api } });

    expect(api.seen).toHaveLength(1);
    const sent = api.seen[0]!;
    expect(sent).toBe(request);
    expect(sent.method).toBe('POST');
    expect(new URL(sent.url).pathname).toBe('/api/v1/watchlist');
    expect(new URL(sent.url).search).toBe('?x=1');
    expect(sent.headers.get('x-csrf-token')).toBe('abc');
    expect(sent.headers.get('cookie')).toBe('s=1');
    expect(await sent.text()).toBe('{"contractId":"C1"}');
    // The upstream response is returned as-is.
    expect(res).toBe(upstream);
    expect(res.status).toBe(201);
    expect(res.headers.get('x-upstream')).toBe('yes');
  });

  it('answers JSON 503 in the API error shape when the binding is missing', async () => {
    const res = await onRequest({ request: new Request(`${ORIGIN}/api/v1/health`), env: {} });
    expect(res.status).toBe(503);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The API service binding is not configured.',
        retryable: true,
        details: {},
      },
    });
  });

  it.each(['/api/v1/health', '/api/v1/nope', '/api/v1/', '/api/v1/watchlist/C1'])(
    'never answers HTML for %s without a binding',
    async (path) => {
      for (const method of ['GET', 'POST', 'DELETE']) {
        const res = await onRequest({
          request: new Request(`${ORIGIN}${path}`, { method }),
          env: {},
        });
        const type = res.headers.get('content-type') ?? '';
        expect(type).not.toMatch(/html/i);
        expect(type).toMatch(/^application\/json/);
        expect((await res.text()).trimStart().startsWith('<')).toBe(false);
      }
    },
  );
});
