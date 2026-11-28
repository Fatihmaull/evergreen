/**
 * A browser scan, kept in localStorage so another tab in this browser can
 * show the expiry before it asks the chain again.
 *
 * The API has no field for a browser scan. `lastObservation` is the engine's.
 * This store does not change that. The health conclusion stays undetermined
 * until the engine checks; the chip says "read here" when this browser has
 * a live expiry. Clearing site data drops the store.
 */
import type { ScanResult } from '../../../../packages/shared-types/src/index';

const KEY = 'evergreen.shared-scans.v1';

function store(): Storage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function rememberScan(id: string, result: ScanResult): void {
  const box = store();
  if (box === undefined) return;
  try {
    const raw = box.getItem(KEY);
    const all = raw === null ? {} : (JSON.parse(raw) as Record<string, ScanResult>);
    all[id] = result;
    box.setItem(KEY, JSON.stringify(all));
  } catch {
    // The scan is still on screen. The next page reads the chain itself.
  }
}

export function rememberedScan(id: string): ScanResult | undefined {
  const box = store();
  if (box === undefined) return undefined;
  try {
    const raw = box.getItem(KEY);
    if (raw === null) return undefined;
    const all = JSON.parse(raw) as Record<string, unknown>;
    const hit = all[id];
    if (hit === null || typeof hit !== 'object') return undefined;
    return hit as ScanResult;
  } catch {
    return undefined;
  }
}
