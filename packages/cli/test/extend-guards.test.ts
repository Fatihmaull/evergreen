import { describe, expect, it, vi } from 'vitest';
import { EXTEND_HELP, extensionPreview, runExtendCli } from '../src/extend.js';
import type { ExtendCliDependencies, ExtendReport, ExtendRequest } from '../src/extend.js';
import type { PreparedExtension } from '@evergreen-stellar/core';

/**
 * Guards on the `extend` signing path (`PH2-E1-02`).
 *
 * `runExtendCli` never signs; it decides whether `deps.run` is allowed to be
 * called at all, and with what. So every refusal below asserts three things:
 * exit 2, the SPECIFIC message for that guard, and that `run` was never called.
 * The message matters: with two overlapping guards, "refused" alone is also
 * true when a different guard fired, which is how a removed guard stays green.
 */
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const G = 'GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE';
const G2 = 'GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB';

function report(overrides: Partial<ExtendReport['result']> = {}): ExtendReport {
  return {
    plan: { contractId: A, additionalLedgers: 20, entries: [], warnings: [] },
    result: {
      ok: true,
      mode: 'dry-run',
      records: [],
      skipped: [],
      unattempted: [],
      committedFeeStroops: '0',
      estimatedFeeStroops: '0',
      ...overrides,
    },
    previews: [],
  };
}

type Deps = ExtendCliDependencies & {
  readKeysFile: ReturnType<typeof vi.fn<(path: string) => Promise<string>>>;
  run: ReturnType<typeof vi.fn<ExtendCliDependencies['run']>>;
};

function makeDeps(overrides: Partial<ExtendCliDependencies> = {}): Deps {
  return {
    sourceAccount: G,
    readKeysFile: vi.fn(async () => '{"dataKeys":[]}'),
    run: vi.fn(async (request: ExtendRequest) =>
      report({ mode: request.submit ? 'live' : 'dry-run' }),
    ),
    ...overrides,
  } as Deps;
}

const base = ['extend', A, '--ledgers', '20'];
const live = [...base, '--submit', '--secret-env', 'TEST_SECRET', '--max-fee-stroops', '1000'];

const CONTRACT = 'Expected a valid contract ID.';
const REPEATED = 'Repeated extend option.';
const NO_VALUE = 'Missing extend option value.';
const UNKNOWN = 'Unknown or conflicting extend option.';
const EXCLUSIVE = '--submit and --dry-run are mutually exclusive.';
const LEDGERS = '--ledgers needs a positive safe integer.';
const PAYER = 'A valid public payer is required';
const LIVE_ONLY = '--submit requires --secret-env NAME and --max-fee-stroops N';

