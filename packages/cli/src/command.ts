import { NotTestnetError, isValidContractId, scanContract } from '@evergreen-stellar/core';
import { formatCost, type CostLine } from './cost.js';
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
  'usage: evergreen scan <contract-id> [--keys-file <path> | --no-data-keys] [--require-declared-scope] [--json] [--cost [--ledgers N]]';
const HELP = `${USAGE}

Reads instance/Wasm and supplied persistent/temporary keys on Stellar Testnet.
Keys file: { "dataKeys": ["base64 XDR LedgerKey", ...] }

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
--cost [--ledgers N]  estimate what extending every entry by N more ledgers
                      would cost, priced by simulating against the network.
                      Default N is 518,400 (~30 days). Nothing is submitted.

                      "--ledgers N" means "give me N MORE ledgers". The protocol
                      wants an absolute target, so the CLI computes it for you
                      and caps it at max_entry_ttl, saying so when it does.
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
  connect(): Promise<LedgerEntryReader>;
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
  const fail = (message: string): CliOutput => ({
    stdout: '',
    stderr: message,
    exitCode: EXIT_ERROR,
  });
  if (
    (args.length === 1 && args[0] === '--help') ||
    (args.length === 2 && args[0] === 'scan' && args[1] === '--help')
  ) {
    return { stdout: HELP, stderr: '', exitCode: 0 };
  }
  const contractId = args[1];
  if (args[0] !== 'scan' || !contractId || contractId.startsWith('-')) return fail(USAGE);
  // Validate shape BEFORE connecting. A typo should cost a one-line message,
  // not a network round trip that surfaces as a scan report full of coverage
  // boilerplate about a contract that cannot exist.
  if (!isValidContractId(contractId)) {
    return fail(
      `Not a Stellar contract ID: ${contractId}\n` +
        'Contract IDs start with C and are 56 characters (StrKey-encoded).\n' +
        'Check for a truncated paste or an account address (G…) used by mistake.',
    );
  }
  let asJson = false;
  let withCost = false;
  let additionalLedgers = DEFAULT_EXTEND_LEDGERS;
  let noDataKeys = false;
  let requireDeclaredScope = false;
  let keysPath: string | undefined;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--json' && !asJson) asJson = true;
    else if (args[i] === '--cost' && !withCost) withCost = true;
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
  const result = await scanContract(reader, { id: contractId }, dataKeys, { noDataKeys });

  let cost: CostLine | undefined;
  if (withCost) {
    if (dependencies.priceExtend === undefined) {
      return fail('--cost is unavailable: no pricing backend was configured.');
    }
    try {
      cost = await dependencies.priceExtend({ scan: result, additionalLedgers });
    } catch {
      // A failed quote must not take the scan down with it — the TTL answer is
      // still correct and still worth printing.
      return {
        stdout: asJson
          ? JSON.stringify(
              { ...result, health: healthReport(result, DEFAULT_THRESHOLD_LEDGERS) },
              null,
              2,
            )
          : `${formatHuman(result, dependencies.now(), {
              color: dependencies.color === true,
              thresholdLedgers: DEFAULT_THRESHOLD_LEDGERS,
            })}\n\n! Could not price an extend: the network declined to simulate it.\n  The TTL results above are unaffected.`,
        stderr: '',
        exitCode: exitCodeFor(result, DEFAULT_THRESHOLD_LEDGERS, { requireDeclaredScope }),
      };
    }
  }

  return {
    stdout: asJson
      ? // Additive envelope: every existing key of ScanResult is untouched, so
        // a consumer reading `entries` or `issues` is unaffected by `health`.
        JSON.stringify(
          {
            ...result,
            health: healthReport(result, DEFAULT_THRESHOLD_LEDGERS),
            ...(cost === undefined ? {} : { cost }),
          },
          null,
          2,
        )
      : formatHuman(result, dependencies.now(), {
          color: dependencies.color === true,
          thresholdLedgers: DEFAULT_THRESHOLD_LEDGERS,
        }) + (cost === undefined ? '' : `\n\n${formatCost(cost).join('\n')}`),
    stderr: '',
    // Same constant the display grades against, so the printed health and the
    // exit code can never describe different thresholds.
    exitCode: exitCodeFor(result, DEFAULT_THRESHOLD_LEDGERS, { requireDeclaredScope }),
  };
}
