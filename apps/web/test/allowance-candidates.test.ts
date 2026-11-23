/** PH2-E3-05 § B: the cap prefilled from the watchlist. Pure, no network. */
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_EXTEND_TO_LEDGERS,
  capContracts,
  capRows,
  capRowsHtml,
  extendToFor,
  type CapRow,
} from '../src/lib/allowance-candidates';
import type { WatchItem } from '../src/lib/watchlist-view';
import { A, B, C, item } from './fixtures/watchlist-example';

const ME = 'GA2VPKMOGKHNIKK2BFVJYWDHDTOYUEZETHE74ZZQCSSCQHBTKKDTYQZL';
const OTHER = 'GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H';
const offItem = (id: string): WatchItem =>
  ({ ...item(id), autopilot: { enabled: false } }) as WatchItem;
const onItem = (id: string, payer: string, extendTo?: number): WatchItem =>
  ({
    ...item(id),
    autopilot: {
      enabled: true,
      payerWallet: payer,
      thresholdLedgers: 17_280,
      extendToLedgers: extendTo,
    },
  }) as WatchItem;

describe('which contracts this wallet can pay for', () => {
  test('off rows and rows this wallet already pays; ?for= first and the only one checked', () => {
    const rows = capRows([offItem(A), onItem(B, ME), onItem(C, OTHER)], ME, B);
    expect(rows.map((r) => r.item.contractId)).toEqual([B, A]);
    expect(rows.map((r) => r.checked)).toEqual([true, false]);
    expect(rows.every((r) => r.rent.kind === 'simulating')).toBe(true);
  });

  test('mainnet rows are never listed', () => {
    const main = { ...offItem(A), network: 'mainnet' } as WatchItem;
    expect(capRows([main], ME, undefined)).toEqual([]);
  });
});

describe('the extend horizon of one pull', () => {
  test("an item's own extendToLedgers wins; otherwise the default", () => {
    expect(extendToFor(onItem(A, ME, 120_960))).toBe(120_960);
    expect(extendToFor(offItem(A))).toBe(DEFAULT_EXTEND_TO_LEDGERS);
  });
});

describe('what enters the cap', () => {
  const rows: CapRow[] = [
    {
      item: offItem(A),
      checked: true,
      rent: { kind: 'ok', stroops: 61_234n, atLedger: 5_400_000 },
    },
    {
      item: offItem(B),
      checked: false,
      rent: { kind: 'ok', stroops: 48_903n, atLedger: 5_400_000 },
    },
    { item: offItem(C), checked: true, rent: { kind: 'failed' } },
  ];
  test('only checked rows with a fully simulated rent, never a guess', () => {
    expect(capContracts(rows, 2n)).toEqual([{ simulatedRentStroops: 61_234n, hostedActions: 2n }]);
  });
  test('a partial simulation is left out too', () => {
    const partial: CapRow[] = [{ ...rows[0]!, rent: { kind: 'partial', excluded: 1 } }];
    expect(capContracts(partial, 2n)).toEqual([]);
  });
  test('rows say why they are out, and their box cannot be ticked', () => {
    const html = capRowsHtml(rows);
    expect(html).toContain('61,234 stroops');
    expect(html).toContain('Rent could not be simulated, so this contract is left out of the cap.');
    expect(html).toMatch(/data-cap-row="2"[^>]*disabled/);
  });
  test('no eligible contract says so and points to the scanner', () => {
    expect(capRowsHtml([])).toContain('href="/dashboard/scanner/"');
  });
});
