import { describe, expect, it } from 'vitest';
import worker, { API_BASE, apiError, handle } from '../src/index.js';

const req = (path: string, method = 'GET') =>
  new Request(`https://example.test${path}`, { method });

describe('@evergreen/api router', () => {
  it('serves GET /api/v1/health as JSON', async () => {
    const res = handle(req(`${API_BASE}/health`), { ENVIRONMENT: 'preview' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({
      ok: true,
      service: 'evergreen-api',
      version: 'v1',
      environment: 'preview',
    });
  });

  it('says undetermined when no environment is configured', async () => {
    const body = (await handle(req(`${API_BASE}/health`)).json()) as { environment: string };
    expect(body.environment).toBe('undetermined');
  });

  it('refuses a non-GET on health with 405', async () => {
    const res = handle(req(`${API_BASE}/health`, 'POST'));
    expect(res.status).toBe(405);
    expect(res.headers.get('allow')).toBe('GET, HEAD');
    expect(res.headers.get('content-type')).toMatch(/^application\/json/);
    expect(await res.json()).toEqual({
      error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET.', retryable: false, details: {} },
    });
  });

  it('marks only RATE_LIMITED and UPSTREAM_UNAVAILABLE retryable (§9)', async () => {
    for (const [code, retryable] of [
      ['RATE_LIMITED', true],
      ['UPSTREAM_UNAVAILABLE', true],
      ['NOT_FOUND', false],
      ['CSRF_FAILED', false],
    ] as const) {
      const body = (await apiError(code, 'x', 400).json()) as { error: { retryable: boolean } };
      expect(body.error.retryable).toBe(retryable);
    }
  });

  it('passes details and headers through apiError', async () => {
    const res = apiError('RATE_LIMITED', 'Slow down.', 429, {
      details: { retryAfter: 60 },
      headers: { 'retry-after': '60' },
    });
    expect(res.headers.get('retry-after')).toBe('60');
    expect(await res.json()).toEqual({
      error: {
        code: 'RATE_LIMITED',
        message: 'Slow down.',
        retryable: true,
        details: { retryAfter: 60 },
      },
    });
  });

  it.each([`${API_BASE}/nope`, `${API_BASE}`, '/api/v2/health', '/'])(
    'answers %s with a JSON 404',
    async (path) => {
      const res = handle(req(path));
      expect(res.status).toBe(404);
      expect(res.headers.get('content-type')).toMatch(/^application\/json/);
      expect(await res.json()).toEqual({
        error: { code: 'NOT_FOUND', message: 'No such route.', retryable: false, details: {} },
      });
    },
  );

  it('exports a Worker fetch handler', async () => {
    const res = worker.fetch(req(`${API_BASE}/health`), { ENVIRONMENT: 'production' });
    expect(((await res.json()) as { environment: string }).environment).toBe('production');
  });
});
