/**
 * PH2-E3-02 / PH2-E3-03: the sentences the watchlist UI shows for the answers
 * the deployed API (`PH2-E2-05`, #427) gives, locked word for word.
 *
 * Every sentence here is a claim the site makes. Each test fails if a word
 * changes, and the "no cause" tests fail if a sentence starts naming one.
 * No DOM, no network.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, test } from 'vitest';
import { API_ERROR_CODES, apiRequest, type FetchLike } from '../src/lib/api';
import {
  ADD_UPSTREAM_UNAVAILABLE_TEXT,
  INVALID_REQUEST_TEXT,
  NETWORK_NOT_WRITABLE_TEXT,
  WATCH_DATA_KEYS_MAX,
  addOutcomeCopy,
  tooManyKeysText,
} from '../src/lib/watchlist';
import {
  GET_UPSTREAM_UNAVAILABLE_TEXT,
  REMOVE_NOTHING_TO_REMOVE_TEXT,
  removeOutcomeText,
  watchlistScreenHtml,
} from '../src/lib/watchlist-view';

const ID = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const err = (status: number, code: string) =>
  ({ kind: 'error', status, code }) as Parameters<typeof addOutcomeCopy>[0];

const docs = readFileSync(fileURLToPath(new URL('../../../docs/API.md', import.meta.url)), 'utf8');

describe('INVALID_REQUEST is a known code, not UNRECOGNISED', () => {
  test('the client knows it, and the spec names it', () => {
    expect(API_ERROR_CODES).toContain('INVALID_REQUEST');
    expect(docs).toContain('`INVALID_REQUEST`');
  });

  test.each([400, 422])('an HTTP %i envelope keeps its code', async (status) => {
    const f: FetchLike = async () =>
      new Response(
        JSON.stringify({
          error: {
            code: 'INVALID_REQUEST',
            message: 'x',
            retryable: false,
            details: { field: 'scope.dataKeys' },
          },
        }),
        { status, headers: { 'Content-Type': 'application/json' } },
      );
    expect(await apiRequest('/watchlist', {}, f)).toEqual({
      kind: 'error',
      status,
      code: 'INVALID_REQUEST',
      retryable: false,
    });
  });

  test('NETWORK_NOT_WRITABLE was already known', () => {
    expect(API_ERROR_CODES).toContain('NETWORK_NOT_WRITABLE');
  });
});

describe('add: the sentences, word for word', () => {
  test('NETWORK_NOT_WRITABLE (422)', () => {
    expect(NETWORK_NOT_WRITABLE_TEXT).toBe(
      'That network cannot be written to from here. Nothing was added.',
    );
    const c = addOutcomeCopy(err(422, 'NETWORK_NOT_WRITABLE'), ID);
    expect(c).toEqual({ tone: 'undetermined', word: 'not added', html: NETWORK_NOT_WRITABLE_TEXT });
  });

  test('NETWORK_NOT_WRITABLE names no network and gives no date', () => {
    expect(NETWORK_NOT_WRITABLE_TEXT).not.toMatch(/mainnet|testnet|until|soon|yet|DoD|\d{4}/i);
  });

  test('INVALID_REQUEST (400), with 100 or fewer keys', () => {
    expect(INVALID_REQUEST_TEXT).toBe(
      'The API did not accept this request, so nothing was added. The scan above is unaffected: it read the chain directly.',
    );
    expect(addOutcomeCopy(err(400, 'INVALID_REQUEST'), ID).html).toBe(INVALID_REQUEST_TEXT);
    expect(addOutcomeCopy(err(400, 'INVALID_REQUEST'), ID, WATCH_DATA_KEYS_MAX).html).toBe(
      INVALID_REQUEST_TEXT,
    );
  });

  test('INVALID_REQUEST (422) reads the same: the code decides, not the status', () => {
    expect(addOutcomeCopy(err(422, 'INVALID_REQUEST'), ID).html).toBe(INVALID_REQUEST_TEXT);
  });

  test('INVALID_REQUEST with more keys than an item takes says how many were declared', () => {
    expect(tooManyKeysText(101)).toBe(
      ' This scan declared 101 data keys, and a watchlist item takes at most 100.',
    );
    expect(addOutcomeCopy(err(400, 'INVALID_REQUEST'), ID, 101).html).toBe(
      `${INVALID_REQUEST_TEXT} This scan declared 101 data keys, and a watchlist item takes at most 100.`,
    );
  });

  test('the key cap quoted is the one docs/API.md §6 states', () => {
    expect(WATCH_DATA_KEYS_MAX).toBe(100);
    expect(docs).toContain('`scope.dataKeys`: 1 to 100 keys');
  });

  test('UPSTREAM_UNAVAILABLE (503) says what the API said and names no cause', () => {
    expect(ADD_UPSTREAM_UNAVAILABLE_TEXT).toBe(
      'The API answered, but could not complete this. Nothing was confirmed as added.',
    );
    expect(addOutcomeCopy(err(503, 'UPSTREAM_UNAVAILABLE'), ID).html).toBe(
      ADD_UPSTREAM_UNAVAILABLE_TEXT,
    );
  });

  test('no add sentence claims a cause, a person, a provider or safety', () => {
    for (const text of [
      NETWORK_NOT_WRITABLE_TEXT,
      INVALID_REQUEST_TEXT,
      tooManyKeysText(101),
      ADD_UPSTREAM_UNAVAILABLE_TEXT,
    ]) {
      expect(text).not.toMatch(
        /sandbox|resend|tih|database|rpc|upstream|setting|config|deploy|because|fully safe|mainnet/i,
      );
    }
  });

  test('none of the new outcomes reads as added or healthy', () => {
    for (const o of [
      err(422, 'NETWORK_NOT_WRITABLE'),
      err(400, 'INVALID_REQUEST'),
      err(503, 'UPSTREAM_UNAVAILABLE'),
    ]) {
      const c = addOutcomeCopy(o, ID, 150);
      expect(c.tone).not.toBe('healthy');
      expect(c.word).not.toBe('added');
      expect(c.html).not.toMatch(/is on your watchlist|already on your watchlist/);
    }
  });
});

describe('remove: the sentences, word for word', () => {
  test('DELETE 404 NOT_FOUND', () => {
    expect(REMOVE_NOTHING_TO_REMOVE_TEXT).toBe('Nothing to remove for this account.');
    expect(removeOutcomeText(err(404, 'NOT_FOUND'))).toBe('Nothing to remove for this account.');
  });

  test('a code other than NOT_FOUND is not read as "nothing to remove"', () => {
    for (const o of [err(503, 'UPSTREAM_UNAVAILABLE'), err(403, 'CSRF_FAILED')]) {
      expect(removeOutcomeText(o)).not.toBe(REMOVE_NOTHING_TO_REMOVE_TEXT);
    }
  });

  test('any other error says only what the API did not confirm', () => {
    expect(removeOutcomeText(err(503, 'UPSTREAM_UNAVAILABLE'))).toBe(
      'The API did not confirm this removal (UPSTREAM_UNAVAILABLE, HTTP 503).',
    );
    expect(removeOutcomeText(err(403, 'CSRF_FAILED'))).toBe(
      'The API did not confirm this removal (CSRF_FAILED, HTTP 403).',
    );
  });

  test('no remove sentence says the contract is still listed', () => {
    for (const o of [
      err(404, 'NOT_FOUND'),
      err(503, 'UPSTREAM_UNAVAILABLE'),
      err(400, 'INVALID_REQUEST'),
      err(418, 'UNRECOGNISED'),
    ]) {
      expect(removeOutcomeText(o)).not.toMatch(/still on|still listed|watchlist/i);
    }
  });
});

describe('GET /watchlist: 503 says what the API said and no cause', () => {
  test('the sentence, word for word', () => {
    expect(GET_UPSTREAM_UNAVAILABLE_TEXT).toBe(
      'The API answered, but could not complete this, so the watchlist could not be read. This is about us, not your contracts.',
    );
    const html = watchlistScreenHtml(err(503, 'UPSTREAM_UNAVAILABLE') as never);
    expect(html).toContain(GET_UPSTREAM_UNAVAILABLE_TEXT);
    expect(html).toContain('chip undetermined');
    expect(html).not.toContain('<table');
    expect(html).not.toContain('chip healthy');
  });

  test('names no database, RPC, provider or setting', () => {
    expect(GET_UPSTREAM_UNAVAILABLE_TEXT).not.toMatch(
      /database|rpc|resend|sandbox|tih|setting|config|because/i,
    );
  });
});
