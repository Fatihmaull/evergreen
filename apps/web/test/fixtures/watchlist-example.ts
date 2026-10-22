/**
 * EXAMPLE DATA, for tests only. Never imported by `src/`.
 *
 * Watch items in spec #350 §6's shape, built from the committed scan in
 * `data/snapshot.json` (captured 2026-10-19), split per contract. The screen
 * itself shows no example data: see `watchlistScreenHtml`.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { ScanResult } from '../../src/lib/evergreen';
import type { WatchItem } from '../../src/lib/watchlist-view';

const snapshot = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../data/snapshot.json', import.meta.url)), 'utf8'),
) as { capturedAt: string; result: ScanResult };

export const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
export const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
export const C = 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL';

export function scanOf(id: string): ScanResult {
  const r = snapshot.result;
  return {
    ...r,
    contracts: r.contracts.filter((c) => c.id === id),
    entries: Object.fromEntries(
      Object.entries(r.entries).filter(([, e]) => e.contracts.includes(id)),
    ),
    issues: [],
  };
}

export const OBSERVED_AT_LEDGER = 5_271_773;

export function item(id: string, over: Partial<WatchItem> = {}): WatchItem {
  return {
    network: 'testnet',
    contractId: id,
    addedAt: '2026-10-19T00:00:00Z',
    scope: { noDataKeys: true },
    autopilot: { enabled: false },
    extendNow: { limitPerDay: 3, usedToday: 0, resetsAt: '2026-10-20T00:00:00Z' },
    lastObservation: {
      observedAtLedger: OBSERVED_AT_LEDGER,
      observedAt: snapshot.capturedAt,
      scan: scanOf(id),
      health: 'healthy',
    },
    ...over,
  };
}
