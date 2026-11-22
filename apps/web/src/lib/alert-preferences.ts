/**
 * Read and write alert preferences (docs/API.md §6a, PH2-E2-06).
 *
 * This module stores a boolean. It does not send mail, does not read
 * `ALERTS_SEND`, and does not build or submit a transaction. An email
 * session never authorises anything that moves XLM.
 */
import { apiRequest, type ApiOutcome, type FetchLike } from './api';

export const OPTIONAL_ORDER = [
  'allowance_expiring',
  'approaching_critical',
  'extend_succeeded',
] as const;

export const REQUIRED_ORDER = [
  'preflight_failed',
  'allowance_missing',
  'extend_failed_refund',
  'refund_delayed',
  'unexplained_charge',
  'testnet_reset',
  'restore_lost_changes',
] as const;

export type OptionalKind = (typeof OPTIONAL_ORDER)[number];
export type RequiredKind = (typeof REQUIRED_ORDER)[number];
export type AlertKindName = OptionalKind | RequiredKind;

const KIND_CLASS: Readonly<Record<AlertKindName, 'optional' | 'required'>> = {
  allowance_expiring: 'optional',
  approaching_critical: 'optional',
  extend_succeeded: 'optional',
  preflight_failed: 'required',
  allowance_missing: 'required',
  extend_failed_refund: 'required',
  refund_delayed: 'required',
  unexplained_charge: 'required',
  testnet_reset: 'required',
  restore_lost_changes: 'required',
};

export interface PreferenceItem {
  readonly kind: AlertKindName;
  readonly class: 'optional' | 'required';
  readonly enabled: boolean;
  readonly defaultOn: boolean;
  readonly stored: boolean;
}

/**
 * The only requests this screen makes. A send, a dispatch, or any other
 * path throws here, and the test fails if the throw is removed.
 */
const ALLOWED_REQUESTS = new Set([
  'GET /me',
  'GET /me/alert-preferences',
  'PATCH /me/alert-preferences',
]);

export function assertPreferenceRequest(method: string, path: string): void {
  if (!ALLOWED_REQUESTS.has(`${method} ${path}`)) {
    throw new Error(`refused ${method} ${path}`);
  }
}

/** `{ kind, enabled }` and nothing else. Reset is not a control on this page. */
export function preferencePatchBody(
  kind: OptionalKind,
  enabled: boolean,
): { readonly kind: OptionalKind; readonly enabled: boolean } {
  return { kind, enabled };
}

export function isOptionalKind(kind: string): kind is OptionalKind {
  return (OPTIONAL_ORDER as readonly string[]).includes(kind);
}

function isKind(kind: string): kind is AlertKindName {
  return Object.hasOwn(KIND_CLASS, kind);
}

/** The ten kinds, each once, or null. A partial list is not a preference read. */
export function parsePreferenceItems(value: unknown): PreferenceItem[] | null {
  if (!Array.isArray(value) || value.length !== 10) return null;
  const seen = new Set<string>();
  const items: PreferenceItem[] = [];
  for (const raw of value) {
    if (typeof raw !== 'object' || raw === null) return null;
    const row = raw as Record<string, unknown>;
    const keys = Object.keys(row);
    if (
      keys.length !== 5 ||
      !keys.includes('kind') ||
      !keys.includes('class') ||
      !keys.includes('enabled') ||
      !keys.includes('defaultOn') ||
      !keys.includes('stored')
    ) {
      return null;
    }
    if (typeof row['kind'] !== 'string' || !isKind(row['kind'])) return null;
    if (seen.has(row['kind'])) return null;
    seen.add(row['kind']);
    const expected = KIND_CLASS[row['kind']];
    if (row['class'] !== expected) return null;
    if (typeof row['enabled'] !== 'boolean' || typeof row['defaultOn'] !== 'boolean') return null;
    if (typeof row['stored'] !== 'boolean') return null;
    if (expected === 'required') {
      if (row['enabled'] !== true || row['stored'] !== false || row['defaultOn'] !== true)
        return null;
    } else if (row['defaultOn'] !== true) {
      return null;
    }
    items.push({
      kind: row['kind'],
      class: expected,
      enabled: row['enabled'],
      defaultOn: row['defaultOn'],
      stored: row['stored'],
    });
  }
  if (seen.size !== 10) return null;
  return items;
}

interface MeBody {
  readonly csrfToken?: unknown;
  readonly user?: { readonly email?: unknown };
}

interface PrefsBody {
  readonly items?: unknown;
}

export type PreferenceRead =
  | { readonly kind: 'no-session' }
  | { readonly kind: 'unavailable' }
  | { readonly kind: 'upstream' }
  | { readonly kind: 'unreadable' }
  | {
      readonly kind: 'ready';
      readonly email: string | null;
      readonly items: readonly PreferenceItem[];
    };

function emailOf(me: ApiOutcome<MeBody>): string | null {
  if (me.kind !== 'ok') return null;
  const email = me.data?.user?.email;
  return typeof email === 'string' && email.length > 0 ? email : null;
}

function fromPrefs(prefs: ApiOutcome<PrefsBody>, me: ApiOutcome<MeBody>): PreferenceRead {
  if (prefs.kind === 'error' && prefs.code === 'UNAUTHENTICATED') return { kind: 'no-session' };
  if (prefs.kind === 'unavailable') return { kind: 'unavailable' };
  if (prefs.kind === 'error' && prefs.code === 'UPSTREAM_UNAVAILABLE') return { kind: 'upstream' };
  if (prefs.kind !== 'ok') return { kind: 'unreadable' };
  const items = parsePreferenceItems(prefs.data?.items);
  if (items === null) return { kind: 'unreadable' };
  return { kind: 'ready', email: emailOf(me), items };
}

export async function loadPreferences(fetchImpl?: FetchLike): Promise<PreferenceRead> {
  assertPreferenceRequest('GET', '/me');
  assertPreferenceRequest('GET', '/me/alert-preferences');
  const [me, prefs] = await Promise.all([
    apiRequest<MeBody>('/me', { method: 'GET' }, fetchImpl),
    apiRequest<PrefsBody>('/me/alert-preferences', { method: 'GET' }, fetchImpl),
  ]);
  return fromPrefs(prefs, me);
}

export type SaveOutcome =
  | { readonly kind: 'saved'; readonly items: readonly PreferenceItem[] }
  | { readonly kind: 'not-saved' };

export async function savePreference(
  kind: OptionalKind,
  enabled: boolean,
  fetchImpl?: FetchLike,
): Promise<SaveOutcome> {
  assertPreferenceRequest('GET', '/me');
  const me = await apiRequest<MeBody>('/me', { method: 'GET' }, fetchImpl);
  if (me.kind !== 'ok' || typeof me.data?.csrfToken !== 'string' || me.data.csrfToken === '') {
    return { kind: 'not-saved' };
  }
  const body = preferencePatchBody(kind, enabled);
  assertPreferenceRequest('PATCH', '/me/alert-preferences');
  const res = await apiRequest<PrefsBody>(
    '/me/alert-preferences',
    {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Evergreen-CSRF': me.data.csrfToken,
      },
      body: JSON.stringify(body),
    },
    fetchImpl,
  );
  if (res.kind !== 'ok') return { kind: 'not-saved' };
  const items = parsePreferenceItems(res.data?.items);
  if (items === null) return { kind: 'not-saved' };
  return { kind: 'saved', items };
}
