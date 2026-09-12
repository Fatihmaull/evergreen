import {
  NotTestnetError,
  coverageIssues,
  isValidContractId,
  scanContracts,
  analyzeStorage,
} from '@evergreen-stellar/core';
import type { StorageSettings, StorageAdviceReport } from '@evergreen-stellar/core';
import { formatStorageAdvice } from './optimizer.js';
import { formatCost, type CostLine } from './cost.js';
import { EXTEND_HELP, runExtendCli } from './extend.js';
import type { ExtendCliDependencies } from './extend.js';
import type { LedgerEntryReader } from '@evergreen-stellar/core';
import {
  DEFAULT_THRESHOLD_LEDGERS,
  EXIT_ERROR,
  exitCodeFor,
  formatHuman,
  healthReport,
} from './scan.js';

/** Matches evergreen.config.example.json's defaults.extendToLedgers (~30 days). */
const DEFAULT_EXTEND_LEDGERS = 518_400;

const USAGE =
  'usage: evergreen scan <contract-id> [<contract-id> ...] [--keys-file <path> | --no-data-keys] [--require-declared-scope] [--json] [--cost [--ledgers N]] [--optimize]';
const HELP = `${USAGE}

Reads instance/Wasm and supplied persistent/temporary keys on Stellar Testnet.
Keys file: { "dataKeys": ["base64 XDR LedgerKey", ...] }

PASS SEVERAL CONTRACTS TOGETHER to see real shared-code blast radius. Contracts
built from the same Wasm share ONE ContractCode ledger entry, and a scan of one
contract cannot tell whether others depend on it — the chain does not index
reverse dependencies from a single query, so that entry reports "sharing
undetermined". Naming them together resolves it:

  evergreen scan <A>              code entry: 1 consumer, sharing UNDETERMINED
  evergreen scan <A> <B> <C>      code entry: 3 consumers, SHARED, they fail together

Every scan prints which contracts it actually scanned, so a mistyped or dropped
argument is visible rather than inferred. --keys-file takes exactly one contract,
because data keys belong to a specific contract and the file does not say which.

Exit: 0 everything scanned is healthy; 1 observed low TTL; 2 error;
      3 the scan came back incomplete (entry missing, TTL unavailable,
        executable not followable, or nothing observed).
Precedence: 2 > 3 > 1 > 0. Exit status never authorizes a transaction.

Scanning reads the keys it is given; it cannot enumerate a contract's storage,
so a clean exit means "everything I was asked to check is healthy" and never
"this contract is fully healthy". Coverage is printed with every scan.

--no-data-keys        assert this contract has no data keys beyond its instance.
                      Only its author can know that; it is a caller declaration
                      and is never independently verified.
--require-declared-scope
                      also exit 3 when scope was not declared. Intended for CI on
                      a contract you own; evergreen-check sets it by default.
--json                machine-readable output. The human view is a summary; JSON
                      is the complete record, including every issue.
--optimize            append conditional storage advice with evidence and scope
                      limits. Reads network minimum lifetimes; no payer needed.
                      Add --cost for current rent quotes. No storage is changed.
--cost [--ledgers N]  estimate what extending every entry by N more ledgers
                      would cost, priced by simulating against the network.
                      Default N is 518,400 (~30 days). Nothing is submitted.

                      "--ledgers N" means "give me N MORE ledgers". The protocol
                      wants an absolute target, so the CLI computes it for you
                      and caps it at max_entry_ttl - 1, saying so when it does.
                      Costs are estimates: rent pricing varies with network
                      state and has differed ~18% between days.

Health states, printed per entry and as a worst-of summary:
  HEALTHY   above threshold.
  WARNING   low, recoverable, and affects only this contract.
  CRITICAL  expired, OR temporary (deleted at expiry, unrecoverable), OR low and
            SHARED — a code entry shared by N contracts at 3 days is N contracts
            at 3 days, not one.
  UNKNOWN   TTL could not be read. Not healthy; unread.

Colour is added only for an interactive terminal and honours NO_COLOR. The state
word always prints, so piped output and screenshots lose nothing.`;

export interface CliDependencies {
  readonly extend?: ExtendCliDependencies;
  connect(): Promise<LedgerEntryReader>;
  readStorageSettings?(): Promise<StorageSettings | undefined>;
  /** Optional: supplied only when --cost is requested, so a plain scan stays one round trip. */
  priceExtend?(args: {
    readonly scan: import('@evergreen-stellar/shared-types').ScanResult;
    readonly additionalLedgers: number;
  }): Promise<CostLine>;
  readKeysFile(path: string): Promise<string>;
  now(): Date;
  /** True only for an interactive TTY with NO_COLOR unset. Decided in bin.ts. */
  color?: boolean;
}

export interface CliOutput {
  readonly stdout: string;
  readonly stderr: string;
  readonly exitCode: number;
}

