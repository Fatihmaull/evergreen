import {
  isValidContractId,
  isValidPayerAccount,
  ProtectedEntryError,
} from '@evergreen-stellar/core';
import type {
  ExtensionExecutionResult,
  ExtensionPlan,
  PreparedExtension,
} from '@evergreen-stellar/core';
import type { CliOutput } from './command.js';

export interface ExtendRequest {
  readonly contractId: string;
  readonly additionalLedgers: number;
  readonly sourceAccount: string;
  readonly dataKeys: readonly string[];
  readonly includeCode: boolean;
  readonly submit: boolean;
  readonly secretEnv?: string;
  readonly maxFeeStroops?: string;
}
export interface ExtendReport {
  readonly plan: ExtensionPlan;
  readonly result: ExtensionExecutionResult;
  readonly previews: readonly PreparedExtension[];
}
export interface ExtendCliDependencies {
  readonly sourceAccount?: string;
  readKeysFile(path: string): Promise<string>;
  run(request: ExtendRequest, preview: (text: string) => void): Promise<ExtendReport>;
  /** bin.ts prints this to stderr BEFORE any signature; JSON stdout stays valid. */
  preview?(text: string): void;
}

export const EXTEND_HELP = `usage: evergreen extend <contract-id> --ledgers N
  [--source-account G...] [--keys-file path] [--include-code] [--json]
  [--submit --secret-env NAME --max-fee-stroops N]

Testnet only. Default: simulate, never sign or submit. Supply a public payer
with --source-account or EVERGREEN_SOURCE_ACCOUNT; there is no fallback payer.
--ledgers N adds N ledgers to each selected entry's current remaining TTL.
The operation target is capped at max_entry_ttl - 1; capping is reported.
Selects instance by default. A keys file adds explicit data keys:
{ "dataKeys": ["base64 XDR LedgerKey", ...] }. Storage is not enumerated.
--include-code explicitly includes Wasm shared with potentially unseen consumers.
--submit requires an exported secret variable NAME and an aggregate fee cap in
integer stroops. Never put the secret itself in arguments. No .env auto-loading.
No automatic restore or funding. No replacement send after uncertain results.
Exit 0: complete simulation, no-op, or verified live result; 2: error or partial/
unconfirmed result. Simulation success does not mean TTL changed.`;

export function extensionPreview(p: PreparedExtension): string {
  return (
    `Selected ${p.entry.kind} ${p.entry.entryKey}\nKnown consumers: ${p.entry.contracts.join(', ')}\n` +
    `Payer: ${p.sourceAccount}\nPrepared hash (not yet sent): ${p.transactionHash}\nBefore: ledger ${p.entry.before.observedAtLedger}, live until ${p.entry.before.endsAtLedger}\n` +
    `Target remaining: ${p.entry.extendToLedgers}${p.entry.wasCapped ? ' (CAPPED)' : ''}; prepared fee cap: ${p.feeStroops} stroops\n` +
    'Selected scope only. Code may have consumers outside this scan.'
  );
}

