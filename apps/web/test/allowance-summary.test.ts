/**
 * The top of /allowance/ after DES QA (2026-11-24): no wallet is one line and
 * a Connect button; the wallet balance appears only once read, never as
 * "not yet available" or zero.
 */
import { expect, test } from 'vitest';
import { allowanceFactsHtml, allowanceNextHtml } from '../src/lib/allowance-summary';

test('no wallet: one line and Connect Freighter, no figure', () => {
  const html = allowanceNextHtml({ kind: 'no-wallet' });
  expect(html).toContain('No wallet linked');
  expect(html).toContain('data-connect');
  expect(html).not.toContain('next-figure');
});

test('the wallet balance cell exists only when read', () => {
  expect(
    allowanceFactsHtml('GBNCEF5FV44CFHVFGJKRG7SK3QPJYFI34J7PPRHBCHWZYCU5VCOCJ6AM'),
  ).not.toContain('Wallet balance');
  const read = allowanceFactsHtml(undefined, 123_456_789n);
  expect(read).toContain('Wallet balance');
  expect(read).toContain('12.3456789 XLM');
});
