/**
 * /login/ (PH2-E3-01): unlinking is not revoking, and the page says where the revoke lives.
 */
import { describe, expect, test } from 'vitest';
import { render } from '../src/pages/login.mjs';

describe('login wallet section points to the revoke', () => {
  const html: string = render();
  test('says unlinking does not revoke the allowance and links to /allowance/', () => {
    expect(html).toContain('Unlinking a wallet from your account does not revoke the allowance');
    expect(html).toMatch(/<a href="\/allowance\/">Revoke it on the allowance page<\/a>/);
  });
  test('names no fee figure and no "fully safe" claim', () => {
    expect(html).not.toMatch(/fully safe|\d+(\.\d+)?\s*%|stroops/i);
  });
});
