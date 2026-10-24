/**
 * The dashboard's client for the Evergreen API, `/api/v1` (spec: PR #350,
 * `docs/API.md`). Shared inside `apps/` with WEBR (kickoff/WEBF.md).
 *
 * Three rules from the spec's §9a, enforced here so no screen has to remember:
 *
 * 1. Branch on the envelope's `code`, never on the HTTP status or `message`.
 * 2. The set of codes is closed and the default is undetermined: a code this
 *    client does not know comes back as `UNRECOGNISED`, never as success.
 * 3. "The API did not answer" is its own outcome (`unavailable`), distinct
 *    from "the API answered with an error". Until the API Worker is deployed,
 *    `/api/v1/*` on the site answers with a 404 or an HTML page; neither is
 *    an answer from the API, so neither may be read as one.
 *
 * Nothing here retries. A silent retry of a state-changing request is what
 * CSRF protection exists to stop (§9a, `CSRF_FAILED`).
 */

export const API_BASE = '/api/v1';

/** §9's code list, verbatim. A code outside it is `UNRECOGNISED`. */
export const API_ERROR_CODES = [
  'CSRF_FAILED',
  'RATE_LIMITED',
  'CODE_INVALID',
  'WALLET_LINKED_ELSEWHERE',
  'WALLET_PAYS_FOR_WATCHED_CONTRACT',
  'CHALLENGE_INVALID',
  'NETWORK_UNAVAILABLE',
  'NETWORK_NOT_WRITABLE',
  'THRESHOLD_BELOW_FLOOR',
  'AUTOPILOT_OFF',
  'ALLOWANCE_MISSING',
  'ALLOWANCE_EXPIRED',
  'DAILY_LIMIT_REACHED',
  'IDEMPOTENCY_KEY_REQUIRED',
  'IDEMPOTENCY_KEY_REUSED',
  'NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'UNAUTHENTICATED',
  'UPSTREAM_UNAVAILABLE',
  'EMAIL_NOT_SENT',
] as const;

export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export type ApiOutcome<T> =
  | { readonly kind: 'ok'; readonly status: number; readonly data: T }
  | {
      readonly kind: 'error';
      readonly status: number;
      readonly code: ApiErrorCode | 'UNRECOGNISED';
      /** Only from `Retry-After`, in seconds, when the server sent one. */
      readonly retryAfterSeconds?: number;
      /** §9's `retryable`, only when the envelope carried a boolean. Never acted on silently. */
      readonly retryable?: boolean;
    }
  | {
      readonly kind: 'unavailable';
      /** `network`: no response. `no-api`: a response, but not from the API. */
      readonly reason: 'network' | 'no-api';
    };

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

function isKnownCode(code: unknown): code is ApiErrorCode {
  return typeof code === 'string' && (API_ERROR_CODES as readonly string[]).includes(code);
}

function retryAfter(res: Response): number | undefined {
  const raw = res.headers.get('Retry-After');
  if (raw === null) return undefined;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
  fetchImpl: FetchLike = (input, i) => fetch(input, i),
): Promise<ApiOutcome<T>> {
  let res: Response;
  try {
    res = await fetchImpl(`${API_BASE}${path}`, {
      credentials: 'same-origin',
      ...init,
      headers: { Accept: 'application/json', ...(init.headers ?? {}) },
    });
  } catch {
    return { kind: 'unavailable', reason: 'network' };
  }

  if (res.status === 204) return { kind: 'ok', status: 204, data: undefined as T };
  // §4: `POST /auth/email/start` answers `202` and states no body. An empty 202
  // is that answer; a 202 with a body still has to be JSON to count.
  const type = res.headers.get('Content-Type') ?? '';
  if (res.status === 202 && !type.includes('application/json')) {
    let text: string;
    try {
      text = await res.text();
    } catch {
      return { kind: 'unavailable', reason: 'no-api' };
    }
    if (text === '') return { kind: 'ok', status: 202, data: undefined as T };
    return { kind: 'unavailable', reason: 'no-api' };
  }

  if (!type.includes('application/json')) {
    // A static 404 page, or the site's HTML. Not the API speaking.
    return { kind: 'unavailable', reason: 'no-api' };
  }
  let body: unknown;
  try {
    body = await res.json();
  } catch {
    return { kind: 'unavailable', reason: 'no-api' };
  }

  if (res.ok) return { kind: 'ok', status: res.status, data: body as T };

  const envelope = (body as { error?: { code?: unknown; retryable?: unknown } } | null)?.error;
  if (envelope === undefined || envelope === null || typeof envelope !== 'object') {
    // JSON without §9's envelope is not an API answer either.
    return { kind: 'unavailable', reason: 'no-api' };
  }
  const seconds = retryAfter(res);
  return {
    kind: 'error',
    status: res.status,
    code: isKnownCode(envelope.code) ? envelope.code : 'UNRECOGNISED',
    ...(seconds === undefined ? {} : { retryAfterSeconds: seconds }),
    ...(typeof envelope.retryable === 'boolean' ? { retryable: envelope.retryable } : {}),
  };
}

/** `GET /me`, §4. Only the field this client needs is typed. */
export interface Me {
  readonly csrfToken: string;
}
