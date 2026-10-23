/**
 * /login/ (PH2-E3-01): what it may store, what it may call, and what its
 * bundle may contain.
 */
import { describe, expect, test } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
const page = strip(read('../src/pages/login.ts'));
const client = strip(read('../src/lib/login.ts'));

describe('login stores nothing from a signed-in call', () => {
  test('no browser storage API in the page or the wallet modules it imports', () => {
    for (const src of [
      page,
      client,
      strip(read('../src/lib/api.ts')),
      strip(read('../src/lib/wallet.ts')),
      strip(read('../src/lib/wallet-freighter.ts')),
    ]) {
      expect(src).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|caches\./);
    }
  });
});

describe('login calls only the routes API spec #350 states', () => {
  test('every apiRequest() path is one of #350’s login and account routes', () => {
    const paths = [...client.matchAll(/apiRequest<[^>]*>\(\s*'([^']+)'/g)].map(([, p]) => p);
    expect(new Set(paths)).toEqual(
      new Set(['/me', '/auth/email/start', '/auth/email/verify', '/wallets/challenge', '/wallets']),
    );
  });
});

describe('login reaches the API only through the same-origin proxy', () => {
  test('API_BASE is relative /api/v1 and no absolute URL is fetched', () => {
    expect(strip(read('../src/lib/api.ts'))).toMatch(/export const API_BASE = '\/api\/v1';/);
    for (const src of [page, client]) {
      expect(src).not.toMatch(/fetch\(/);
      expect(src).not.toMatch(/https?:\/\//);
      expect(src).not.toMatch(/workers\.dev/);
    }
  });
});

describe('the login bundle carries no money path', () => {
  test('it does not import wallet-money', () => {
    expect(page).not.toMatch(/wallet-money/);
  });
  const built = fileURLToPath(new URL('../../dashboard/public/assets/login.js', import.meta.url));
  test.runIf(existsSync(built))('the published bundle names no submit or send call', () => {
    expect(readFileSync(built, 'utf8')).not.toMatch(/sendTransaction|submitTransaction/);
  });
});

describe('copy', () => {
  test('never says an email session can move money, and never says data is deleted', () => {
    const copy = read('../src/pages/login.mjs') + page;
    expect(copy).toContain('Signing in with email cannot move XLM');
    // Fatih, 2026-10-22: a reactivated account resumes nothing that spends from email alone.
    expect(copy).toContain('Signing in again does not resume anything that spends');
    expect(copy).not.toMatch(/\bdeleted?\b/i);
  });
});
