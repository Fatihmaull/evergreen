/**
 * A scan made on the Scanner page, kept for this tab so Contracts and
 * Overview can show that reading before they ask the chain again.
 * The health conclusion stays the engine's: this only fills the expiry.
 */
import type { ScanResult } from '../../../../packages/shared-types/src/index';

const KEY = 'evergreen.shared-scans.v1';

export function rememberScan(id: string, result: ScanResult): void {
  if (typeof sessionStorage === 'undefined') return;
  try {
    const raw = sessionStorage.getItem(KEY);
    const all = raw === null ? {} : (JSON.parse(raw) as Record<string, ScanResult>);
    all[id] = result;
    sessionStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // The scan is still on the scanner. Contracts reads the chain itself.
  }
}

export function rememberedScan(id: string): ScanResult | undefined {
  if (typeof sessionStorage === 'undefined') return undefined;
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw === null) return undefined;
    const all = JSON.parse(raw) as Record<string, unknown>;
    const hit = all[id];
    if (hit === null || typeof hit !== 'object') return undefined;
    return hit as ScanResult;
  } catch {
    return undefined;
  }
}
