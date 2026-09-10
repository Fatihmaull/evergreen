import { scanContract } from '@evergreen-stellar/core';
import type { LedgerEntryReader } from '@evergreen-stellar/core';
import { EXIT_ERROR, exitCodeFor, formatHuman } from './scan.js';

const USAGE = 'usage: evergreen scan <contract-id> [--keys-file <path> | --no-data-keys] [--json]';
const HELP = `${USAGE}\n\nReads instance/Wasm and supplied persistent/temporary keys on Stellar Testnet.\nKeys file: { "dataKeys": ["base64 XDR LedgerKey", ...] }\n--no-data-keys asserts this contract has no additional data keys; it is not independently verified.\nScanning known keys does not enumerate all contract storage.\nExit: 0 healthy declared scope; 1 observed low TTL; 2 error; 3 incomplete information.\nPrecedence: 2 > 3 > 1 > 0. Exit status never authorizes a transaction.`;

export interface CliDependencies {
  connect(): Promise<LedgerEntryReader>;
  readKeysFile(path: string): Promise<string>;
  now(): Date;
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
  let asJson = false;
  let noDataKeys = false;
  let keysPath: string | undefined;
  for (let i = 2; i < args.length; i++) {
    if (args[i] === '--json' && !asJson) asJson = true;
    else if (args[i] === '--no-data-keys' && !noDataKeys) noDataKeys = true;
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
  } catch {
    return fail(
      'Could not connect to Stellar Testnet. Check the RPC endpoint and network configuration.',
    );
  }
  const result = await scanContract(reader, { id: contractId }, dataKeys, { noDataKeys });
  return {
    stdout: asJson ? JSON.stringify(result, null, 2) : formatHuman(result, dependencies.now()),
    stderr: '',
    exitCode: exitCodeFor(result, 17_280),
  };
}
