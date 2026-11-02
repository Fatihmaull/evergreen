/**
 * What /login/ says when a wallet is unlinked (PH2-E3-01).
 *
 * The sentence that matters is that unlinking does NOT revoke the allowance —
 * it lives on the chain, signed by the user's own wallet, and nothing an email
 * session does can end it. A person who unlinks and believes they are
 * "disconnected" would be wrong in the way that costs money, so every outcome
 * that could leave that impression carries the sentence and the link, and a
 * test holds them to it rather than a review.
 */
import { describe, expect, test } from 'vitest';
import {
  UNLINK_DOES_NOT_REVOKE_TEXT,
  unlinkOutcomeHtml,
  type UnlinkOutcome,
} from '../src/lib/login-view';

const ACCOUNT = 'GABC…WXYZ';
const text = (outcome: UnlinkOutcome): string =>
  unlinkOutcomeHtml(outcome, ACCOUNT).replace(/<[^>]*>/g, '');

describe('unlink outcomes', () => {
  test.each(['unlinked', 'pays-for-watched'] as const)(
    '%s says unlinking does not revoke, and links to the revoke screen',
    (kind) => {
      const html = unlinkOutcomeHtml({ kind }, ACCOUNT);
      expect(html).toContain(UNLINK_DOES_NOT_REVOKE_TEXT);
      expect(html).toContain('href="/allowance/"');
    },
  );

  test('pays-for-watched points at the watchlist and names no contract', () => {
    const html = unlinkOutcomeHtml({ kind: 'pays-for-watched' }, ACCOUNT);
    // The API's 409 carries no list (apps/api/src/auth/routes.ts), so a screen
    // that named contracts would be inventing them.
    expect(html).toContain('href="/dashboard/watchlist/"');
    expect(html).not.toMatch(/\bC[A-Z2-7]{55}\b/);
  });

  test('the sentence is true of the chain, not a promise about the product', () => {
    expect(UNLINK_DOES_NOT_REVOKE_TEXT).toMatch(/stays on the chain/);
    expect(UNLINK_DOES_NOT_REVOKE_TEXT).not.toMatch(/disconnect|safe|protected|cancel/i);
  });

  test('not-linked, csrf and signed-out make no claim about the allowance', () => {
    for (const kind of ['not-linked', 'csrf-failed', 'signed-out'] as const) {
      expect(text({ kind }), kind).not.toMatch(/allowance|revoke/i);
    }
  });

  test('every outcome is non-empty and mentions no amount, protocol version or mainnet', () => {
    for (const kind of [
      'unlinked',
      'pays-for-watched',
      'not-linked',
      'csrf-failed',
      'signed-out',
    ] as const) {
      const t = text({ kind });
      expect(t.length, kind).toBeGreaterThan(10);
      expect(t, kind).not.toMatch(/mainnet|protocol \d|XLM|stroops/i);
    }
  });
});
