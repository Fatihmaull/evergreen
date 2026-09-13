import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { BumpDecision, EvergreenConfig, ScanResult } from '@evergreen-stellar/shared-types';
import { scanContract } from '../src/scan-contract.js';
import { createMockReader } from './mock-rpc.js';
import { planEngineExecution } from '../src/engine-execution-plan.js';
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const raw = JSON.parse(
  readFileSync(new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url), 'utf8'),
).result as { latestLedger: number; entries: { key: string; xdr: string }[] };
const persistent = raw.entries[2]!.key;
const config: EvergreenConfig = {
  network: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  defaults: { bumpWhenRemainingLedgersBelow: 100, extendToLedgers: 1000 },
  contracts: [{ id: A, payer: 'payer', dataKeys: raw.entries.slice(2).map((e) => e.key) }],
  payers: { payer: { signer: 'ed25519', secretEnvVar: 'UNREAD' } },
};
async function scan(): Promise<ScanResult> {
  return scanContract(
    createMockReader(
      1000,
      raw.entries.map((e) => ({ key: e.key, entryXdr: e.xdr, liveUntilLedgerSeq: 1050 })),
    ),
    { id: A },
    config.contracts[0]!.dataKeys,
  );
}
function decision(key = persistent): Extract<BumpDecision, { action: 'extend' }> {
  return {
    action: 'extend',
    entryKey: key,
    contracts: [A],
    payer: 'payer',
    extendToLedgers: 1000,
    reason: 'Due engine entry',
  };
}
describe('exact engine execution selection', () => {
  it('selects only the due persistent key, without adding the instance', async () => {
    const result = planEngineExecution(await scan(), [decision()], config);
    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]).toMatchObject({
      payer: 'payer',
      entry: {
        entryKey: persistent,
        kind: 'persistent',
        extendToLedgers: 1000,
        before: { observedAtLedger: 1000, endsAtLedger: 1050 },
      },
    });
  });
  it.each([1, 3])('records excluded code/temporary selection as a skip (%s)', async (index) => {
    const result = planEngineExecution(await scan(), [decision(raw.entries[index]!.key)], config);
    expect(result.entries).toEqual([]);
    expect(result.decisions[0]?.action).toBe('skip');
  });
  it('rejects duplicate selections before any execution', async () => {
    const input = await scan();
    expect(() => planEngineExecution(input, [decision(), decision()], config)).toThrow(/Duplicate/);
  });
  it('rejects an undeclared persistent key', async () => {
    const input = await scan();
    expect(() =>
      planEngineExecution(input, [decision()], {
        ...config,
        contracts: [{ id: A, payer: 'payer' }],
      }),
    ).toThrow(/declared/);
  });
  it('refuses a forged payer or target', async () => {
    const input = await scan();
    expect(() => planEngineExecution(input, [{ ...decision(), payer: 'other' }], config)).toThrow(
      /payer/i,
    );
    expect(() =>
      planEngineExecution(input, [{ ...decision(), extendToLedgers: 1001 }], config),
    ).toThrow(/target/i);
  });
  it('rejects a key with mismatched lifecycle metadata', async () => {
    const input = await scan();
    const key = raw.entries[3]!.key;
    const changed = {
      ...input,
      entries: {
        ...input.entries,
        [key]: {
          ...input.entries[key]!,
          kind: 'persistent' as const,
          endBehavior: 'archived' as const,
        },
      },
    };
    expect(() => planEngineExecution(changed, [decision(key)], config)).toThrow(/key|kind/i);
  });
  it('does not accept unreadable or expired selected data', async () => {
    const input = await scan();
    expect(() =>
      planEngineExecution(
        {
          ...input,
          issues: [
            { kind: 'rpc-error', entryKey: persistent, contracts: [A], message: 'read failed' },
          ],
        },
        [decision()],
        config,
      ),
    ).toThrow(/unreadable/i);
    const entry = input.entries[persistent]!;
    expect(() =>
      planEngineExecution(
        {
          ...input,
          entries: {
            ...input.entries,
            [persistent]: {
              ...entry,
              ttl: { status: 'known', remainingLedgers: -1, endsAtLedger: 999 },
            },
          },
        },
        [decision()],
        config,
      ),
    ).toThrow(/live/i);
  });
});
