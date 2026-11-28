import { describe, expect, test } from 'vitest';
import type { ScanResult } from '../../../packages/shared-types/src/index';
import { rememberedScan, rememberScan } from '../src/lib/scan-share';

describe('shared scanner results', () => {
  test('a scan stored in this tab is readable by contract id', () => {
    const store = new Map<string, string>();
    const memory = {
      getItem: (key: string) => store.get(key) ?? null,
      setItem: (key: string, value: string) => void store.set(key, value),
    };
    Object.defineProperty(globalThis, 'localStorage', { value: memory, configurable: true });
    rememberScan('C'.padEnd(56, 'A'), { network: 'testnet' } as ScanResult);
    expect(rememberedScan('C'.padEnd(56, 'A'))).toEqual({ network: 'testnet' });
    expect(rememberedScan('missing')).toBeUndefined();
  });
});
