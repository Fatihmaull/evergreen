/**
 * Naming a contract from the side panel (fatih, 2026-11-27): "Add a name" or
 * Rename beside the name, saved with `PATCH /watchlist/{network}/{id}` `{ label }`.
 */
import { describe, expect, test } from 'vitest';
import { panelHtml, panelNameHtml, renameFormHtml } from '../src/lib/overview-view';
import { labelProblem, renameOutcomeText, renameWatchItem } from '../src/lib/watchlist';
import { rowFor } from '../src/lib/watchlist-view';
import { A, item } from './fixtures/watchlist-example';

const NOW = new Date('2026-10-19T12:00:00Z');

describe('the name line', () => {
  test('🔴 an unlabelled contract offers "Add a name"; a named one offers Rename', () => {
    expect(panelNameHtml(item(A))).toContain('Unlabelled contract');
    expect(panelNameHtml(item(A))).toContain(`data-rename="${A}">Add a name</button>`);
    expect(panelNameHtml(item(A, { label: 'payments-v2' }))).toContain('>Rename</button>');
    expect(panelHtml(rowFor(item(A), NOW))).toContain('data-rename=');
    expect(panelHtml(rowFor(item(A), NOW), 'contracts')).toContain('data-rename=');
  });
  test('the form starts with the current name, escaped', () => {
    const html = renameFormHtml(item(A, { label: '<b>x</b>' }));
    expect(html).toContain('value="&lt;b&gt;x&lt;/b&gt;"');
    expect(html).toContain(`data-rename-form="${A}"`);
  });
});

describe('the rules the API applies', () => {
  test('🔴 1 to 100 characters, trimmed, no control characters', () => {
    expect(labelProblem('  ')).toBeDefined();
    expect(labelProblem('a'.repeat(101))).toBeDefined();
    expect(labelProblem('a\u0007b')).toBeDefined();
    expect(labelProblem(' payments-v2 ')).toBeUndefined();
    expect(labelProblem('a'.repeat(100))).toBeUndefined();
  });
});

describe('the request', () => {
  test('🔴 PATCH with the CSRF token and only the trimmed label', async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
      });
    const out = await renameWatchItem('testnet', A, '  payments-v2 ', async (url, init) => {
      calls.push({ url, ...(init === undefined ? {} : { init }) });
      return url.endsWith('/me') ? json(200, { csrfToken: 't0k' }) : json(200, {});
    });
    expect(out).toEqual({ kind: 'renamed', label: 'payments-v2' });
    const patch = calls[1]!;
    expect(patch.url).toBe(`/api/v1/watchlist/testnet/${A}`);
    expect(patch.init?.method).toBe('PATCH');
    expect(patch.init?.headers).toMatchObject({ 'X-Evergreen-CSRF': 't0k' });
    expect(JSON.parse(String(patch.init?.body))).toEqual({ label: 'payments-v2' });
  });
  test('a refusal says the name was not saved', () => {
    expect(renameOutcomeText({ kind: 'renamed', label: 'x' })).toBeUndefined();
    expect(renameOutcomeText({ kind: 'unavailable', reason: 'network' })).toContain('not saved');
    expect(renameOutcomeText({ kind: 'error', status: 400, code: 'INVALID_REQUEST' })).toContain(
      '1 to 100',
    );
  });
});
