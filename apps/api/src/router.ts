/**
 * The API Worker's router (docs/API.md §1–§2). Base path `/api/v1`, JSON in
 * and out. This is the skeleton: health and a JSON 404. No storage, no DB, no
 * secrets read. Auth (`PH2-E2-04`) and the rest of the routes mount here.
 */
export const API_BASE = '/api/v1';
export const API_VERSION = 'v1';
export const SERVICE = 'evergreen-api';

export interface Env {
  /** `production` or `preview`, set per environment in wrangler.jsonc. */
  ENVIRONMENT?: string;
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });
}

export function notFound(): Response {
  return json({ error: { code: 'NOT_FOUND', message: 'No such route.' } }, 404);
}

export function handle(request: Request, env: Env = {}): Response {
  const { pathname } = new URL(request.url);
  if (pathname === `${API_BASE}/health`) {
    if (request.method !== 'GET' && request.method !== 'HEAD') {
      return json({ error: { code: 'METHOD_NOT_ALLOWED', message: 'Use GET.' } }, 405, {
        allow: 'GET, HEAD',
      });
    }
    return json({
      ok: true,
      service: SERVICE,
      version: API_VERSION,
      environment: env.ENVIRONMENT ?? 'undetermined',
    });
  }
  return notFound();
}
