/**
 * The backend API Worker (docs/API.md, option B in ADR-003's 2026-10-21
 * amendment). Reached from the dashboard through a Pages Function that
 * forwards `/api/*` over the service binding `API`.
 */
import { handle, type Env } from './router.js';

export { API_BASE, API_VERSION, SERVICE, handle, json, notFound } from './router.js';
export type { Env } from './router.js';

// The one default export allowed: the Workers runtime requires a module
// Worker's handler object as the default export.
// eslint-disable-next-line no-restricted-syntax
export default {
  fetch(request: Request, env: Env): Response {
    return handle(request, env);
  },
};
