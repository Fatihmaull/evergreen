import { describe, expect, it, vi } from 'vitest';
import { runExtendCli, extensionPreview } from '../src/extend.js';
import { runCli } from '../src/command.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const G = 'GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE';
function dependencies() {
  return {
    sourceAccount: G,
    readKeysFile: vi.fn(async () => '{"dataKeys":[]}'),
    run: vi.fn(async (request: { submit: boolean }) => ({
      plan: { contractId: A, additionalLedgers: 20, entries: [], warnings: ['selected keys only'] },
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
describe('extend CLI contract', () => {
  it('advertises extension help without connecting', async () => {
    const connect = vi.fn(async () => {
      throw new Error('must not connect');
    });
    const output = await runCli(['--help'], {
      connect,
      readKeysFile: async () => '',
      now: () => new Date(),
    });
    expect(output.stdout).toContain('evergreen extend --help');
    expect(connect).not.toHaveBeenCalled();
  });
  it('prints the prepared hash before sending so interruption does not hide the reconciliation key', () => {
    const hash = 'a'.repeat(64);
    expect(
      extensionPreview({
        entry: {
          entryKey: 'key',
          kind: 'instance',
          contracts: [A],
          before: { observedAtLedger: 1000, endsAtLedger: 1100 },
          extendToLedgers: 120,
          wasCapped: false,
          skip: false,
        },
        sourceAccount: G,
        transactionXdr: 'unsigned',
        transactionHash: hash,
        feeStroops: '600',
        simulatedAtLedger: 1001,
      }),
    ).toContain(`Prepared hash (not yet sent): ${hash}`);
  });
  it('defaults to simulation and prints mode/scope in JSON', async () => {
    const deps = dependencies();
    const output = await runExtendCli(['extend', A, '--ledgers', '20', '--json'], deps);
    expect(output.exitCode).toBe(0);
    expect(JSON.parse(output.stdout).result.mode).toBe('dry-run');
    expect(deps.run.mock.calls[0]?.[0]).toMatchObject({
      sourceAccount: G,
      additionalLedgers: 20,
      submit: false,
      includeCode: false,
    });
  });
  it.each([
    ['--submit'],
    ['--submit', '--secret-env', 'KEY'],
    ['--submit', '--secret-env', 'KEY', '--max-fee-stroops', '0'],
    ['--ledgers', '-1'],
    ['--ledgers', '9007199254740992'],
    ['--submit', '--dry-run'],
    ['--include-code', '--include-code'],
    ['--secret-env', 'SAMPLESECRET'],
    ['--source-account', 'bad'],
    ['--max-fee-stroops', '1.2'],
  ])('refuses invalid/conflicting arguments before connecting: %j', async (flags) => {
    const deps = dependencies();
    const output = await runExtendCli(['extend', A, '--ledgers', '20', ...flags], deps);
    expect(output.exitCode).toBe(2);
    expect(deps.run).not.toHaveBeenCalled();
  });
  it('requires an explicit public payer, with no fallback identity', async () => {
    const base = dependencies();
    const deps = { readKeysFile: base.readKeysFile, run: base.run };
    expect((await runExtendCli(['extend', A, '--ledgers', '20'], deps)).exitCode).toBe(2);
    expect(deps.run).not.toHaveBeenCalled();
  });
  it('passes secret variable NAME only in an explicit live request', async () => {
    const deps = dependencies();
    const result = await runExtendCli(
      [
        'extend',
        A,
        '--ledgers',
        '20',
        '--submit',
        '--secret-env',
        'TEST_SECRET',
        '--max-fee-stroops',
        '1000',
      ],
      deps,
    );
    expect(result.exitCode).toBe(0);
    expect(deps.run.mock.calls[0]?.[0]).toMatchObject({
      submit: true,
      secretEnv: 'TEST_SECRET',
      maxFeeStroops: '1000',
    });
  });
  it('rejects malformed keys files without printing their contents', async () => {
    const deps = dependencies();
    deps.readKeysFile.mockResolvedValue('PRIVATE DATA');
    const result = await runExtendCli(
      ['extend', A, '--ledgers', '20', '--keys-file', 'keys.json'],
      deps,
    );
    expect(result.exitCode).toBe(2);
    expect(result.stderr).not.toContain('PRIVATE');
    expect(deps.run).not.toHaveBeenCalled();
  });
  it('sanitizes exceptions and returns nonzero for an incomplete result', async () => {
    const deps = dependencies();
    deps.run.mockRejectedValue(new Error('SECRET'));
    const result = await runExtendCli(['extend', A, '--ledgers', '20'], deps);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).not.toContain('SECRET');
    const pending = dependencies();
    const value = await pending.run({ submit: true });
    pending.run.mockResolvedValue({ ...value, result: { ...value.result, ok: false } });
    expect((await runExtendCli(['extend', A, '--ledgers', '20'], pending)).exitCode).toBe(2);
  });
});
