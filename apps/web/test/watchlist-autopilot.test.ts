/** PH2-E3-02: autopilot status, and lastObservation null (Stage 1 dry run) shown honestly. */
import { describe, expect, test } from 'vitest';
import { autopilotCell, rowFor, tableHtml, type WatchItem } from '../src/lib/watchlist-view';
import { A, item } from './fixtures/watchlist-example';

const on = (base: WatchItem): WatchItem =>
  ({
    ...base,
    lastObservation: null,
    autopilot: {
      enabled: true,
      payerWallet: 'GA2VPKMOGKHNIKK2BFVJYWDHDTOYUEZETHE74ZZQCSSCQHBTKKDTYQZL',
      thresholdLedgers: 17_280,
      extendToLedgers: 120_960,
    },
  }) as WatchItem;

describe('autopilot cell', () => {
  test('off says Off', () => {
    expect(autopilotCell({ ...item(A), autopilot: { enabled: false } } as WatchItem)).toContain(
      'Off',
    );
  });
  test('on with no observation: settings shown, and no claim that anything was decided', () => {
    const w = on(item(A));
    const html = autopilotCell(w);
    expect(html).toContain('On');
    expect(html).toContain('17,280');
    expect(html).toContain('120,960');
    expect(html).toContain('GA2VPK…DTYQZL');
    expect(html).toContain('has not decided anything');
    expect(html).not.toMatch(/safe|protected|healthy/i);
    expect(rowFor(w).conclusion).toBe('undetermined');
    expect(tableHtml([w])).toContain('<th scope="col">Autopilot</th>');
  });
  test('missing autopilot field is undetermined, not Off', () => {
    const w = { ...item(A), autopilot: undefined } as unknown as WatchItem;
    expect(autopilotCell(w)).toContain('undetermined');
  });
});
