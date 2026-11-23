/**
 * The Overview's watchlist panel, from fixtures, with no network.
 *
 * It counts with `rowFor`, so it can never call healthy what the watchlist
 * screen would not, and every non-list outcome is the screen's own sentence.
 */
import { describe, expect, test } from 'vitest';
import { watchlistScreenHtml, watchlistSummaryHtml } from '../src/lib/watchlist-view';
import { A, B, C, item } from './fixtures/watchlist-example';

const NOW = new Date('2026-10-19T04:00:53Z');
const ok = (items: unknown) => ({ kind: 'ok', status: 200, data: { items } }) as const;

describe('watchlist summary on the Overview', () => {
  test('counts each conclusion and links the watchlist', () => {
    const html = watchlistSummaryHtml(
      ok([item(A), item(B), item(C, { lastObservation: null })]),
      NOW,
    );
    expect(html).toContain('1 healthy');
    expect(html).toContain('1 at risk');
    expect(html).toContain('1 undetermined');
    expect(html).toContain('3 contracts watched');
    expect(html).toContain('href="/dashboard/watchlist/"');
  });

  test('a contract the engine has not observed is never counted healthy', () => {
    const html = watchlistSummaryHtml(ok([item(A, { lastObservation: null })]), NOW);
    expect(html).toContain('0 healthy');
    expect(html).toContain('1 undetermined');
    expect(html).toContain('1 contract watched');
  });

  test('signed in with nothing watched says so, with no example rows', () => {
    const html = watchlistSummaryHtml(ok([]), NOW);
    expect(html).toContain('Signed in. Nothing watched yet.');
    expect(html).not.toContain('chip');
  });

  test('signed out links sign-in and shows no count', () => {
    const html = watchlistSummaryHtml(
      { kind: 'error', status: 401, code: 'UNAUTHENTICATED', message: '' } as never,
      NOW,
    );
    expect(html).toContain('href="/login/"');
    expect(html).not.toContain('chip');
  });

  test.each([
    { kind: 'unavailable', reason: 'no-api' } as const,
    { kind: 'unavailable', reason: 'network' } as const,
    { kind: 'error', status: 503, code: 'UPSTREAM_UNAVAILABLE', message: '' } as const,
  ])("outcome $kind $reason$code shows no count, in the screen's words", (outcome) => {
    const summary = watchlistSummaryHtml(outcome as never, NOW);
    expect(summary).not.toContain('chip');
    expect(summary).not.toContain('healthy');
    const sentence = /<p class="headline">(.*)<\/p>/.exec(
      watchlistScreenHtml(outcome as never, NOW),
    )?.[1];
    expect(sentence).toBeDefined();
    expect(summary).toContain(sentence!);
  });
});
