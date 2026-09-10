import { describe, expect, it } from 'vitest';
import { NotTestnetError } from '@evergreen-stellar/core';
import type { LedgerEntryReader } from '@evergreen-stellar/core';
import { runCli } from '../src/command.js';
import { EXIT_ERROR } from '../src/scan.js';

const VALID = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';

/** A reader that is never reached in these tests; failures happen before it. */
const unusedReader = {
  read: () => {
    throw new Error('the reader should not have been reached');
  },
} as unknown as LedgerEntryReader;

function deps(over: Partial<Parameters<typeof runCli>[1]> = {}) {
  return {
    connect: () => Promise.resolve(unusedReader),
    readKeysFile: () => Promise.resolve('{"dataKeys":[]}'),
    now: () => new Date('2026-09-10T00:00:00Z'),
    ...over,
  };
}

/** No error message may leak a stack frame, a file path, or an SDK internal. */
function assertNoTrace(text: string): void {
  expect(text).not.toMatch(/\n\s+at /);
  expect(text).not.toContain('node:internal');
  expect(text).not.toMatch(/\.ts:\d+|\.js:\d+/);
}

describe('W2-D10-03 — bad contract ID fails fast, before any network call', () => {
  it('rejects a malformed ID without connecting at all', async () => {
    let connected = false;
    const out = await runCli(
      ['scan', 'NOT_A_CONTRACT_ID'],
      deps({
        connect: () => {
          connected = true;
          return Promise.resolve(unusedReader);
        },
      }),
    );
    expect(out.exitCode).toBe(EXIT_ERROR);
    expect(connected).toBe(false); // a typo costs a message, not a round trip
    expect(out.stderr).toContain('Not a Stellar contract ID');
    assertNoTrace(out.stderr);
  });

  it('names the likely mistake rather than only stating the rule', async () => {
    const out = await runCli(['scan', 'NOT_A_CONTRACT_ID'], deps());
    expect(out.stderr).toContain('truncated paste');
    expect(out.stderr).toContain('account address');
  });

  it('catches an ACCOUNT address pasted where a contract belongs', async () => {
    // A well-formed StrKey of the wrong kind — the plausible mistake, and one
    // a length check alone would wave through.
    const out = await runCli(
      ['scan', 'GDGAWY72QVMBAG2LTQWXLM6BEBQZBWHTVQPCEKMFPM5CHKPM7SEQMASE'],
      deps(),
    );
    expect(out.exitCode).toBe(EXIT_ERROR);
    expect(out.stderr).toContain('Not a Stellar contract ID');
  });

  it('PERMITS a well-formed contract ID through to the connection', async () => {
    // The guard must be exercised in both directions. A validator that refuses
    // everything is the testnet-guard failure wearing a new hat.
    let connected = false;
    await runCli(
      ['scan', VALID],
      deps({
        connect: () => {
          connected = true;
          return Promise.reject(new Error('stop here'));
        },
      }),
    );
    expect(connected).toBe(true);
  });
});

describe('W2-D10-03 — a wrong network is not a connection failure', () => {
  it('says which network it found, and that it refuses to run there', async () => {
    const out = await runCli(
      ['scan', VALID],
      deps({
        connect: () =>
          Promise.reject(new NotTestnetError('Public Global Stellar Network ; September 2015')),
      }),
    );
    expect(out.exitCode).toBe(EXIT_ERROR);
    expect(out.stderr).toContain('Public Global Stellar Network');
    expect(out.stderr).toContain('Refusing to run');
    expect(out.stderr).toContain('SOROBAN_RPC_URL');
    assertNoTrace(out.stderr);
  });

  it('does NOT describe a wrong network as an unreachable endpoint', async () => {
    // These were one message until 2026-09-10, which hid the more important of
    // the two: the testnet guard firing means you are pointed at another
    // network, most likely mainnet. That is a safety event, not connectivity.
    const out = await runCli(
      ['scan', VALID],
      deps({
        connect: () =>
          Promise.reject(new NotTestnetError('Public Global Stellar Network ; September 2015')),
      }),
    );
    expect(out.stderr).not.toContain('Could not reach');
  });

  it('reports an unreachable endpoint as exactly that, and says nothing changed', async () => {
    const out = await runCli(
      ['scan', VALID],
      deps({ connect: () => Promise.reject(new Error('ECONNREFUSED 127.0.0.1:9')) }),
    );
    expect(out.exitCode).toBe(EXIT_ERROR);
    expect(out.stderr).toContain('Could not reach');
    expect(out.stderr).toContain('nothing was changed');
    // The raw transport error must not surface.
    expect(out.stderr).not.toContain('ECONNREFUSED');
    assertNoTrace(out.stderr);
  });
});

describe('W2-D10-03 — no failure path leaks a stack trace', () => {
  it.each([
    ['no arguments', [] as string[]],
    ['unknown flag', ['scan', VALID, '--bogus']],
    ['repeated flag', ['scan', VALID, '--json', '--json']],
    ['keys-file without a path', ['scan', VALID, '--keys-file']],
    ['mutually exclusive flags', ['scan', VALID, '--no-data-keys', '--keys-file', 'k.json']],
  ])('%s', async (_label, args) => {
    const out = await runCli(args, deps());
    expect(out.exitCode).toBe(EXIT_ERROR);
    expect(out.stderr.length).toBeGreaterThan(0);
    assertNoTrace(out.stderr);
  });

  it('does not echo keys-file contents when the file is malformed', async () => {
    const secret = 'SXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
    const out = await runCli(
      ['scan', VALID, '--keys-file', 'k.json'],
      deps({ readKeysFile: () => Promise.resolve(`{"oops": "${secret}"}`) }),
    );
    expect(out.exitCode).toBe(EXIT_ERROR);
    // A diagnostic that quotes the file could publish a secret pasted by mistake.
    expect(out.stderr).not.toContain(secret);
    assertNoTrace(out.stderr);
  });
});
