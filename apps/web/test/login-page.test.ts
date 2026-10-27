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
      new Set([
        '/me',
        '/auth/email/start',
        '/auth/email/verify',
        '/auth/logout',
        '/wallets/challenge',
        '/wallets',
      ]),
    );
    const templated = [...client.matchAll(/apiRequest<[^>]*>\(\s*`([^`]+)`/g)].map(([, p]) => p);
    expect(templated).toEqual(['/wallets/${encodeURIComponent(account)}']);
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

describe('the send-code failure copy', () => {
  const branch = (from: string, to: string): string => {
    const at = page.indexOf(from);
    expect(at).toBeGreaterThan(-1);
    return page.slice(at, page.indexOf(to, at));
  };

  test('a 503 says nothing was sent, with the "HTTP <status> <code>." line, and names no cause', () => {
    const block = branch("r.kind === 'not-sent'", "r.kind === 'email-not-sent'");
    expect(block).toContain('NOT_SENT_TEXT');
    expect(block).toContain('esc(r.detail)');
    expect(block).not.toMatch(/resend|sender|sandbox|deploy/i);
  });

  test('a 502 EMAIL_NOT_SENT shows its own sentence, and the page never claims a code was sent', () => {
    const block = branch("r.kind === 'email-not-sent'", '} else {');
    expect(block).toContain('note(EMAIL_NOT_SENT_TEXT)');
    expect(block).not.toMatch(/sentText|resend|sender|sandbox|deploy/i);
  });

  test('the not-sent and email-not-sent branches are plain notes: no panel, no chip, no countdown', () => {
    const block = branch("r.kind === 'not-sent'", '} else {\n      out.innerHTML = undetermined');
    expect(block).toContain('note(');
    expect(block).not.toMatch(/undetermined\(|chip|lockUntilRetryAfter|setCodeFormVisible/);
  });

  test('"a code is on its way" is built only in the sent branch', () => {
    expect(page.match(/sentText\(/g)).toHaveLength(1);
    const at = page.indexOf('sentText(');
    expect(at).toBeGreaterThan(page.indexOf("r.kind === 'sent'"));
    expect(at).toBeLessThan(page.indexOf("r.kind === 'rate-limited'"));
  });

  test('the page holds none of the locked sentences itself: they come from lib/login-view', () => {
    for (const sentence of [
      'That code did not work',
      'Too many codes asked for',
      'The code could not be sent to that address',
      'The service could not send the code',
      'a code is on its way',
    ]) {
      expect(page).not.toContain(sentence);
    }
  });
});

describe('the sign-in state of the page', () => {
  test('signing in hides the code form and clears the field, inside renderSession', () => {
    const at = page.indexOf('function renderSession');
    const block = page.slice(at, page.indexOf('async function signOut'));
    expect(block).toContain("setCodeFormVisible($('code-form'), false)");
    expect(block).toContain("$<HTMLInputElement>('code').value = ''");
    expect(block).toContain('logout-button');
  });

  test('a locked button blocks the submit, and unlocking happens only at the end of the countdown', () => {
    expect(page).toContain('if (cancelCooldown !== undefined) return;');
    expect(page).toContain('if (cancelCooldown === undefined) button.disabled = false;');
    const block = page.slice(page.indexOf('onDone:'));
    expect(block.slice(0, 200)).toContain('button.disabled = false');
  });
});

describe('stale text', () => {
  test('neither the page nor its header comment claims the API is not deployed or does not exist', () => {
    const raw = read('../src/pages/login.ts') + read('../src/pages/login.mjs');
    expect(raw).not.toMatch(/when it is deployed|does not exist yet|until then this page/i);
  });
});
