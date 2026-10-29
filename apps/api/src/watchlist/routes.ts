/**
 * The watchlist routes of docs/API.md §6 (`PH2-E2-05`), over `WatchlistStore`.
 *
 * - Every route needs a session (`requireSession`, shared with auth); every
 *   state-changing one also passes CSRF there. A user sees and changes only
 *   their own items: the user id comes from the session row, never the request.
 * - Autopilot is only configuration here. **No route moves XLM**, signs or
 *   submits anything. Turning it on needs a wallet this user linked (proved by
 *   its own SEP-10 signature, §4), so Evergreen never draws on anyone else's
 *   wallet; the allowance on chain stays the real authority (ADR-007).
 * - Writes accept only testnet until DoD-2 (`PH2-E5-02`, §2, §8).
 */
import { apiError } from '../router.js';
import { requireSession, withRotatedCookie, type AuthDeps } from '../auth/routes.js';
import { DAY_SECONDS, type WatchRecord, type WatchlistStore } from './store.js';
import {
  parseContractId,
  parseNetwork,
  parseNewItem,
  parsePatch,
  type Refusal,
} from './validate.js';

export interface WatchlistDeps {
  readonly auth: AuthDeps;
  readonly store: WatchlistStore;
  /** `EXTEND_NOW_PER_USER_CONTRACT_PER_DAY` (§3). */
  readonly extendNowLimitPerDay: number;
  /**
   * The lowest `thresholdLedgers` the API accepts (§6). The value is the
   * engine's and Rakha's to publish (`PH2-E4-04`, `B-D31-01`): undefined until
   * it is configured, and autopilot cannot be turned on without it.
   */
  readonly thresholdFloorLedgers: number | undefined;
  /** Unix seconds. */
  readonly now: () => number;
}

/** The state-changing watchlist routes, listed so tests can prove each one is guarded. */
export const WATCHLIST_WRITE_ROUTES = [
  ['POST', '/watchlist'],
  ['PATCH', '/watchlist/{network}/{contractId}'],
  ['DELETE', '/watchlist/{network}/{contractId}'],
] as const;

type Match = { kind: 'collection' } | { kind: 'item'; network: string; contractId: string };

function match(path: string): Match | undefined {
  if (path === '/watchlist') return { kind: 'collection' };
  const m = /^\/watchlist\/([^/]+)\/([^/]+)$/.exec(path);
  if (m?.[1] === undefined || m[2] === undefined) return undefined;
  try {
    return {
      kind: 'item',
      network: decodeURIComponent(m[1]),
      contractId: decodeURIComponent(m[2]),
    };
  } catch {
    return { kind: 'item', network: '', contractId: '' }; // fails validation: 400
  }
}

/** Paths (relative to `/api/v1`) owned by the watchlist group. */
export function isWatchlistPath(path: string): boolean {
  return match(path) !== undefined;
}

/** The methods a watchlist path answers, for `405` and its `Allow` header. */
export function watchlistMethods(path: string): readonly string[] | undefined {
  const m = match(path);
  if (m === undefined) return undefined;
  return m.kind === 'collection' ? ['GET', 'POST'] : ['PATCH', 'DELETE'];
}

function json(status: number, body: unknown): Response {
  return new Response(body === null ? null : JSON.stringify(body), {
    status,
    headers: {
      ...(body === null ? {} : { 'content-type': 'application/json; charset=utf-8' }),
      'cache-control': 'no-store',
    },
  });
}

/**
 * `INVALID_REQUEST` (docs/API.md §9): 400 for malformed input, 422 for a
 * well-formed request refused on its meaning. `details.field` names the field
 * and never echoes the value.
 */
function invalid(refusal: Refusal, status: 400 | 422 = 400): Response {
  return apiError('INVALID_REQUEST', refusal.message, status, {
    details: { field: refusal.field },
  });
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return undefined;
  }
}

const iso = (seconds: number): string => new Date(seconds * 1000).toISOString();

