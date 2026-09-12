import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/command.js';
import { readerFromFixture } from '../../core/test/mock-rpc.js';

/**
 * `W2-D10-01c` — the CLI must be able to follow its own advice.
 *
 * A single-contract scan structurally cannot establish that a shared code entry
 * is unshared, so it reports `undetermined` and tells the reader to "pass them
 * together to see the real blast radius". `scanContracts` has accepted an array
 * since it was written; only the argument parser was singular, which made that
 * sentence unreachable from the command line.
 *
 * Naming a limitation and withholding its remedy is half a fix, and it is the
 * half that shows in a demo: §4.1 commits the package to highlighting storage
 * inefficiencies, and shared-code blast radius is the flagship one.
 */

const FIXTURE = new URL(
  '../../core/test/fixtures/getLedgerEntries-guinea-pig-a.json',
  import.meta.url,
).pathname;
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';

function dependencies() {
  return {
    connect: vi.fn(async () => readerFromFixture(FIXTURE)),
    readKeysFile: vi.fn(async () => JSON.stringify({ dataKeys: [] })),
    now: () => new Date('2026-09-05T00:00:00Z'),
  };
}

describe('scan accepts more than one contract', () => {
  it('takes N contract IDs and reports every one of them', async () => {
    const result = await runCli(['scan', A, B, '--json'], dependencies());
    const parsed = JSON.parse(result.stdout) as { contracts: { id: string }[] };
    expect(parsed.contracts.map((c) => c.id)).toEqual([A, B]);
  });

  it('names the scanned contracts in the HUMAN channel too', async () => {
    // The roster, not an inference from one. A dropped argument has to be
    // visible rather than deduced from something missing further down.
    const result = await runCli(['scan', A, B], dependencies());
    expect(result.stdout).toContain('Scanned 2 contract(s)');
    expect(result.stdout).toContain(A);
    expect(result.stdout).toContain(B);
  });

  it('still accepts a single contract, and says so in the singular form', async () => {
    const result = await runCli(['scan', A], dependencies());
    expect(result.stdout).toContain('Scanned 1 contract(s)');
  });

  it('keeps flags working after the contract list', async () => {
    const result = await runCli(['scan', A, B, '--no-data-keys', '--json'], dependencies());
    expect(result.exitCode).not.toBe(2);
    expect(() => JSON.parse(result.stdout)).not.toThrow();
  });
});

describe('scan refuses rather than guesses', () => {
  it('refuses a repeated contract ID instead of deduplicating it', async () => {
    // Silently deduplicating leaves the caller believing they asked about more
    // contracts than they did, so the blast-radius count they read back is a
    // floor below what they expect — the wrong direction to be wrong in.
    const result = await runCli(['scan', A, A], dependencies());
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Repeated contract ID');
  });

  it('refuses --keys-file with several contracts', async () => {
    // A keys file carries no contract association, and persistent/temporary
    // keys are derived from the contract that owns them. Spreading one list
    // across N would attribute entries to contracts that do not own them, and
    // then report that misattribution as fact.
    const result = await runCli(['scan', A, B, '--keys-file', 'k.json'], dependencies());
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('--keys-file applies to exactly one contract');
  });

  it('rejects the whole invocation when any ID is malformed', async () => {
    // Not "scan the good ones and mention the bad one": a typo should cost a
    // one-line message, not a network round trip plus a report that reads as
    // partial success.
    const result = await runCli(['scan', A, 'CNOPE'], dependencies());
    expect(result.exitCode).toBe(2);
    expect(result.stderr).toContain('Not a Stellar contract ID: CNOPE');
  });

  it('still rejects an unknown flag', async () => {
    const result = await runCli(['scan', A, '--nope'], dependencies());
    expect(result.exitCode).toBe(2);
  });

  it('requires at least one contract ID', async () => {
    const result = await runCli(['scan', '--json'], dependencies());
    expect(result.exitCode).toBe(2);
  });
});
