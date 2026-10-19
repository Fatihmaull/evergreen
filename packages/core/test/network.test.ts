import { describe, expect, it } from 'vitest';
import {
  NETWORKS,
  NetworkConfigError,
  NetworkMismatchError,
  RPC_PROVIDERS_URL,
  connectNetwork,
  resolveNetwork,
} from '../src/network.js';
import { scanInstances } from '../src/scan.js';
import { instanceKey } from '../src/rpc.js';
import { createMockReader } from './mock-rpc.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const fakeServer = (passphrase: string) => ({
  getNetwork: async () => ({ passphrase }),
  getLedgerEntries: async () => ({ latestLedger: 1, entries: [] }),
});

describe('resolveNetwork — choosing the network (PH2-E1-03)', () => {
  it('defaults to testnet and its public RPC', () => {
    expect(resolveNetwork({})).toEqual({
      name: 'testnet',
      passphrase: 'Test SDF Network ; September 2015',
      rpcUrl: 'https://soroban-testnet.stellar.org',
    });
  });

  it('lets the flag win over EVERGREEN_NETWORK, in both directions', () => {
    expect(resolveNetwork({ flag: 'testnet', env: 'mainnet' }).name).toBe('testnet');
    expect(
      resolveNetwork({ flag: 'mainnet', env: 'testnet', rpcUrl: 'https://m.example' }).name,
    ).toBe('mainnet');
  });

  it('reads EVERGREEN_NETWORK when there is no flag, and treats an empty value as unset', () => {
    expect(resolveNetwork({ env: 'mainnet', rpcUrl: 'https://m.example' }).name).toBe('mainnet');
    expect(resolveNetwork({ env: '' }).name).toBe('testnet');
  });

  it('refuses mainnet without an explicit RPC, naming the variable and the provider list', () => {
    expect(() => resolveNetwork({ flag: 'mainnet' })).toThrow(NetworkConfigError);
    expect(() => resolveNetwork({ flag: 'mainnet' })).toThrow(/SOROBAN_RPC_URL/);
    expect(() => resolveNetwork({ flag: 'mainnet' })).toThrow(RPC_PROVIDERS_URL);
  });

  it('uses the given RPC for mainnet, with the mainnet passphrase', () => {
    expect(resolveNetwork({ flag: 'mainnet', rpcUrl: 'https://m.example' })).toEqual({
      name: 'mainnet',
      passphrase: 'Public Global Stellar Network ; September 2015',
      rpcUrl: 'https://m.example',
    });
  });

  it('refuses a network it does not know, rather than guessing', () => {
    for (const name of ['futurenet', 'Mainnet', 'public']) {
      expect(() => resolveNetwork({ flag: name })).toThrow(NetworkConfigError);
    }
  });

  it('keeps one table: mainnet has no default RPC, testnet has the SDF one', () => {
    expect(NETWORKS.mainnet.defaultRpcUrl).toBeUndefined();
    expect(NETWORKS.testnet.defaultRpcUrl).toBe('https://soroban-testnet.stellar.org');
  });
});

describe('connectNetwork — the RPC must serve the chosen network', () => {
  it('refuses a mainnet RPC when testnet was chosen', async () => {
    const choice = resolveNetwork({});
    await expect(
      connectNetwork(choice, fakeServer(NETWORKS.mainnet.passphrase) as never),
    ).rejects.toThrow(NetworkMismatchError);
  });

  it('refuses a testnet RPC when mainnet was chosen — the label is never trusted', async () => {
    const choice = resolveNetwork({
      flag: 'mainnet',
      rpcUrl: 'https://looks-like-mainnet.example',
    });
    await expect(
      connectNetwork(choice, fakeServer(NETWORKS.testnet.passphrase) as never),
    ).rejects.toThrow(NetworkMismatchError);
  });

  it('returns a reader tagged with the verified network', async () => {
    const choice = resolveNetwork({ flag: 'mainnet', rpcUrl: 'https://m.example' });
    const reader = await connectNetwork(choice, fakeServer(NETWORKS.mainnet.passphrase) as never);
    expect(reader.network).toBe('mainnet');
  });
});

describe('a scan reports the network its reader was verified against', () => {
  it('says mainnet for a mainnet reader, and testnet for an untagged one', async () => {
    const key = instanceKey(A);
    const rows = [{ key, liveUntilLedgerSeq: 5_000_100 }];
    const mainnet = { ...createMockReader(5_000_000, rows), network: 'mainnet' as const };
    expect((await scanInstances(mainnet, [{ id: A }])).network).toBe('mainnet');
    expect((await scanInstances(createMockReader(5_000_000, rows), [{ id: A }])).network).toBe(
      'testnet',
    );
  });
});