describe('extend refuses before anything can be prepared or signed', () => {
  // [label, args, message the refusal must carry, text that must NOT be echoed]
  const refusals: [string, string[], string, string?][] = [
    ['wrong subcommand', ['scan', A, '--ledgers', '20'], CONTRACT],
    ['no contract', ['extend'], CONTRACT],
    ['not a contract id', ['extend', 'CNOTACONTRACT', '--ledgers', '20'], CONTRACT],
    ['an account where a contract is required', ['extend', G, '--ledgers', '20'], CONTRACT],
    [
      'a contract id with a bad checksum',
      ['extend', `${A.slice(0, -1)}A`, '--ledgers', '20'],
      CONTRACT,
    ],

    ['repeated --ledgers', [...base, '--ledgers', '30'], REPEATED],
    [
      'repeated --source-account',
      [...base, '--source-account', G, '--source-account', G],
      REPEATED,
    ],
    ['repeated --max-fee-stroops', [...live, '--max-fee-stroops', '999999'], REPEATED],
    ['repeated --secret-env', [...live, '--secret-env', 'OTHER_SECRET'], REPEATED],
    ['repeated --submit', [...live, '--submit'], REPEATED],
    ['repeated --include-code', [...base, '--include-code', '--include-code'], REPEATED],

    ['option with no value at the end', ['extend', A, '--ledgers'], NO_VALUE],
    ['value that is another flag', [...base, '--keys-file', '--json'], NO_VALUE],
    ['negative number as a value', ['extend', A, '--ledgers', '-1'], NO_VALUE],
    ['fee cap that is another flag', [...live.slice(0, -1), '--json'], NO_VALUE],
    ['empty value', [...base, '--source-account', ''], NO_VALUE],

    ['unknown flag', [...base, '--no-such-option'], UNKNOWN],
    ['stray positional', [...base, 'extra'], UNKNOWN],
    ['flag glued to a value', [...base, '--submit=true'], UNKNOWN],

    ['--submit with --dry-run', [...live, '--dry-run'], EXCLUSIVE],
    ['--dry-run before --submit', [...base, '--dry-run', ...live.slice(4)], EXCLUSIVE],

    ['no --ledgers', ['extend', A], LEDGERS],
    ['zero ledgers', ['extend', A, '--ledgers', '0'], LEDGERS],
    ['leading zeros', ['extend', A, '--ledgers', '007'], LEDGERS],
    ['fractional ledgers', ['extend', A, '--ledgers', '1.5'], LEDGERS],
    ['exponent ledgers', ['extend', A, '--ledgers', '1e3'], LEDGERS],
    ['hex ledgers', ['extend', A, '--ledgers', '0x10'], LEDGERS],
    ['signed ledgers', ['extend', A, '--ledgers', '+5'], LEDGERS],
    ['padded ledgers', ['extend', A, '--ledgers', ' 5'], LEDGERS],
    ['non-numeric ledgers', ['extend', A, '--ledgers', 'many'], LEDGERS],
    [
      'ledgers above the safe integer range',
      ['extend', A, '--ledgers', '9007199254740992'],
      LEDGERS,
    ],
    [
      'ledgers far above the safe range',
      ['extend', A, '--ledgers', '99999999999999999999'],
      LEDGERS,
    ],

    ['malformed payer', [...base, '--source-account', 'bad'], PAYER],
    ['a contract id as payer', [...base, '--source-account', A], PAYER],
    ['a payer with a bad checksum', [...base, '--source-account', `${G.slice(0, -1)}A`], PAYER],

    ['live without secret or fee cap', [...base, '--submit'], LIVE_ONLY],
    ['live without a fee cap', [...base, '--submit', '--secret-env', 'TEST_SECRET'], LIVE_ONLY],
    [
      'live without a secret variable',
      [...base, '--submit', '--max-fee-stroops', '1000'],
      LIVE_ONLY,
    ],
    ['live with a zero fee cap', [...live.slice(0, -1), '0'], LIVE_ONLY],
    ['live with a padded fee cap', [...live.slice(0, -1), '01000'], LIVE_ONLY],
    ['live with a fractional fee cap', [...live.slice(0, -1), '1.2'], LIVE_ONLY],
    ['live with an exponent fee cap', [...live.slice(0, -1), '1e3'], LIVE_ONLY],
    ['dry-run with a zero fee cap', [...base, '--max-fee-stroops', '0'], LIVE_ONLY],
    ['dry-run with a secret variable', [...base, '--secret-env', 'TEST_SECRET'], LIVE_ONLY],
    [
      'dry-run with an explicit --dry-run and a secret variable',
      [...base, '--dry-run', '--secret-env', 'TEST_SECRET'],
      LIVE_ONLY,
    ],
    [
      'secret name with a space',
      [...base, '--submit', '--secret-env', 'BAD NAME', '--max-fee-stroops', '1000'],
      LIVE_ONLY,
      'BAD NAME',
    ],
    [
      'secret name starting with a digit',
      [...base, '--submit', '--secret-env', '1STARTSWITHDIGIT', '--max-fee-stroops', '1000'],
      LIVE_ONLY,
      '1STARTSWITHDIGIT',
    ],
    [
      'secret name containing a dash',
      [...base, '--submit', '--secret-env', 'HAS-DASH-VALUE', '--max-fee-stroops', '1000'],
      LIVE_ONLY,
      'HAS-DASH-VALUE',
    ],
    [
      'a NAME=value assignment passed as the name',
      [...base, '--submit', '--secret-env', 'KEY=hunter2', '--max-fee-stroops', '1000'],
      LIVE_ONLY,
      'hunter2',
    ],
    [
      'secret name with shell metacharacters',
      [...base, '--submit', '--secret-env', 'KEY;touch_x', '--max-fee-stroops', '1000'],
      LIVE_ONLY,
      'touch_x',
    ],
  ];

  it.each(refusals)('%s', async (_label, args, message, mustNotEcho) => {
    const deps = makeDeps();
    const output = await runExtendCli(args, deps);
    expect(output.exitCode).toBe(2);
    expect(output.stdout).toBe('');
    expect(output.stderr).toContain(message);
    if (mustNotEcho !== undefined) expect(output.stderr).not.toContain(mustNotEcho);
    expect(deps.run).not.toHaveBeenCalled();
    expect(deps.readKeysFile).not.toHaveBeenCalled();
  });

  it('refuses a default payer that is not a public account, with no fallback identity', async () => {
    const deps = makeDeps({ sourceAccount: A });
    const output = await runExtendCli(base, deps);
    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain(PAYER);
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('refuses when neither a flag nor a default names a payer', async () => {
    const deps = makeDeps();
    delete (deps as { sourceAccount?: string }).sourceAccount;
    const output = await runExtendCli(base, deps);
    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain(PAYER);
    expect(deps.run).not.toHaveBeenCalled();
  });
});

describe('extend hands the run exactly what was asked, and never more', () => {
  it('simulates by default and sends no live-only fields', async () => {
    const deps = makeDeps();
    const output = await runExtendCli(base, deps);
    expect(output.exitCode).toBe(0);
    expect(deps.run).toHaveBeenCalledTimes(1);
    expect(deps.run.mock.calls[0]?.[0]).toStrictEqual({
      contractId: A,
      additionalLedgers: 20,
      sourceAccount: G,
      dataKeys: [],
      includeCode: false,
      submit: false,
    });
  });

  it('treats --dry-run as the default spoken aloud: simulation, nothing submitted', async () => {
    const deps = makeDeps();
    const output = await runExtendCli([...base, '--dry-run', '--json'], deps);
    expect(output.exitCode).toBe(0);
    expect(deps.run.mock.calls[0]?.[0]).toMatchObject({ submit: false });
    expect(JSON.parse(output.stdout).result.mode).toBe('dry-run');
  });

  it('submits only with --submit, the secret NAME and the fee cap together', async () => {
    const deps = makeDeps();
    const output = await runExtendCli(live, deps);
    expect(output.exitCode).toBe(0);
    expect(deps.run.mock.calls[0]?.[0]).toStrictEqual({
      contractId: A,
      additionalLedgers: 20,
      sourceAccount: G,
      dataKeys: [],
      includeCode: false,
      submit: true,
      secretEnv: 'TEST_SECRET',
      maxFeeStroops: '1000',
    });
  });

  it('keeps a very large fee cap as the exact decimal string', async () => {
    const deps = makeDeps();
    const big = '123456789012345678901234567890';
    await runExtendCli([...live.slice(0, -1), big], deps);
    expect(deps.run.mock.calls[0]?.[0].maxFeeStroops).toBe(big);
  });

  it('lets --source-account override the default payer', async () => {
    const deps = makeDeps();
    await runExtendCli([...base, '--source-account', G2], deps);
    expect(deps.run.mock.calls[0]?.[0].sourceAccount).toBe(G2);
  });

  it('uses the default payer when no flag names one', async () => {
    const deps = makeDeps({ sourceAccount: G2 });
    await runExtendCli(base, deps);
    expect(deps.run.mock.calls[0]?.[0].sourceAccount).toBe(G2);
  });

  it('includes shared Wasm only when --include-code is given', async () => {
    const without = makeDeps();
    await runExtendCli(base, without);
    expect(without.run.mock.calls[0]?.[0].includeCode).toBe(false);
    const withCode = makeDeps();
    await runExtendCli([...base, '--include-code'], withCode);
    expect(withCode.run.mock.calls[0]?.[0].includeCode).toBe(true);
  });

  it('accepts the largest safe ledger count and passes it as a number', async () => {
    const deps = makeDeps();
    await runExtendCli(['extend', A, '--ledgers', String(Number.MAX_SAFE_INTEGER)], deps);
    expect(deps.run.mock.calls[0]?.[0].additionalLedgers).toBe(Number.MAX_SAFE_INTEGER);
  });

  it('accepts a secret NAME that starts with an underscore and contains digits', async () => {
    const deps = makeDeps();
    const output = await runExtendCli(
      [...base, '--submit', '--secret-env', '_Key_2', '--max-fee-stroops', '1'],
      deps,
    );
    expect(output.exitCode).toBe(0);
    expect(deps.run.mock.calls[0]?.[0]).toMatchObject({ secretEnv: '_Key_2', maxFeeStroops: '1' });
  });
});

describe('extend selects data keys only from a well-formed keys file', () => {
  const INVALID = 'Invalid keys file: expected dataKeys string array.';
  const UNREADABLE = 'Unable to read a valid keys file.';
  const withKeys = [...base, '--keys-file', 'keys.json'];

  it('does not read any file unless --keys-file is given', async () => {
    const deps = makeDeps();
    await runExtendCli(base, deps);
    expect(deps.readKeysFile).not.toHaveBeenCalled();
    expect(deps.run.mock.calls[0]?.[0].dataKeys).toStrictEqual([]);
  });

  it('forwards exactly the keys in the file, from exactly the path named', async () => {
    const deps = makeDeps();
    deps.readKeysFile.mockResolvedValue('{"dataKeys":["AAAA","BBBB"]}');
    const output = await runExtendCli(withKeys, deps);
    expect(output.exitCode).toBe(0);
    expect(deps.readKeysFile).toHaveBeenCalledExactlyOnceWith('keys.json');
    expect(deps.run.mock.calls[0]?.[0].dataKeys).toStrictEqual(['AAAA', 'BBBB']);
  });

  const malformed: [string, string, string][] = [
    ['an object without dataKeys', '{}', INVALID],
    ['dataKeys as a string', '{"dataKeys":"AAAA"}', INVALID],
    ['dataKeys as an object', '{"dataKeys":{"0":"AAAA"}}', INVALID],
    ['a numeric key', '{"dataKeys":["AAAA",1]}', INVALID],
    ['a null key', '{"dataKeys":[null]}', INVALID],
    ['a nested array key', '{"dataKeys":[["AAAA"]]}', INVALID],
    ['a top-level array', '["AAAA"]', INVALID],
    ['a top-level null', 'null', INVALID],
    ['a top-level string', '"AAAA"', INVALID],
    ['a top-level number', '42', INVALID],
    ['text that is not JSON', 'PRIVATE DATA', UNREADABLE],
    ['an empty file', '', UNREADABLE],
  ];

  it.each(malformed)('refuses %s, without running or echoing the file', async (_l, text, msg) => {
    const deps = makeDeps();
    deps.readKeysFile.mockResolvedValue(text);
    const output = await runExtendCli(withKeys, deps);
    expect(output.exitCode).toBe(2);
    expect(output.stdout).toBe('');
    expect(output.stderr).toContain(msg);
    expect(output.stderr).not.toContain('PRIVATE');
    expect(deps.run).not.toHaveBeenCalled();
  });

  it('refuses an unreadable file without running or echoing the system error', async () => {
    const deps = makeDeps();
    deps.readKeysFile.mockRejectedValue(new Error('ENOENT: /home/someone/secret-path/keys.json'));
    const output = await runExtendCli(withKeys, deps);
    expect(output.exitCode).toBe(2);
    expect(output.stderr).toContain(UNREADABLE);
    expect(output.stderr).not.toContain('secret-path');
    expect(deps.run).not.toHaveBeenCalled();
  });
});

const HASH = 'a'.repeat(64);
const SUBMITTED_HASH = 'b'.repeat(64);

function prepared(wasCapped: boolean): PreparedExtension {
  return {
    entry: {
      entryKey: 'KEY1',
      kind: 'instance',
      contracts: [A],
      before: { observedAtLedger: 1000, endsAtLedger: 1100 },
      extendToLedgers: 120,
      wasCapped,
      skip: false,
    },
    sourceAccount: G,
    transactionXdr: 'unsigned',
    transactionHash: HASH,
    feeStroops: '600',
    simulatedAtLedger: 1001,
  };
}

const PREVIEW_LINES = [
  'Selected instance KEY1',
  `Known consumers: ${A}`,
  `Payer: ${G}`,
  `Prepared hash (not yet sent): ${HASH}`,
  'Before: ledger 1000, live until 1100',
  'Target remaining: 120; prepared fee cap: 600 stroops',
  'Selected scope only. Code may have consumers outside this scan.',
];
const INCOMPLETE =
  'Extension incomplete. Inspect per-entry outcomes and reconcile any submitted hash before retrying.';

describe('extend previews the prepared hash before the run can sign', () => {
  it('forwards the run preview to the sink, ahead of the run finishing', async () => {
    const order: string[] = [];
    const deps = makeDeps({ preview: vi.fn((text: string) => void order.push(`preview:${text}`)) });
    deps.run.mockImplementation(async (_request, preview) => {
      preview(`Prepared hash (not yet sent): ${HASH}`);
      order.push('run-finished');
      return report();
    });
    await runExtendCli(live, deps);
    expect(order).toStrictEqual([`preview:Prepared hash (not yet sent): ${HASH}`, 'run-finished']);
  });

  it('keeps the preview out of stdout so --json stays valid', async () => {
    const deps = makeDeps({ preview: vi.fn() });
    deps.run.mockImplementation(async (_request, preview) => {
      preview('PREVIEW-TEXT');
      return report();
    });
    const output = await runExtendCli([...live, '--json'], deps);
    expect(output.stdout).not.toContain('PREVIEW-TEXT');
    expect(() => JSON.parse(output.stdout)).not.toThrow();
  });

  it('runs without a preview sink instead of crashing', async () => {
    const deps = makeDeps();
    deps.run.mockImplementation(async (_request, preview) => {
      preview('PREVIEW-TEXT');
      return report();
    });
    const output = await runExtendCli(live, deps);
    expect(output.exitCode).toBe(0);
  });

  it('renders the whole preview, marking a capped target', () => {
    expect(extensionPreview(prepared(false))).toBe(PREVIEW_LINES.join('\n'));
    const capped = PREVIEW_LINES.map((l) => l.replace('120;', '120 (CAPPED);'));
    expect(extensionPreview(prepared(true))).toBe(capped.join('\n'));
  });
});

describe('extend reports the outcome, and never calls a partial run complete', () => {
  const incomplete = report({
    ok: false,
    mode: 'live',
    records: [
      { entryKey: 'key1', outcome: 'submitted', transactionHash: SUBMITTED_HASH },
      { entryKey: 'key2', outcome: 'failed' },
    ] as unknown as ExtendReport['result']['records'],
    skipped: ['key3'],
    unattempted: ['key4'],
  });
  const withPlan: ExtendReport = {
    ...incomplete,
    plan: { ...incomplete.plan, warnings: ['selected keys only'] },
    previews: [prepared(false)],
  };

  it('prints every entry outcome, the submitted hash and the reconcile notice', async () => {
    const deps = makeDeps();
    deps.run.mockResolvedValue(withPlan);
    const output = await runExtendCli(live, deps);
    expect(output.stdout).toBe(
      [
        'Mode: live. Incomplete.',
        'selected keys only',
        PREVIEW_LINES.join('\n'),
        `key1: submitted (${SUBMITTED_HASH})`,
        'key2: failed',
        'key3: no-op (target already satisfied)',
        'key4: not attempted',
        'A submitted/unconfirmed hash must be reconciled before retrying; no automatic replacement was sent.',
      ].join('\n'),
    );
  });

  it('exits 2 with the reconcile instruction when the run is incomplete', async () => {
    const deps = makeDeps();
    deps.run.mockResolvedValue(withPlan);
    const output = await runExtendCli(live, deps);
    expect(output.exitCode).toBe(2);
    expect(output.stderr).toBe(INCOMPLETE);
    const json = await runExtendCli([...live, '--json'], deps);
    expect(json.exitCode).toBe(2);
    expect(json.stderr).toBe(INCOMPLETE);
    expect(JSON.parse(json.stdout).result.ok).toBe(false);
  });

  it('exits 0 with a clean stderr and says Complete when the run is complete', async () => {
    const deps = makeDeps();
    const output = await runExtendCli(base, deps);
    expect(output.exitCode).toBe(0);
    expect(output.stderr).toBe('');
    expect(output.stdout.split('\n')[0]).toBe('Mode: dry-run. Complete.');
  });
});

describe('extend turns a failed run into a refusal that leaks nothing', () => {
  const GENERIC =
    'Extension preparation failed. Check Testnet RPC, selected live keys, public payer and network configuration. No raw provider details are printed.';

  it.each([
    [
      'an Error carrying a secret and a host',
      new Error('SECRET-VALUE at https://rpc.internal.example/x'),
    ],
    ['a thrown string', 'SECRET-VALUE at https://rpc.internal.example/x'],
  ])('maps %s to one fixed message, exit 2 and empty stdout', async (_label, thrown) => {
    const deps = makeDeps();
    deps.run.mockRejectedValue(thrown);
    const output = await runExtendCli(live, deps);
    expect(output).toStrictEqual({ stdout: '', stderr: GENERIC, exitCode: 2 });
  });
});

describe('extend --help', () => {
  it('prints the help and exits 0 without running anything', async () => {
    const deps = makeDeps();
    const output = await runExtendCli(['extend', '--help'], deps);
    expect(output).toStrictEqual({ stdout: EXTEND_HELP, stderr: '', exitCode: 0 });
    expect(deps.run).not.toHaveBeenCalled();
  });
});
