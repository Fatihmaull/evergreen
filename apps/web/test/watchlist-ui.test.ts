/**
 * PH2-E3-02: the watchlist screen, from fixtures, with no network.
 *
 * Binding expiry first; three honest states; no example data on screen.
 */
import { describe, expect, test } from 'vitest';
import { rowFor, orderRows, tableHtml, watchlistScreenHtml } from '../src/lib/watchlist-view';
import { A, B, C, item, OBSERVED_AT_LEDGER } from './fixtures/watchlist-example';

const NOW = new Date('2026-10-19T04:00:53Z');

describe('binding expiry leads', () => {
  test("A's binding entry is the shared code entry, not its instance", () => {
    const r = rowFor(item(A), NOW);
    expect(r.binding).toMatchObject({ state: 'live', kind: 'code', endsAtLedger: 8_297_162 });
    expect(r.conclusion).toBe('healthy');
  });

  test('an archived instance binds absolutely and is at risk even if health says healthy', () => {
    const r = rowFor(item(B), NOW);
    expect(r.binding).toMatchObject({ state: 'expired', word: 'archived', kind: 'instance' });
    expect(r.conclusion).toBe('at-risk');
  });

  test('order: expired, then undetermined, then live soonest first', () => {
    const rows = orderRows([
      rowFor(item(A), NOW),
      rowFor(item(C, { lastObservation: null }), NOW),
      rowFor(item(B), NOW),
    ]);
    expect(rows.map((r) => r.item.contractId)).toEqual([B, C, A]);
  });

  test('binding expiry is the first column', () => {
    const html = tableHtml([item(A)], NOW);
    expect(html.indexOf('Binding expiry')).toBeLessThan(html.indexOf('Health'));
    expect(html).toContain('8,297,162');
  });
});

describe('three honest states', () => {
  test('no observation yet is undetermined, never healthy', () => {
    expect(rowFor(item(A, { lastObservation: null }), NOW).conclusion).toBe('undetermined');
  });

  test("health 'unknown' is undetermined", () => {
    const base = item(A);
    const r = rowFor(
      { ...base, lastObservation: { ...base.lastObservation!, health: 'unknown' } },
      NOW,
    );
    expect(r.conclusion).toBe('undetermined');
  });

  test('a health state without observedAtLedger is undetermined (§9a P0 rule)', () => {
    const base = item(A);
    const broken = { ...base.lastObservation!, observedAtLedger: undefined as unknown as number };
    const r = rowFor({ ...base, lastObservation: broken }, NOW);
    expect(r.conclusion).toBe('undetermined');
    expect(tableHtml([{ ...base, lastObservation: broken }], NOW)).not.toContain('chip healthy');
  });

  test("'healthy' with no entries read is undetermined, not healthy", () => {
    const base = item(A);
    const empty = {
      ...base.lastObservation!,
      scan: { ...base.lastObservation!.scan, entries: {} },
    };
    expect(rowFor({ ...base, lastObservation: empty }, NOW).conclusion).toBe('undetermined');
  });

  test('warning and critical are at risk', () => {
    const base = item(A);
    for (const health of ['warning', 'critical'] as const) {
      expect(
        rowFor({ ...base, lastObservation: { ...base.lastObservation!, health } }, NOW).conclusion,
      ).toBe('at-risk');
    }
  });

  test('the observation ledger is shown beside the state', () => {
    expect(tableHtml([item(A)], NOW)).toContain(OBSERVED_AT_LEDGER.toLocaleString('en-US'));
  });
});

describe('the screen', () => {
  test('API absent: undetermined, and no contract rows', () => {
    for (const reason of ['network', 'no-api'] as const) {
      const html = watchlistScreenHtml({ kind: 'unavailable', reason }, NOW);
      expect(html).toContain('chip undetermined');
      expect(html).not.toContain('<table');
      expect(html).not.toMatch(/example data/i);
      expect(html).not.toContain('chip healthy');
    }
  });

  test('UNAUTHENTICATED shows no data', () => {
    const html = watchlistScreenHtml({ kind: 'error', status: 401, code: 'UNAUTHENTICATED' }, NOW);
    expect(html).not.toContain('<table');
  });

  test('an unknown code or a malformed body is undetermined', () => {
    expect(
      watchlistScreenHtml({ kind: 'error', status: 418, code: 'UNRECOGNISED' }, NOW),
    ).toContain('could not establish');
    expect(watchlistScreenHtml({ kind: 'ok', status: 200, data: {} }, NOW)).toContain(
      'could not establish',
    );
  });

  test('an empty list is an empty list, not an error', () => {
    expect(watchlistScreenHtml({ kind: 'ok', status: 200, data: { items: [] } }, NOW)).toContain(
      'empty',
    );
  });

  test('an empty 200 says signed in and nothing watched, and keeps the empty sentence', () => {
    const html = watchlistScreenHtml({ kind: 'ok', status: 200, data: { items: [] } }, NOW);
    expect(html).toContain('Signed in. Nothing watched yet.');
    expect(html).toContain('Your watchlist is empty. Add a contract from');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('chip healthy');
    expect(html).not.toMatch(/verdict/);
  });

  test('"signed in" appears only for a 200 with a list', () => {
    const others = [
      { kind: 'unavailable', reason: 'network' },
      { kind: 'unavailable', reason: 'no-api' },
      { kind: 'error', status: 401, code: 'UNAUTHENTICATED' },
      { kind: 'error', status: 404, code: 'NOT_FOUND' },
      { kind: 'error', status: 405, code: 'METHOD_NOT_ALLOWED' },
      { kind: 'error', status: 503, code: 'UPSTREAM_UNAVAILABLE' },
      { kind: 'error', status: 418, code: 'UNRECOGNISED' },
      { kind: 'ok', status: 200, data: {} },
    ] as const;
    for (const o of others) {
      expect(watchlistScreenHtml(o, NOW)).not.toMatch(/signed in\. nothing watched/i);
    }
    const withRows = watchlistScreenHtml(
      { kind: 'ok', status: 200, data: { items: [item(A)] } },
      NOW,
    );
    expect(withRows).not.toContain('Nothing watched yet');
  });

  test.each([
    [404, 'NOT_FOUND'],
    [405, 'METHOD_NOT_ALLOWED'],
  ] as const)('%s %s is "route not available", not "could not establish"', (status, code) => {
    const html = watchlistScreenHtml({ kind: 'error', status, code }, NOW);
    expect(html).toContain('The watchlist route is not available on this API yet.');
    expect(html).toContain('chip undetermined');
    expect(html).not.toContain('could not establish');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('chip healthy');
    // No cause and no date: it says only what the API answered.
    expect(html).not.toMatch(/deploy|soon|will be|because|20\d\d/i);
  });

  test('UNAUTHENTICATED keeps the signed-out card', () => {
    const html = watchlistScreenHtml({ kind: 'error', status: 401, code: 'UNAUTHENTICATED' }, NOW);
    expect(html).toContain('card card-pad');
    expect(html).toContain('this browser has none');
    expect(html).not.toContain('route is not available');
  });

  test('rendered rows carry no fabricated figures or forbidden copy', () => {
    const html = watchlistScreenHtml(
      {
        kind: 'ok',
        status: 200,
        data: { items: [item(A), item(B), item(C, { lastObservation: null })] },
      },
      NOW,
    );
    expect(html).not.toMatch(/\bNaN\b|\bundefined\b|\[object Object\]|-[\d,]{4,}|fully safe/);
  });
});
