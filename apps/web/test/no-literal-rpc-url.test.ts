/**
 * No page prints an RPC address it did not read from `NETWORK`.
 *
 * `scan-panel.ts` and `blast-radius.ts` told a user whose read failed that
 * "the endpoint is https://soroban-testnet.stellar.org" — true only for the
 * default build. With `EVERGREEN_WEB_RPC_URL` set, the error named an endpoint
 * the page never called (CEF's note on #355). Every address shown comes from
 * `lib/network.ts`, which resolves it from core's table once.
 */
import { describe, expect, test } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const RPC_LITERAL = /https?:\/\/[a-z0-9.-]*soroban[a-z0-9.-]*\.stellar\.org/i;

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.(ts|mjs)$/.test(name) ? [path] : [];
  });
}

describe('RPC addresses come from NETWORK', () => {
  test('no source file under apps/web/src carries a literal Soroban RPC URL', () => {
    const offenders = sources(SRC).filter((path) => RPC_LITERAL.test(readFileSync(path, 'utf8')));
    expect(offenders.map((p) => p.slice(SRC.length))).toEqual([]);
  });

  test('apps/web/scripts carries none either: the snapshot reads the endpoint the pages read', () => {
    const scripts = fileURLToPath(new URL('../scripts/', import.meta.url));
    const offenders = sources(scripts).filter((path) =>
      RPC_LITERAL.test(readFileSync(path, 'utf8')),
    );
    expect(offenders.map((p) => p.slice(scripts.length))).toEqual([]);
    expect(readFileSync(join(scripts, 'make-snapshot.mjs'), 'utf8')).toContain(
      'connectTestnet(NETWORK.rpcUrl)',
    );
  });

  test('the two failure panels name the endpoint through NETWORK.rpcUrl', () => {
    for (const file of ['lib/scan-panel.ts', 'pages/blast-radius.ts']) {
      expect(readFileSync(join(SRC, file), 'utf8')).toContain('${esc(NETWORK.rpcUrl)}');
    }
  });
});
