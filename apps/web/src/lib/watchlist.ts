/**
 * Watchlist calls (spec #350 §6) and the copy for their outcomes (§9a).
 *
 * "Add to watchlist" is `POST /watchlist`, which needs session + CSRF (§3):
 * the token comes from `GET /me`, the session's single source of truth (§9b).
 * No other route is called. In particular nothing here reads allowance state.
 */
import type {
  ContractId,
  LedgerKey,
  NetworkName,
} from '../../../../packages/shared-types/src/index';
import { apiRequest, type ApiOutcome, type FetchLike, type Me } from './api';
import { esc } from './format';

export type WatchScope =
  { readonly dataKeys: readonly LedgerKey[] } | { readonly noDataKeys: true };

export interface AddRequest {
  readonly network: NetworkName;
  readonly contractId: ContractId;
  readonly scope: WatchScope;
  readonly label?: string;
}

/** The scope a scan used, carried into the watch item so coverage travels with it. */
export function scopeFor(dataKeys: readonly LedgerKey[]): WatchScope {
  return dataKeys.length > 0 ? { dataKeys } : { noDataKeys: true };
}

export type AddOutcome =
  | { readonly kind: 'added' }
  | { readonly kind: 'already-present' }
  | Exclude<ApiOutcome<unknown>, { kind: 'ok' }>;

export async function addToWatchlist(req: AddRequest, fetchImpl?: FetchLike): Promise<AddOutcome> {
  const me = await apiRequest<Me>('/me', { method: 'GET' }, fetchImpl);
  if (me.kind !== 'ok') return me;
  if (typeof me.data?.csrfToken !== 'string' || me.data.csrfToken === '') {
    // §9a rule 2: a shape we cannot use is undetermined, not a go-ahead.
    return { kind: 'error', status: me.status, code: 'UNRECOGNISED' };
  }
  const res = await apiRequest<unknown>(
    '/watchlist',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Evergreen-CSRF': me.data.csrfToken },
      body: JSON.stringify(req),
    },
    fetchImpl,
  );
  if (res.kind !== 'ok') return res;
  if (res.status === 201) return { kind: 'added' };
  if (res.status === 200) return { kind: 'already-present' };
  return { kind: 'error', status: res.status, code: 'UNRECOGNISED' };
}

/**
 * What `POST /watchlist` takes in `scope.dataKeys`: 1 to 100 keys
 * (`docs/API.md` §6, "Limits the API applies that this spec does not state").
 * The cap is the server's own choice and the server decides; the client only
 * uses the number to say what this scan declared, after the API has refused.
 */
export const WATCH_DATA_KEYS_MAX = 100;

/** `NETWORK_NOT_WRITABLE`, 422. Names no network and no date (claims-and-copy). */
export const NETWORK_NOT_WRITABLE_TEXT =
  'That network cannot be written to from here. Nothing was added.';

/** `INVALID_REQUEST`, 400 or 422. The client branches on the code, never on the message. */
export const INVALID_REQUEST_TEXT =
  'The API did not accept this request, so nothing was added. The scan above is unaffected: it read the chain directly.';

/** Appended to `INVALID_REQUEST_TEXT` only when the scan declared more keys than an item takes. */
export function tooManyKeysText(declared: number): string {
  return ` This scan declared ${declared} data keys, and a watchlist item takes at most ${WATCH_DATA_KEYS_MAX}.`;
}

/** `UPSTREAM_UNAVAILABLE`, 503. Says what the API said and no cause (§9). */
export const ADD_UPSTREAM_UNAVAILABLE_TEXT =
  'The API answered, but could not complete this. Nothing was confirmed as added.';

export interface OutcomeCopy {
  /** The chip class: only `healthy` for a confirmed write; `undetermined` otherwise. */
  readonly tone: 'healthy' | 'undetermined' | 'warning';
  readonly word: string;
  readonly html: string;
}

