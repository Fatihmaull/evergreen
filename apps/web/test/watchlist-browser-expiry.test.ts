/**
 * PH2-E3-02: binding expiry for a row the engine has not observed yet.
 *
 * Stage 1 stores `lastObservation: null`. The page reads the chain itself for
 * those rows; that read fills the binding expiry and nothing else.
 */
import { describe, expect, test } from 'vitest';
import { rowFor, rowHtml, tableHtml } from '../src/lib/watchlist-view';
import { A, B, item, scanOf } from './fixtures/watchlist-example';

const NOW = new Date('2026-10-19T04:00:53Z');

describe('browser read of an unobserved row', () => {
  test('fills the binding expiry, keeps health undetermined', () => {
    const r = rowFor(item(A, { lastObservation: null }), NOW, scanOf(A));
    expect(r.binding).toMatchObject({ state: 'live', kind: 'code', endsAtLedger: 8_297_162 });
    expect(r.conclusion).toBe('undetermined');
    expect(r.bindingSource).toBe('browser');
  });

  test('renders ledgers left with approximate days and says who read it', () => {
    const html = rowHtml(rowFor(item(A, { lastObservation: null }), NOW, scanOf(A)));
    expect(html).toMatch(/ledgers left \(about [\d.]+ days?\)/);
    expect(html).toContain('read by this browser');
    expect(html).toContain('not an engine check');
    expect(html).not.toContain('chip healthy');
  });

  test('an expired binding from a browser read is shown, still undetermined', () => {
    const r = rowFor(item(B, { lastObservation: null }), NOW, scanOf(B));
    expect(r.binding).toMatchObject({ state: 'expired' });
    expect(r.conclusion).toBe('undetermined');
  });

  test('no browser read leaves the row exactly as before', () => {
    const r = rowFor(item(A, { lastObservation: null }), NOW);
    expect(r.binding).toEqual({ state: 'undetermined' });
    expect(r.why).toBe('Not scanned yet.');
  });

  test('an engine observation is never replaced by a browser read', () => {
    const r = rowFor(item(A), NOW, scanOf(B));
    expect(r.bindingSource).toBe('engine');
    expect(r.binding).toMatchObject({ kind: 'code' });
  });

  test('tableHtml takes the map by contract id', () => {
    const html = tableHtml([item(A, { lastObservation: null })], NOW, new Map([[A, scanOf(A)]]));
    expect(html).toContain('8,297,162');
  });
});