export async function runExtendCli(
  args: readonly string[],
  deps: ExtendCliDependencies,
): Promise<CliOutput> {
  const fail = (message: string): CliOutput => ({ stdout: '', stderr: message, exitCode: 2 });
  if (args.length === 2 && args[1] === '--help')
    return { stdout: EXTEND_HELP, stderr: '', exitCode: 0 };
  const contractId = args[1];
  if (args[0] !== 'extend' || !contractId || !isValidContractId(contractId))
    return fail('Expected a valid contract ID.\n' + EXTEND_HELP);
  const values = new Map<string, string>();
  const flags = new Set<string>();
  const valueOptions = new Set([
    '--ledgers',
    '--source-account',
    '--keys-file',
    '--secret-env',
    '--max-fee-stroops',
  ]);
  for (let i = 2; i < args.length; i++) {
    const arg = args[i]!;
    if (values.has(arg) || flags.has(arg)) return fail('Repeated extend option.');
    if (valueOptions.has(arg)) {
      const value = args[++i];
      if (!value || value.startsWith('-')) return fail('Missing extend option value.');
      values.set(arg, value);
    } else if (['--submit', '--json', '--include-code'].includes(arg)) flags.add(arg);
    else return fail('Unknown or conflicting extend option.\n' + EXTEND_HELP);
  }
  const rawLedgers = values.get('--ledgers') ?? '';
  const additionalLedgers = Number(rawLedgers);
  const sourceAccount = values.get('--source-account') ?? deps.sourceAccount;
  const submit = flags.has('--submit');
  const secretEnv = values.get('--secret-env');
  const maxFeeStroops = values.get('--max-fee-stroops');
  if (!/^[1-9]\d*$/.test(rawLedgers) || !Number.isSafeInteger(additionalLedgers))
    return fail('--ledgers needs a positive safe integer.');
  if (!sourceAccount || !isValidPayerAccount(sourceAccount))
    return fail('A valid public payer is required (--source-account or EVERGREEN_SOURCE_ACCOUNT).');
  if (
    (maxFeeStroops !== undefined && !/^[1-9]\d*$/.test(maxFeeStroops)) ||
    (submit && (!secretEnv || !maxFeeStroops)) ||
    (!submit && secretEnv !== undefined) ||
    (secretEnv !== undefined && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(secretEnv))
  )
    return fail(
      '--submit requires --secret-env NAME and --max-fee-stroops N; secret selection is live-only.',
    );
  let dataKeys: string[] = [];
  const keysPath = values.get('--keys-file');
  if (keysPath !== undefined) {
    try {
      const parsed: unknown = JSON.parse(await deps.readKeysFile(keysPath));
      if (
        typeof parsed !== 'object' ||
        parsed === null ||
        Array.isArray(parsed) ||
        !('dataKeys' in parsed) ||
        !Array.isArray(parsed.dataKeys) ||
        parsed.dataKeys.some((k) => typeof k !== 'string')
      )
        return fail('Invalid keys file: expected dataKeys string array.');
      dataKeys = parsed.dataKeys;
    } catch {
      return fail('Unable to read a valid keys file.');
    }
  }
  try {
    const report = await deps.run(
      {
        contractId,
        additionalLedgers,
        sourceAccount,
        dataKeys,
        includeCode: flags.has('--include-code'),
        submit,
        ...(secretEnv === undefined ? {} : { secretEnv }),
        ...(maxFeeStroops === undefined ? {} : { maxFeeStroops }),
      },
      (text) => deps.preview?.(text),
    );
    const stdout = flags.has('--json')
      ? JSON.stringify(report, null, 2)
      : [
          `Mode: ${report.result.mode}. ${report.result.ok ? 'Complete' : 'Incomplete'}.`,
          ...report.plan.warnings,
          ...report.previews.map(extensionPreview),
          ...report.result.records.map(
            (r) =>
              `${r.entryKey}: ${r.outcome}${'transactionHash' in r && r.transactionHash ? ` (${r.transactionHash})` : ''}`,
          ),
          ...report.result.skipped.map((k) => `${k}: no-op (target already satisfied)`),
          ...report.result.unattempted.map((k) => `${k}: not attempted`),
          'A submitted/unconfirmed hash must be reconciled before retrying; no automatic replacement was sent.',
        ].join('\n');
    return {
      stdout,
      stderr: report.result.ok
        ? ''
        : 'Extension incomplete. Inspect per-entry outcomes and reconcile any submitted hash before retrying.',
      exitCode: report.result.ok ? 0 : 2,
    };
  } catch (error) {
    // A protected-subject refusal is NOT a connectivity problem, and reporting
    // it as one sends the operator to check their RPC endpoint while the real
    // message — that this write would spend an unrepeatable proof — is thrown
    // away. Same defect class as the wrong-network message fixed in W2-D10-03:
    // a safety event wearing a generic failure.
    if (error instanceof ProtectedEntryError) return fail(error.message);
    return fail(
      'Extension preparation failed. Check Testnet RPC, selected live keys, public payer and network configuration. No raw provider details are printed.',
    );
  }
}