/** What a person reads. Only a 201 or 200 from the API says "added". */
export function addOutcomeCopy(
  outcome: AddOutcome,
  contractId: string,
  /** How many data keys the request carried. Only used to explain `INVALID_REQUEST`. */
  declaredDataKeys = 0,
): OutcomeCopy {
  const id = `<span class="mono">${esc(contractId.slice(0, 6))}…${esc(contractId.slice(-4))}</span>`;
  switch (outcome.kind) {
    case 'added':
      return { tone: 'healthy', word: 'added', html: `${id} is on your watchlist.` };
    case 'already-present':
      return {
        tone: 'healthy',
        word: 'already there',
        html: `${id} was already on your watchlist. Nothing changed.`,
      };
    case 'unavailable':
      return {
        tone: 'undetermined',
        word: 'undetermined',
        html:
          outcome.reason === 'network'
            ? 'The Evergreen API did not answer, so nothing was added. The scan above is unaffected: it read the chain directly.'
            : 'The Evergreen API is not available on this site yet, so nothing was added. The scan above is unaffected: it read the chain directly.',
      };
    case 'error':
      switch (outcome.code) {
        case 'UNAUTHENTICATED':
          return {
            tone: 'undetermined',
            word: 'not added',
            html: 'Not added. A watchlist belongs to a signed-in session, and this browser has none. <a href="/login/">Sign in</a>, then add it again.',
          };
        case 'CSRF_FAILED':
          return {
            tone: 'warning',
            word: 'not added',
            html: 'This page was open too long. Reload and try again.',
          };
        case 'RATE_LIMITED': {
          const s = outcome.retryAfterSeconds;
          const mins = s === undefined ? undefined : Math.max(1, Math.ceil(s / 60));
          return {
            tone: 'warning',
            word: 'not added',
            html:
              mins === undefined
                ? 'Too many attempts. Try again later.'
                : `Too many attempts. Try again in ${mins} minute${mins === 1 ? '' : 's'}.`,
          };
        }
        case 'NETWORK_UNAVAILABLE':
          return {
            tone: 'undetermined',
            word: 'not added',
            html: 'That network cannot be read here yet.',
          };
        case 'UPSTREAM_UNAVAILABLE':
          return {
            tone: 'undetermined',
            word: 'undetermined',
            html: ADD_UPSTREAM_UNAVAILABLE_TEXT,
          };
        case 'NETWORK_NOT_WRITABLE':
          return { tone: 'undetermined', word: 'not added', html: NETWORK_NOT_WRITABLE_TEXT };
        case 'INVALID_REQUEST':
          return {
            tone: 'undetermined',
            word: 'not added',
            html:
              INVALID_REQUEST_TEXT +
              (declaredDataKeys > WATCH_DATA_KEYS_MAX ? tooManyKeysText(declaredDataKeys) : ''),
          };
        default:
          return {
            tone: 'undetermined',
            word: 'undetermined',
            html: 'We could not establish whether this was added.',
          };
      }
  }
}

/** The chip plus sentence, as rendered into the scan panel. */
export function addOutcomeHtml(
  outcome: AddOutcome,
  contractId: string,
  declaredDataKeys = 0,
): string {
  const c = addOutcomeCopy(outcome, contractId, declaredDataKeys);
  return `<p class="small"><span class="chip ${c.tone}"><span class="shape"></span>${esc(c.word)}</span> ${c.html}</p>`;
}

export type RemoveOutcome =
  { readonly kind: 'removed' } | Exclude<ApiOutcome<unknown>, { kind: 'ok' }>;

/**
 * `DELETE /watchlist/{network}/{contractId}`, §6: `204`, a soft delete. Only a
 * 204 reads as removed; anything else is passed on for the screen to say, and
 * an unexpected success status is `UNRECOGNISED`, not removed.
 */
export async function removeFromWatchlist(
  network: 'testnet',
  contractId: string,
  fetchImpl?: FetchLike,
): Promise<RemoveOutcome> {
  const me = await apiRequest<Me>('/me', { method: 'GET' }, fetchImpl);
  if (me.kind !== 'ok') return me;
  if (typeof me.data?.csrfToken !== 'string' || me.data.csrfToken === '') {
    return { kind: 'error', status: me.status, code: 'UNRECOGNISED' };
  }
  const res = await apiRequest<unknown>(
    `/watchlist/${encodeURIComponent(network)}/${encodeURIComponent(contractId)}`,
    { method: 'DELETE', headers: { 'X-Evergreen-CSRF': me.data.csrfToken } },
    fetchImpl,
  );
  if (res.kind !== 'ok') return res;
  if (res.status === 204) return { kind: 'removed' };
  return { kind: 'error', status: res.status, code: 'UNRECOGNISED' };
}

