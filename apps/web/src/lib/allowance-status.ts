/**
 * `GET /wallets/{account}/allowance` (docs/API.md §7), read and checked.
 *
 * The route is not served yet. A missing route, a non-JSON page, or a body
 * that is not the documented shape comes back as unread. This module does not
 * turn that into expired, revoked or none: the chain cannot tell those apart,
 * and a guess would show a stopped allowance that the history did not name.
 *
 * An `expired` status is only accepted with the `lastKnown` record the spec
 * says it comes from. Without that record the body disagrees with the spec
 * and is unread.
 */
import { ENGINE_SPENDER } from './allowance';
import { apiRequest, type FetchLike } from './api';

export interface AllowanceLastKnown {
  readonly amountStroops: string;
  readonly liveUntilLedger: number;
  readonly observedAtLedger: number;
}

export interface AllowanceState {
  readonly network: 'testnet';
  readonly account: string;
  readonly spender: string;
  readonly amountStroops: string;
  readonly liveUntilLedger: number | null;
  readonly status: 'active' | 'expired' | 'revoked' | 'none';
  readonly lastKnown: AllowanceLastKnown | null;
  readonly balanceStroops: string;
  readonly observedAtLedger: number;
  readonly observedAt: string;
  readonly expiresAtEstimate: string | null;
}

export type AllowanceHistory =
  | { readonly kind: 'state'; readonly state: AllowanceState }
  | {
      readonly kind: 'unread';
      readonly reason: 'unavailable' | 'not-signed-in' | 'unrecognised';
    };

const STATUSES = new Set(['active', 'expired', 'revoked', 'none']);
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

function digits(value: unknown): value is string {
  return typeof value === 'string' && /^\d+$/.test(value);
}

function ledger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0;
}

function lastKnown(value: unknown): AllowanceLastKnown | null | undefined {
  if (value === null) return null;
  if (typeof value !== 'object' || value === null) return undefined;
  const row = value as Record<string, unknown>;
  if (!digits(row.amountStroops) || !ledger(row.liveUntilLedger) || !ledger(row.observedAtLedger)) {
    return undefined;
  }
  return {
    amountStroops: row.amountStroops,
    liveUntilLedger: row.liveUntilLedger,
    observedAtLedger: row.observedAtLedger,
  };
}

/** `undefined` when the body is not the documented shape. Never a partial. */
export function parseAllowanceState(body: unknown, account: string): AllowanceState | undefined {
  if (typeof body !== 'object' || body === null) return undefined;
  const row = body as Record<string, unknown>;
  if (row.network !== 'testnet') return undefined;
  if (row.account !== account) return undefined;
  if (typeof row.spender !== 'string' || row.spender === '') return undefined;
  if (ENGINE_SPENDER !== undefined && row.spender !== ENGINE_SPENDER) return undefined;
  if (!digits(row.amountStroops) || !digits(row.balanceStroops)) return undefined;
  if (!ledger(row.observedAtLedger)) return undefined;
  if (typeof row.observedAt !== 'string' || !ISO.test(row.observedAt)) return undefined;
  if (typeof row.status !== 'string' || !STATUSES.has(row.status)) return undefined;
  const known = lastKnown(row.lastKnown);
  if (known === undefined) return undefined;
  const live = row.liveUntilLedger;
  if (row.status === 'active') {
    if (!ledger(live)) return undefined;
  } else if (live !== null) {
    return undefined;
  }
  if (row.status === 'expired' && known === null) return undefined;
  if (
    row.expiresAtEstimate !== null &&
    (typeof row.expiresAtEstimate !== 'string' || !ISO.test(row.expiresAtEstimate))
  ) {
    return undefined;
  }
  return {
    network: 'testnet',
    account,
    spender: row.spender,
    amountStroops: row.amountStroops,
    liveUntilLedger: row.status === 'active' ? (live as number) : null,
    status: row.status as AllowanceState['status'],
    lastKnown: known,
    balanceStroops: row.balanceStroops,
    observedAtLedger: row.observedAtLedger,
    observedAt: row.observedAt,
    expiresAtEstimate: row.expiresAtEstimate === null ? null : row.expiresAtEstimate,
  };
}

export async function readAllowanceHistory(
  account: string,
  fetchImpl?: FetchLike,
): Promise<AllowanceHistory> {
  const res = await apiRequest<unknown>(
    `/wallets/${encodeURIComponent(account)}/allowance`,
    { method: 'GET' },
    fetchImpl,
  );
  if (res.kind === 'unavailable') return { kind: 'unread', reason: 'unavailable' };
  if (res.kind === 'error') {
    if (res.code === 'UNAUTHENTICATED') return { kind: 'unread', reason: 'not-signed-in' };
    return { kind: 'unread', reason: 'unrecognised' };
  }
  const state = parseAllowanceState(res.data, account);
  if (state === undefined) return { kind: 'unread', reason: 'unrecognised' };
  return { kind: 'state', state };
}
