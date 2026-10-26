import { describe, expect, it, vi } from 'vitest';
import { runExtendCli } from '../src/extend.js';
import { runCli } from '../src/command.js';
import { readerFromFixture } from '../../core/test/mock-rpc.js';

// PH2-E1-04: `extend` refuses mainnet until DoD-2 is met (PH2-E5-02) (AGENTS.md hard
// rule 1, PH2-E5-02). The refusal is the CLI's own, before `run` is called,
// so an operator who chose mainnet reads why instead of a generic
// "preparation failed" from the RPC passphrase check deeper down.
// Both directions are pinned: mainnet extend is refused, while testnet extend
// and the mainnet read-only scan keep working.

const FIXTURE = new URL(
  '../../core/test/fixtures/getLedgerEntries-guinea-pig-a.json',
  import.meta.url,
).pathname;
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const G = 'GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE';

function extendDeps(network?: string) {
  return {
    sourceAccount: G,
    ...(network === undefined ? {} : { network: () => network }),
    readKeysFile: vi.fn(async () => '{"dataKeys":[]}'),
    run: vi.fn(async (request: { submit: boolean }) => ({
      plan: { contractId: A, additionalLedgers: 20, entries: [], warnings: [] },
      result: {
        ok: true,
        mode: request.submit ? ('live' as const) : ('dry-run' as const),
        records: [],
        skipped: [],
        unattempted: [],
        committedFeeStroops: '0',
      },
      previews: [],
    })),
  };
}

const DRY = ['extend', A, '--ledgers', '20', '--json'];
const LIVE = [
  'extend',
  A,
  '--ledgers',
  '20',
  '--submit',
  '--secret-env',
  'PAYER_SECRET',
  '--max-fee-stroops',
  '1000',
];

describe('extend on mainnet (PH2-E1-04)', () => {
  it.each([
    ['a dry run', DRY],
    ['a live submit', LIVE],
  ])('refuses %s on mainnet before anything is prepared', async (_label, args) => {
    const deps = extendDeps('mainnet');
    const result = await runExtendCli(args, deps);
    expect(result.exitCode).toBe(2);
    expect(result.stdout).toBe('');
    expect(result.stderr).toContain('extend is testnet-only');
    expect(result.stderr).toContain('mainnet');
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('refuses any network that is not testnet, not only the string "mainnet"', async () => {
    const deps = extendDeps('futurenet');
    const result = await runExtendCli(DRY, deps);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('extend is testnet-only');
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('still extends on testnet when testnet is chosen explicitly', async () => {
    const deps = extendDeps('testnet');
    const result = await runExtendCli(DRY, deps);
    expect(result.exitCode).toBe(0);
    expect(deps.run).toHaveBeenCalledTimes(1);
  });

  it('still extends on testnet when no network is chosen (the default)', async () => {
    const deps = extendDeps();
    const result = await runExtendCli(DRY, deps);
    expect(result.exitCode).toBe(0);
    expect(deps.run).toHaveBeenCalledTimes(1);
  });

  it('refuses through the real dispatcher too', async () => {
    const extend = extendDeps('mainnet');
    const connect = vi.fn(async () => readerFromFixture(FIXTURE));
    const result = await runCli(DRY, {
      connect,
      readKeysFile: async () => '',
      now: () => new Date(),
      extend,
    });
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('extend is testnet-only');
    expect(extend.run).not.toHaveBeenCalled();
    expect(connect).not.toHaveBeenCalled();
  });

  it('leaves the mainnet read-only scan working', async () => {
    const extend = extendDeps('mainnet');
    const connect = vi.fn(async () => ({
      ...(await readerFromFixture(FIXTURE)),
      network: 'mainnet' as const,
    }));
    const result = await runCli(['scan', A, '--no-data-keys', '--json'], {
      connect,
      readKeysFile: async () => '',
      now: () => new Date('2026-09-05T00:00:00Z'),
      extend,
    });
    expect(result.exitCode).toBe(0);
    expect(JSON.parse(result.stdout).network).toBe('mainnet');
    expect(connect).toHaveBeenCalledTimes(1);
    expect(extend.run).not.toHaveBeenCalled();
  });

  it('says so in extend --help', async () => {
    const result = await runExtendCli(['extend', '--help'], extendDeps());
    expect(result.stdout).toContain('refused on mainnet');
  });
});
