/**
 * In-memory `AlertPreferencesStore` for tests. It records whatever the route
 * asks it to write, including a required kind, so a missing route guard shows
 * up as a row. The Postgres store refuses required kinds again; this one does
 * not, or that second refusal would hide a hole in the route.
 */
import { ALERT_SPECS, type AlertKind } from './policy.js';
import type { AlertPreferencesStore } from './preferences.js';

export interface PreferenceRow {
  readonly enabled: boolean;
  readonly updatedAt: number;
}

export class MemoryAlertPreferencesStore implements AlertPreferencesStore {
  readonly rows = new Map<string, Map<AlertKind, PreferenceRow>>();

  async get(userId: string): Promise<Partial<Record<AlertKind, boolean>>> {
    const mine = this.rows.get(userId);
    if (mine === undefined) return {};
    const prefs: Partial<Record<AlertKind, boolean>> = {};
    for (const [kind, row] of mine) prefs[kind] = row.enabled;
    return prefs;
  }

  async set(userId: string, kind: AlertKind, enabled: boolean, nowSeconds: number): Promise<void> {
    const mine = this.rows.get(userId) ?? new Map<AlertKind, PreferenceRow>();
    mine.set(kind, { enabled, updatedAt: nowSeconds });
    this.rows.set(userId, mine);
  }

  async reset(userId: string, kind: AlertKind, nowSeconds: number): Promise<void> {
    const mine = this.rows.get(userId);
    const row = mine?.get(kind);
    if (mine === undefined || row === undefined) return;
    mine.set(kind, { enabled: ALERT_SPECS[kind].defaultOn, updatedAt: nowSeconds });
  }
}
