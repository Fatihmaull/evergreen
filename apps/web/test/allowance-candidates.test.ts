/** PH2-E3-05 § B: the cap prefilled from the watchlist. Pure, no network. */
import { describe, expect, test } from 'vitest';
import {
  DEFAULT_EXTEND_TO_LEDGERS,
  DEFAULT_THRESHOLD_LEDGERS,
  parseLedgers,
  rowRentHtml,
  rowUsable,
  settingsProblem,
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

describe('Act below and Extend to (#648)', () => {
  test('an Off row starts at 17,280 and 518,400; an On row keeps its own', () => {
    const [on, off] = capRows([onItem(B, ME, 120_960), offItem(A)], ME, B);
    expect([on!.thresholdLedgers, on!.extendToLedgers]).toEqual([17_280, 120_960]);
    expect([off!.thresholdLedgers, off!.extendToLedgers]).toEqual([
      DEFAULT_THRESHOLD_LEDGERS,
      DEFAULT_EXTEND_TO_LEDGERS,
    ]);
  });

  test('only whole ledgers above zero parse; commas are allowed, nothing is coerced', () => {
    expect(parseLedgers('518,400')).toBe(518_400);
    expect(parseLedgers('0')).toBeUndefined();
    expect(parseLedgers('1.5')).toBeUndefined();
    expect(parseLedgers('')).toBeUndefined();
  });

  test('Extend to at or under Act below is refused and the row leaves the cap', () => {
    const row: CapRow = {
      item: offItem(A),
      checked: true,
      rent: { kind: 'ok', stroops: 1_000n, atLedger: 1 },
      thresholdLedgers: 17_280,
      extendToLedgers: 17_280,
    };
    expect(settingsProblem(row)).toBe('Extend to must be more than Act below.');
    expect(capContracts([row], 2n)).toEqual([]);
    expect(capRowsHtml([row])).toMatch(/data-cap-row="0"[^>]*disabled/);
    expect(settingsProblem({ ...row, extendToLedgers: 17_281 })).toBeUndefined();
    expect(settingsProblem({ ...row, thresholdLedgers: undefined })).toMatch(/whole numbers/);
  });
});

describe('what enters the cap', () => {
  const set = { thresholdLedgers: 17_280, extendToLedgers: 518_400 };
  const rows: CapRow[] = [
    {
      item: offItem(A),
      checked: true,
      rent: { kind: 'ok', stroops: 61_234n, atLedger: 5_400_000 },
      ...set,
    },
    {
      item: offItem(B),
      checked: false,
      rent: { kind: 'ok', stroops: 48_903n, atLedger: 5_400_000 },
      ...set,
    },
    { item: offItem(C), checked: true, rent: { kind: 'failed' }, ...set },
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

describe('one row is redrawn in place (DES review of #651)', () => {
  test('the rent cell and box state come from the row alone, and rows are addressable', () => {
    const [row] = capRows([offItem(A)], ME, A);
    expect(rowRentHtml(row!)).toContain('simulating…');
    expect(rowUsable(row!)).toBe(false);
    const priced = { ...row!, rent: { kind: 'ok', stroops: 61_234n, atLedger: 1 } } as CapRow;
    expect(rowUsable(priced)).toBe(true);
    expect(rowRentHtml(priced)).toContain('61,234 stroops');
    expect(rowRentHtml({ ...priced, extendToLedgers: 1 })).toMatch(/more than Act below/);
    const html = capRowsHtml([priced]);
    expect(html).toContain('data-cap-index="0"');
    expect(html).toContain('<td data-cap-rent>');
  });
});