/** The §6 `WatchItem`. `lastObservation` carries its own ledger and time (§2). */
function itemJson(r: WatchRecord, limitPerDay: number, now: number) {
  return {
    network: r.network,
    contractId: r.contractId,
    ...(r.label === undefined ? {} : { label: r.label }),
    addedAt: iso(r.addedAt),
    scope: r.scope,
    autopilot:
      r.autopilot === undefined
        ? { enabled: false }
        : {
            enabled: true,
            payerWallet: r.autopilot.payerWallet,
            thresholdLedgers: r.autopilot.thresholdLedgers,
            extendToLedgers: r.autopilot.extendToLedgers,
            budget: {
              perJobMaxStroops: r.autopilot.perJobMaxStroops,
              per30DaysMaxStroops: r.autopilot.per30DaysMaxStroops,
            },
          },
    extendNow: {
      limitPerDay,
      usedToday: r.extendNow.usedToday,
      // When the oldest counted use leaves the rolling window (§6). With no use
      // there is nothing to wait for, so it reads "now": undetermined in the spec.
      resetsAt: iso(
        r.extendNow.oldestUseAt === undefined ? now : r.extendNow.oldestUseAt + DAY_SECONDS,
      ),
    },
    lastObservation:
      r.lastObservation === null
        ? null
        : {
            observedAtLedger: r.lastObservation.observedAtLedger,
            observedAt: iso(r.lastObservation.observedAt),
            scan: r.lastObservation.scan,
            health: r.lastObservation.health,
          },
  };
}

/** A path's network and contract, validated. A malformed one is a 400, never a lookup. */
function itemKey(m: { network: string; contractId: string }) {
  const network = parseNetwork(m.network, 'network');
  if (!network.ok) return network;
  const contractId = parseContractId(m.contractId, 'contractId');
  if (!contractId.ok) return contractId;
  return { ok: true as const, network: network.value, contractId: contractId.value };
}

const notFound = () => apiError('NOT_FOUND', 'No such watch item.', 404);

async function list(request: Request, deps: WatchlistDeps): Promise<Response> {
  const authed = await requireSession(request, deps.auth);
  if (authed instanceof Response) return authed;
  const now = deps.now();
  const items = await deps.store.list(authed.user.id, now);
  return json(200, { items: items.map((r) => itemJson(r, deps.extendNowLimitPerDay, now)) });
}

async function add(request: Request, deps: WatchlistDeps): Promise<Response> {
  const authed = await requireSession(request, deps.auth);
  if (authed instanceof Response) return authed;
  const parsed = parseNewItem(await readJson(request));
  if (!parsed.ok) return invalid(parsed);
  if (parsed.value.network !== 'testnet') {
    return apiError('NETWORK_NOT_WRITABLE', 'Only testnet can be written until DoD-2.', 422);
  }
  const now = deps.now();
  const outcome = await deps.store.add(authed.user.id, parsed.value, now);
  const record = await deps.store.get(
    authed.user.id,
    parsed.value.network,
    parsed.value.contractId,
    now,
  );
  if (record === undefined) throw new Error('The watch item vanished after it was added.');
  // 201 for a new row or a restored one, 200 for one already on the list (§6).
  return json(outcome === 'existing' ? 200 : 201, {
    item: itemJson(record, deps.extendNowLimitPerDay, now),
  });
}

