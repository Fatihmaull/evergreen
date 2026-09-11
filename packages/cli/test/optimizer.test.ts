import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { readerFromFixture } from '../../core/test/mock-rpc.js';
import { runCli } from '../src/command.js';
import { formatStorageAdvice } from '../src/optimizer.js';
import { analyzeStorage, scanContract } from '@evergreen-stellar/core';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const file = new URL('../../core/test/fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url)
  .pathname;
const keys = JSON.parse(readFileSync(file, 'utf8'))
  .result.entries.slice(2)
  .map((e: { key: string }) => e.key);
function dependencies() {
  return {
    connect: vi.fn(async () => readerFromFixture(file)),
    readKeysFile: vi.fn(async () => JSON.stringify({ dataKeys: keys })),
    now: () => new Date('2026-09-10T00:00:00Z'),
    readStorageSettings: vi.fn(async () => ({
      minTemporaryTtl: 720,
      minPersistentTtl: 120960,
      observedAtLedger: 4519665,
    })),
    priceExtend: vi.fn(
      async () =>
        ({
          totalStroops: '100',
          rentStroops: '0',
          otherStroops: '100',
          entryCount: 1,
          additionalLedgers: 1000,
          cappedEntryCount: 0,
          maxEntryTtl: 3110400,
          pricedAtLedger: 4519665,
          rentByEntry: { [keys[0]]: '0' },
        }) as const,
    ),
  };
}
describe('opt-in scan storage advice', () => {
  it('adds only optimization to JSON and preserves exits without extra pricing', async () => {
    const deps = dependencies();
    const args = ['scan', A, '--keys-file', 'keys.json', '--json'];
    const plain = await runCli(args, deps);
    expect(deps.readStorageSettings).not.toHaveBeenCalled();
    const enhanced = await runCli([...args, '--optimize'], deps);
    const original = JSON.parse(plain.stdout),
      output = JSON.parse(enhanced.stdout);
    expect(output.optimization.findings).toHaveLength(3);
    delete output.optimization;
    expect(output).toEqual(original);
    expect(enhanced.exitCode).toBe(plain.exitCode);
    expect(deps.readStorageSettings).toHaveBeenCalledTimes(1);
    expect(deps.priceExtend).not.toHaveBeenCalled();
  });
  it('reuses the cost callback once and retains a measured zero', async () => {
    const deps = dependencies();
    const output = await runCli(
      [
        'scan',
        A,
        '--keys-file',
        'keys.json',
        '--optimize',
        '--cost',
        '--ledgers',
        '1000',
        '--json',
      ],
      deps,
    );
    const data = JSON.parse(output.stdout);
    expect(data.cost).toBeDefined();
    expect(
      data.optimization.findings.find((f: { entryKey: string }) => f.entryKey === keys[0])
        .currentRent,
    ).toEqual({ status: 'quoted', stroops: '0' });
    expect(deps.priceExtend).toHaveBeenCalledTimes(1);
    expect(deps.readStorageSettings).toHaveBeenCalledTimes(1);
  });
  it('keeps advice and scan data when optional pricing/settings fail without leaking provider errors', async () => {
    const deps = dependencies();
    deps.priceExtend.mockRejectedValue(new Error('PRIVATE TOKEN'));
    deps.readStorageSettings.mockRejectedValue(new Error('PRIVATE TOKEN'));
    const output = await runCli(
      ['scan', A, '--keys-file', 'keys.json', '--optimize', '--cost', '--json'],
      deps,
    );
    const data = JSON.parse(output.stdout);
    expect(data.entries).toBeDefined();
    expect(data.optimization.findings).toHaveLength(3);
    expect(data.cost).toBeUndefined();
    expect(data.optimization.context.settings).toBeUndefined();
    expect(output.stdout + output.stderr).not.toContain('PRIVATE TOKEN');
  });
  it('rejects repeated optimize before RPC', async () => {
    const deps = dependencies();
    const output = await runCli(['scan', A, '--optimize', '--optimize'], deps);
    expect(output.exitCode).toBe(2);
    expect(deps.connect).not.toHaveBeenCalled();
  });
  it('prints sources, current observations and qualified historical prices for a human', async () => {
    const result = await scanContract(readerFromFixture(file), { id: A }, keys);
    const text = formatStorageAdvice(analyzeStorage(result, {})).join('\n');
    expect(text).toContain('Historical');
    expect(text).toContain('103849');
    expect(text).toContain('53196');
    expect(text).toContain('688');
    expect(text).toContain('not current');
    expect(text).toContain('Current rent: unavailable');
    expect(text).toContain('isolated temporary-entry experiment');
    expect(text).toContain('outside this scan');
  });
  it('appends advice in human mode even after a failed quote', async () => {
    const deps = dependencies();
    deps.priceExtend.mockRejectedValue(new Error('private'));
    const output = await runCli(['scan', A, '--optimize', '--cost'], deps);
    expect(output.stdout).toContain('Could not price');
    expect(output.stdout).toContain('Storage advice');
    expect(output.stdout).not.toContain('private');
  });
});