/** Validate arguments/file shape before connecting; diagnostics never echo file contents or credentials. */
export async function runCli(
  args: readonly string[],
  dependencies: CliDependencies,
): Promise<CliOutput> {
  if (args[0] === 'extend') {
    if (args[1] === '--help' && args.length === 2)
      return { stdout: EXTEND_HELP, stderr: '', exitCode: 0 };
    if (!dependencies.extend)
      return {
        stdout: '',
        stderr: 'Extension dependencies are unavailable.',
        exitCode: EXIT_ERROR,
      };
    return runExtendCli(args, dependencies.extend);
  }
  const fail = (message: string): CliOutput => ({
    stdout: '',
    stderr: message,
    exitCode: EXIT_ERROR,
  });
  if (
    (args.length === 1 && args[0] === '--help') ||
    (args.length === 2 && args[0] === 'scan' && args[1] === '--help')
  ) {
    return {
      stdout: HELP + '\n\nManual extension: evergreen extend --help',
      stderr: '',
      exitCode: 0,
    };
  }
  if (args[0] !== 'scan') return fail(USAGE);
  // N contract IDs, because the tool's own advice requires it (`W2-D10-01c`).
  //
  // A single-contract scan structurally CANNOT establish that a shared code
  // entry is unshared, so it reports `sharingStatus: 'undetermined'` and tells
  // the reader to "pass them together to see the real blast radius". That
  // sentence was unreachable from the command line: `scanContracts` has taken
  // an array since it was written, and only this parser was singular. Naming a
  // limitation and withholding its remedy is half a fix.
  const contractIds: string[] = [];
  let argIndex = 1;
  for (; argIndex < args.length && !args[argIndex]!.startsWith('-'); argIndex++) {
    contractIds.push(args[argIndex]!);
  }
  if (contractIds.length === 0) return fail(USAGE);
  // Validate shape BEFORE connecting. A typo should cost a one-line message,
  // not a network round trip that surfaces as a scan report full of coverage
  // boilerplate about a contract that cannot exist.
  for (const id of contractIds) {
    if (!isValidContractId(id)) {
      return fail(
        `Not a Stellar contract ID: ${id}\n` +
          'Contract IDs start with C and are 56 characters (StrKey-encoded).\n' +
          'Check for a truncated paste or an account address (G…) used by mistake.',
      );
    }
  }
  // A repeated ID is a mistake worth naming rather than silently deduplicating:
  // the caller believes they asked about more contracts than they did, and the
  // blast-radius count they read back would be a floor below what they expect.
  const duplicate = contractIds.find((id, i) => contractIds.indexOf(id) !== i);
  if (duplicate !== undefined) return fail(`Repeated contract ID: ${duplicate}`);
  let asJson = false;
  let withCost = false;
  let withOptimize = false;
  let additionalLedgers = DEFAULT_EXTEND_LEDGERS;
  let noDataKeys = false;
  let requireDeclaredScope = false;
  let keysPath: string | undefined;
  for (let i = argIndex; i < args.length; i++) {
    if (args[i] === '--json' && !asJson) asJson = true;
    else if (args[i] === '--cost' && !withCost) withCost = true;
    else if (args[i] === '--optimize' && !withOptimize) withOptimize = true;
    else if (args[i] === '--ledgers') {
      const raw = args[++i];
      const parsed = Number(raw);
      if (!raw || !/^\d+$/.test(raw) || !Number.isInteger(parsed) || parsed <= 0) {
        return fail(`--ledgers needs a positive whole number of ledgers.\n${USAGE}`);
      }
      additionalLedgers = parsed;
    } else if (args[i] === '--no-data-keys' && !noDataKeys) noDataKeys = true;
    else if (args[i] === '--require-declared-scope' && !requireDeclaredScope)
      requireDeclaredScope = true;
    else if (args[i] === '--keys-file' && keysPath === undefined) {
      keysPath = args[++i];
      if (!keysPath || keysPath.startsWith('-')) return fail(`--keys-file needs a path.\n${USAGE}`);
    } else return fail(`Unknown or repeated argument.\n${USAGE}`);
  }
  if (noDataKeys && keysPath !== undefined)
    return fail('--keys-file and --no-data-keys are mutually exclusive.');
  // Refused, not resolved. A keys file is `{ "dataKeys": [...] }` with no
  // contract attached, and persistent/temporary keys are derived from the
  // contract that owns them — so spreading one list across N contracts would
  // attribute entries to contracts that do not own them, and the scan would
  // report that misattribution as fact.
  if (keysPath !== undefined && contractIds.length > 1)
    return fail(
      '--keys-file applies to exactly one contract.\n' +
        '  Data keys are owned by a specific contract and the file does not say which,\n' +
        '  so spreading one list across several would misattribute entries.\n' +
        '  Scan them together without --keys-file to see shared-code blast radius,\n' +
        '  or scan one at a time when you need explicit data keys.',
    );

  let dataKeys: string[] = [];
  if (keysPath !== undefined) {
    try {
      const parsed: unknown = JSON.parse(await dependencies.readKeysFile(keysPath));
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        !('dataKeys' in parsed) ||
        !Array.isArray(parsed.dataKeys) ||
        !parsed.dataKeys.every((key: unknown) => typeof key === 'string') ||
        Object.keys(parsed).some((key) => key !== 'dataKeys')
      ) {
        return fail('Keys file must be a JSON object containing only a dataKeys array of strings.');
      }
      dataKeys = parsed.dataKeys;
    } catch {
      return fail('Could not read keys file as JSON. Check the file path and JSON syntax.');
    }
  }
  let reader: LedgerEntryReader;
  try {
    reader = await dependencies.connect();
  } catch (error) {
    // A wrong-network refusal and an unreachable endpoint are different
    // problems with different fixes, and collapsing them into one message hid
    // the more important of the two: the testnet guard firing means you are
    // pointed at another network, most likely MAINNET, which is a safety event
    // rather than a connectivity one.
    if (error instanceof NotTestnetError) {
      return fail(
        `${error.message}\n` +
          'Evergreen only runs against Stellar Testnet. Point SOROBAN_RPC_URL at a\n' +
          'testnet endpoint — the default is https://soroban-testnet.stellar.org.',
      );
    }
    return fail(
      'Could not reach the Stellar RPC endpoint. Check SOROBAN_RPC_URL, the URL\n' +
        'syntax, and your network connection. Nothing was read and nothing was changed.',
    );
  }
  const scanned = await scanContracts(
    reader,
    contractIds.map((id) => ({ contract: { id }, dataKeys, noDataKeys })),
  );
  // `issues.length === 0` is the question a consumer will actually ask, so it
  // has to be answerable. Caveats are merged in for that reason — a scan that
  // told a human it was incomplete must not hand a machine an empty array.
  const result = { ...scanned, issues: [...scanned.issues, ...coverageIssues(scanned)] };

  let settings: StorageSettings | undefined;
  if (withOptimize) {
    try {
      settings = await dependencies.readStorageSettings?.();
    } catch {
      /* Dated historical context is explicitly labelled in advice. */
    }
  }
  const advice = (priced?: CostLine): StorageAdviceReport | undefined =>
    withOptimize
      ? analyzeStorage(result, {
          ...(settings === undefined ? {} : { settings }),
          ...(priced === undefined
            ? {}
            : {
                quote: {
                  rentByEntry: priced.rentByEntry,
                  pricedAtLedger: priced.pricedAtLedger,
                  additionalLedgers: priced.additionalLedgers,
                },
              }),
        })
      : undefined;

  let cost: CostLine | undefined;
  if (withCost) {
    if (dependencies.priceExtend === undefined && !withOptimize) {
      return fail('--cost is unavailable: no pricing backend was configured.');
    }
    try {
      if (dependencies.priceExtend === undefined) throw new Error('No pricing backend');
      cost = await dependencies.priceExtend({ scan: result, additionalLedgers });
    } catch {
      const optimization = advice();
      // A failed quote must not take the scan down with it — the TTL answer is
      // still correct and still worth printing.
      return {
        stdout: asJson
          ? JSON.stringify(
              {
                ...result,
                health: healthReport(result, DEFAULT_THRESHOLD_LEDGERS),
                ...(optimization === undefined ? {} : { optimization }),
              },
              null,
              2,
            )
          : `${formatHuman(result, dependencies.now(), {
              color: dependencies.color === true,
              thresholdLedgers: DEFAULT_THRESHOLD_LEDGERS,
            })}\n\n! Could not price an extend: the network declined to simulate it.\n  The TTL results above are unaffected.${optimization === undefined ? '' : `\n\n${formatStorageAdvice(optimization).join('\n')}`}`,
        stderr: '',
        exitCode: exitCodeFor(result, DEFAULT_THRESHOLD_LEDGERS, { requireDeclaredScope }),
      };
    }
  }

  const optimization = advice(cost);
  return {
    stdout: asJson
      ? // Additive envelope: every existing key of ScanResult is untouched, so
        // a consumer reading `entries` or `issues` is unaffected by `health`.
        JSON.stringify(
          {
            ...result,
            health: healthReport(result, DEFAULT_THRESHOLD_LEDGERS),
            ...(cost === undefined ? {} : { cost }),
            ...(optimization === undefined ? {} : { optimization }),
          },
          null,
          2,
        )
      : formatHuman(result, dependencies.now(), {
          color: dependencies.color === true,
          thresholdLedgers: DEFAULT_THRESHOLD_LEDGERS,
        }) +
        (cost === undefined ? '' : `\n\n${formatCost(cost).join('\n')}`) +
        (optimization === undefined ? '' : `\n\n${formatStorageAdvice(optimization).join('\n')}`),
    stderr: '',
    // Same constant the display grades against, so the printed health and the
    // exit code can never describe different thresholds.
    exitCode: exitCodeFor(result, DEFAULT_THRESHOLD_LEDGERS, { requireDeclaredScope }),
  };
}
