/**
 * Cloudflare Pages Function: `/api/*` -> the API Worker (docs/API.md, option B).
 *
 * The dashboard calls the relative base `/api/v1`. Without this file Pages
 * answers those paths with its HTML fallback page (200 text/html), which the
 * client cannot parse. This forwards every request, unchanged, to the service
 * binding `API` (`evergreen-api` in production, `evergreen-api-preview` on
 * preview). If the binding is absent it answers JSON 503 in the API's error
 * shape (docs/API.md §9 envelope from #350:
 * `{ error: { code: 'UPSTREAM_UNAVAILABLE', message, retryable: true, details: {} } }`) — never HTML.
 *
 * Lives at the REPO ROOT `functions/` because the Pages project's root
 * directory is empty; `apps/dashboard/functions/` would not be read.
 * Keep only route files in this directory: Pages turns every file here into a
 * route, so the tests live in apps/dashboard/test/api-proxy.test.ts.
 */

/** The slice of a Cloudflare service binding this proxy uses. */
export interface ServiceBinding {
  fetch(request: Request): Promise<Response>;
}

export interface ProxyEnv {
  API?: ServiceBinding;
}

export interface ProxyContext {
  request: Request;
  env: ProxyEnv;
}

export function bindingMissing(): Response {
  return new Response(
    JSON.stringify({
      error: {
        code: 'UPSTREAM_UNAVAILABLE',
        message: 'The API service binding is not configured.',
        retryable: true,
        details: {},
      },
    }),
    {
      status: 503,
      headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
    },
  );
}

export async function onRequest(context: ProxyContext): Promise<Response> {
  const api = context.env.API;
  if (!api) return bindingMissing();
  return api.fetch(context.request);
}
