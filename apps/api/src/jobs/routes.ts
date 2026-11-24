/**
 * The read routes of docs/API.md §7 (`PH2-E2-08`): job history and the fee
 * ledger, over `JobsStore`.
 *
 * - `GET /jobs?contractId=&cursor=&limit=`: the caller's jobs, newest first.
 * - `GET /jobs/{jobId}`: one of the caller's jobs with its steps. Another
 *   user's job is a 404, the same as no job, so ids cannot be probed.
 * - `GET /ledger?wallet=&contractId=&jobId=&cursor=&limit=`: fee-ledger rows of
 *   the caller's own jobs, newest first.
 *
 * Every route needs a session (`requireSession`); the user id comes from the
 * session row, never the request. **No route here writes or moves XLM.**
 * `POST /jobs` is deliberately not built (Fatih, 2026-11-24: its design is
 * discussed with him first), so `/jobs` answers `405` with `Allow: GET`.
 */
import { StrKey } from '@stellar/stellar-sdk';
import { apiError } from '../router.js';
import { requireSession, withRotatedCookie, type AuthDeps } from '../auth/routes.js';
import { parseContractId } from '../watchlist/validate.js';
import type { JobsStore, PageKey } from './store.js';

export interface JobsDeps {
  readonly auth: AuthDeps;
  readonly store: JobsStore;
}

/** `limit` when the request names none, and the most it may name (§2: 1..100). */
export const JOBS_PAGE_DEFAULT = 50;
export const JOBS_PAGE_MAX = 100;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

type Match = { kind: 'jobs' } | { kind: 'job'; id: string } | { kind: 'ledger' };

function match(path: string): Match | undefined {
  if (path === '/jobs') return { kind: 'jobs' };
  if (path === '/ledger') return { kind: 'ledger' };
  const m = /^\/jobs\/([^/]+)$/.exec(path);
  if (m?.[1] === undefined) return undefined;
  try {
    return { kind: 'job', id: decodeURIComponent(m[1]) };
  } catch {
    return { kind: 'job', id: '' }; // fails validation: 400
  }
}

/** The methods a jobs or ledger path answers, for `405` and its `Allow` header. */
export function jobsMethods(path: string): readonly string[] | undefined {
  return match(path) === undefined ? undefined : ['GET'];
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // §9c: a job in flight is never cached; the ledger is cheap to re-read.
      'cache-control': 'no-store',
    },
  });
}

const invalid = (field: string, message: string): Response =>
  apiError('INVALID_REQUEST', message, 400, { details: { field } });

/** The opaque cursor: base64url of `{t, id}`. Clients pass it back untouched. */
export function encodeCursor(key: PageKey): string {
  // The JSON is ASCII only (digits, hex, dashes), so btoa is safe; base64url, no padding.
  return btoa(JSON.stringify({ t: key.t, id: key.id }))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function decodeCursor(raw: string, idPattern: RegExp): PageKey | undefined {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(raw)) return undefined;
  try {
    const v: unknown = JSON.parse(atob(raw.replace(/-/g, '+').replace(/_/g, '/')));
    if (typeof v !== 'object' || v === null) return undefined;
    const { t, id } = v as Record<string, unknown>;
    if (typeof t !== 'string' || !/^\d{1,19}$/.test(t)) return undefined;
    if (typeof id !== 'string' || !idPattern.test(id)) return undefined;
    return { t, id };
  } catch {
    return undefined;
  }
}

type Parsed<T> = { ok: true; value: T } | { ok: false; res: Response };

function common(
  params: URLSearchParams,
  idPattern: RegExp,
): Parsed<{ limit: number; after?: PageKey; contractId?: string }> {
  const limitRaw = params.get('limit');
  let limit = JOBS_PAGE_DEFAULT;
  if (limitRaw !== null) {
    if (!/^\d{1,3}$/.test(limitRaw) || Number(limitRaw) < 1 || Number(limitRaw) > JOBS_PAGE_MAX) {
      return { ok: false, res: invalid('limit', `limit must be 1 to ${JOBS_PAGE_MAX}.`) };
    }
    limit = Number(limitRaw);
  }
  const cursorRaw = params.get('cursor');
  let after: PageKey | undefined;
  if (cursorRaw !== null && cursorRaw !== '') {
    after = decodeCursor(cursorRaw, idPattern);
    if (after === undefined) {
      return { ok: false, res: invalid('cursor', 'cursor is not one this API returned.') };
    }
  }
  const contractRaw = params.get('contractId');
  let contractId: string | undefined;
  if (contractRaw !== null && contractRaw !== '') {
    const c = parseContractId(contractRaw, 'contractId');
    if (!c.ok) return { ok: false, res: invalid(c.field, c.message) };
    contractId = c.value;
  }
  return {
    ok: true,
    value: {
      limit,
      ...(after === undefined ? {} : { after }),
      ...(contractId === undefined ? {} : { contractId }),
    },
  };
}

async function listJobs(request: Request, deps: JobsDeps): Promise<Response> {
  const authed = await requireSession(request, deps.auth);
  if (authed instanceof Response) return authed;
  const parsed = common(new URL(request.url).searchParams, UUID);
  if (!parsed.ok) return parsed.res;
  const page = await deps.store.listJobs(authed.user.id, parsed.value);
  return json(200, {
    items: page.items,
    nextCursor: page.next === null ? null : encodeCursor(page.next),
  });
}

async function getJob(request: Request, deps: JobsDeps, id: string): Promise<Response> {
  const authed = await requireSession(request, deps.auth);
  if (authed instanceof Response) return authed;
  if (!UUID.test(id)) return invalid('jobId', 'jobId must be a job id (UUID).');
  const job = await deps.store.getJob(authed.user.id, id);
  return job === undefined ? apiError('NOT_FOUND', 'No such job.', 404) : json(200, { job });
}

async function listLedger(request: Request, deps: JobsDeps): Promise<Response> {
  const authed = await requireSession(request, deps.auth);
  if (authed instanceof Response) return authed;
  const params = new URL(request.url).searchParams;
  const parsed = common(params, /^\d{1,19}$/);
  if (!parsed.ok) return parsed.res;
  const wallet = params.get('wallet');
  if (wallet !== null && wallet !== '' && !StrKey.isValidEd25519PublicKey(wallet)) {
    return invalid('wallet', 'wallet must be a Stellar account (G…).');
  }
  const jobId = params.get('jobId');
  if (jobId !== null && jobId !== '' && !UUID.test(jobId)) {
    return invalid('jobId', 'jobId must be a job id (UUID).');
  }
  const page = await deps.store.listLedger(authed.user.id, {
    ...parsed.value,
    ...(wallet === null || wallet === '' ? {} : { wallet }),
    ...(jobId === null || jobId === '' ? {} : { jobId }),
  });
  return json(200, {
    items: page.items,
    nextCursor: page.next === null ? null : encodeCursor(page.next),
  });
}

/**
 * Handles `path` (relative to `/api/v1`) if it is a jobs or ledger route and
 * the method is GET, else returns `undefined` so the router answers 404 or 405.
 */
export async function handleJobs(
  request: Request,
  path: string,
  deps: JobsDeps,
): Promise<Response | undefined> {
  const m = match(path);
  if (m === undefined || request.method.toUpperCase() !== 'GET') return undefined;
  let res: Response;
  if (m.kind === 'jobs') res = await listJobs(request, deps);
  else if (m.kind === 'job') res = await getJob(request, deps, m.id);
  else res = await listLedger(request, deps);
  return withRotatedCookie(request, res);
}
