/** PH2-E3-02: the Remove button and what each DELETE answer says. No network. */
import { describe, expect, test } from 'vitest';
import { removeOutcomeText, tableHtml } from '../src/lib/watchlist-view';
import { A, item } from './fixtures/watchlist-example';

describe('remove button', () => {
  test('every row carries a Remove button for its own contract', () => {
    const html = tableHtml([item(A)], new Date('2026-10-19T04:00:53Z'));
    expect(html).toContain('>Remove</button>');
    expect(html).toContain(`data-remove-contract="${item(A).contractId}"`);
    expect(html).toContain('data-remove-network="testnet"');
  });

  test('only a 204 removes; nothing is said, the row goes', () => {
    expect(removeOutcomeText({ kind: 'removed' })).toBeUndefined();
  });

  test('UNAUTHENTICATED reads as signed out, nothing removed', () => {
    const t = removeOutcomeText({ kind: 'error', status: 401, code: 'UNAUTHENTICATED' });
    expect(t).toMatch(/signed out/);
    expect(t).toMatch(/nothing was removed/i);
  });

  test('any other error names its code and says the contract stays', () => {
    const t = removeOutcomeText({ kind: 'error', status: 404, code: 'NOT_FOUND' as never });
    expect(t).toContain('NOT_FOUND');
    expect(t).toContain('still on your watchlist');
  });

  test('no API is not success', () => {
    expect(removeOutcomeText({ kind: 'unavailable', reason: 'network' })).toMatch(
      /Nothing was removed/,
    );
    expect(removeOutcomeText({ kind: 'unavailable', reason: 'no-api' })).toMatch(
      /Nothing was removed/,
    );
  });
});