export type AutopilotOffOutcome =
  { readonly kind: 'off' } | Exclude<ApiOutcome<unknown>, { kind: 'ok' }>;

/**
 * `PATCH /watchlist/{network}/{contractId}` with `autopilot: { enabled: false }`
 * (`docs/API.md` §6). It changes the stored setting only. It does not touch
 * the allowance on chain: only the wallet's own `approve(0)` revokes that.
 * Only a 2xx reads as off.
 */
export async function turnAutopilotOff(
  network: 'testnet',
  contractId: string,
  fetchImpl?: FetchLike,
): Promise<AutopilotOffOutcome> {
  const me = await apiRequest<Me>('/me', { method: 'GET' }, fetchImpl);
  if (me.kind !== 'ok') return me;
  if (typeof me.data?.csrfToken !== 'string' || me.data.csrfToken === '') {
    return { kind: 'error', status: me.status, code: 'UNRECOGNISED' };
  }
  const res = await apiRequest<unknown>(
    `/watchlist/${encodeURIComponent(network)}/${encodeURIComponent(contractId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Evergreen-CSRF': me.data.csrfToken },
      body: JSON.stringify({ autopilot: { enabled: false } }),
    },
    fetchImpl,
  );
  if (res.kind !== 'ok') return res;
  return { kind: 'off' };
}

export const LABEL_MAX_CHARS = 100;

export type RenameOutcome =
  | { readonly kind: 'renamed'; readonly label: string }
  | Exclude<ApiOutcome<unknown>, { kind: 'ok' }>;

/** A name the API will take (its `parseLabel`): 1 to 100 characters, no control characters. */
export function labelProblem(text: string): string | undefined {
  const t = text.trim();
  if (t === '') return 'Type a name.';
  if ([...t].length > LABEL_MAX_CHARS) return `A name is at most ${LABEL_MAX_CHARS} characters.`;
  // eslint-disable-next-line no-control-regex -- the API refuses control characters
  if (/[\u0000-\u001f\u007f]/.test(t)) return 'A name cannot contain control characters.';
  return undefined;
}

/**
 * `PATCH /watchlist/{network}/{contractId}` with `{ label }` (`docs/API.md` §6).
 * Only the name changes; scope and autopilot are left alone.
 */
export async function renameWatchItem(
  network: 'testnet',
  contractId: string,
  label: string,
  fetchImpl?: FetchLike,
): Promise<RenameOutcome> {
  const me = await apiRequest<Me>('/me', { method: 'GET' }, fetchImpl);
  if (me.kind !== 'ok') return me;
  if (typeof me.data?.csrfToken !== 'string' || me.data.csrfToken === '') {
    return { kind: 'error', status: me.status, code: 'UNRECOGNISED' };
  }
  const name = label.trim();
  const res = await apiRequest<unknown>(
    `/watchlist/${encodeURIComponent(network)}/${encodeURIComponent(contractId)}`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'X-Evergreen-CSRF': me.data.csrfToken },
      body: JSON.stringify({ label: name }),
    },
    fetchImpl,
  );
  if (res.kind !== 'ok') return res;
  return { kind: 'renamed', label: name };
}

/** What the panel says after Save. `undefined` when renamed: the panel redraws with the name. */
export function renameOutcomeText(o: RenameOutcome): string | undefined {
  if (o.kind === 'renamed') return undefined;
  if (o.kind === 'unavailable')
    return 'The Evergreen API did not answer, so the name was not saved. Try again.';
  if (o.code === 'UNAUTHENTICATED') return 'This browser is signed out. Sign in and try again.';
  if (o.code === 'INVALID_REQUEST')
    return `The API refused that name. Use 1 to ${LABEL_MAX_CHARS} characters.`;
  if (o.code === 'NOT_FOUND')
    return 'This contract is no longer on your watchlist. Reload the page.';
  if (o.code === 'CSRF_FAILED') return 'This page was open too long. Reload and try again.';
  return `The API did not confirm the new name (${o.code}, HTTP ${o.status}).`;
}