async function patch(
  request: Request,
  deps: WatchlistDeps,
  m: { network: string; contractId: string },
): Promise<Response> {
  const authed = await requireSession(request, deps.auth);
  if (authed instanceof Response) return authed;
  const key = itemKey(m);
  if (!key.ok) return invalid(key);
  const parsed = parsePatch(await readJson(request));
  if (!parsed.ok) return invalid(parsed);
  const userId = authed.user.id;
  const now = deps.now();
  const current = await deps.store.get(userId, key.network, key.contractId, now);
  if (current === undefined) return notFound();

  const autopilot = parsed.value.autopilot;
  if (autopilot?.enabled === true) {
    if (current.network !== 'testnet') {
      return apiError('NETWORK_NOT_WRITABLE', 'Autopilot is testnet only until DoD-2.', 422);
    }
    const floor = deps.thresholdFloorLedgers;
    if (floor === undefined) {
      // The floor is the engine's to publish and is not configured: refuse to
      // guess one. Absence of a bound is not permission.
      return apiError(
        'UPSTREAM_UNAVAILABLE',
        'Autopilot settings are not available right now.',
        503,
      );
    }
    // These compare configured bounds, not a contract's remaining TTL, so the
    // policy lint (needsAction/hasExpired) does not apply: the TTL decision
    // itself stays in packages/core and the engine.
    // eslint-disable-next-line no-restricted-syntax -- config bound, not a TTL decision
    if (autopilot.thresholdLedgers < floor) {
      return apiError(
        'THRESHOLD_BELOW_FLOOR',
        'thresholdLedgers is below the lowest the engine accepts.',
        422,
        { details: { floorLedgers: floor } },
      );
    }
    // eslint-disable-next-line no-restricted-syntax -- config bound, not a TTL decision
    if (autopilot.extendToLedgers <= autopilot.thresholdLedgers) {
      return invalid(
        {
          ok: false,
          field: 'autopilot.extendToLedgers',
          message: 'extendToLedgers must exceed thresholdLedgers.',
        },
        422,
      );
    }
    // The payer must be a wallet THIS user linked by signing its challenge.
    // Evergreen never draws on a wallet the caller does not own.
    const wallets = await deps.auth.store.listWallets(userId);
    if (!wallets.some((w) => w.network === 'testnet' && w.account === autopilot.payerWallet)) {
      return invalid(
        {
          ok: false,
          field: 'autopilot.payerWallet',
          message: 'payerWallet is not linked to your account.',
        },
        422,
      );
    }
  }

  const result = await deps.store.update(userId, key.network, key.contractId, parsed.value);
  if (result === 'not-found') return notFound();
  if (result === 'payer-not-linked') {
    return invalid(
      {
        ok: false,
        field: 'autopilot.payerWallet',
        message: 'payerWallet is not linked to your account.',
      },
      422,
    );
  }
  if (result === 'payer-relink-required') {
    // The user's own wallet, so naming the reason leaks nothing. Without it the
    // answer would say "not linked" about a wallet their own list shows as linked.
    return invalid(
      {
        ok: false,
        field: 'autopilot.payerWallet',
        message:
          'Your account was reactivated. Sign with this wallet again before using it as a payer.',
      },
      422,
    );
  }
  const record = await deps.store.get(userId, key.network, key.contractId, now);
  if (record === undefined) return notFound();
  return json(200, { item: itemJson(record, deps.extendNowLimitPerDay, now) });
}

async function remove(
  request: Request,
  deps: WatchlistDeps,
  m: { network: string; contractId: string },
): Promise<Response> {
  const authed = await requireSession(request, deps.auth);
  if (authed instanceof Response) return authed;
  const key = itemKey(m);
  if (!key.ok) return invalid(key);
  const removed = await deps.store.remove(authed.user.id, key.network, key.contractId, deps.now());
  return removed ? json(204, null) : notFound();
}

/**
 * Handles `path` (relative to `/api/v1`) if it is a watchlist route and the
 * method fits, else returns `undefined` so the router answers 404 or 405.
 */
export async function handleWatchlist(
  request: Request,
  path: string,
  deps: WatchlistDeps,
): Promise<Response | undefined> {
  const m = match(path);
  if (m === undefined) return undefined;
  const method = request.method.toUpperCase();
  let res: Response | undefined;
  if (m.kind === 'collection') {
    if (method === 'GET') res = await list(request, deps);
    else if (method === 'POST') res = await add(request, deps);
  } else if (method === 'PATCH') res = await patch(request, deps, m);
  else if (method === 'DELETE') res = await remove(request, deps, m);
  return res === undefined ? undefined : withRotatedCookie(request, res);
}
