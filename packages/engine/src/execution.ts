import {
  runEngine,
  planEngineExecution,
  executeExtensionEntries,
  prepareExtension,
  submitExtension,
  confirmExtension,
  createEd25519Signer,
  validateExtensionEnvelope,
  isValidPayerAccount,
  assertLiveness,
  assertWriteAllowed,
  scanContract,
  decideBumps,
  parseStateArchivalSettings,
  STATE_ARCHIVAL_CONFIG_KEY,
  hasExpired,
} from '@evergreen-stellar/core';
import type {
  EngineRun,
  EngineExecutionEntry,
  ExtensionRpc,
  LedgerEntryReader,
  PlannedExtension,
  PreparedExtension,
  LivenessVerdict,
} from '@evergreen-stellar/core';
import type {
  BumpDecision,
  BumpRecord,
  EvergreenConfig,
  PayerConfig,
  ScanResult,
  Signer,
} from '@evergreen-stellar/shared-types';
import { EngineExecutionError, executionTransport } from './transport.js';
export { EngineExecutionError } from './transport.js';

export interface SubmissionIntent {
  readonly payer: string;
  readonly sourceAccount: string;
  readonly sourceSequence: string;
  readonly entryKey: string;
  readonly targetLedgers: number;
  readonly before: PlannedExtension['before'];
  readonly transactionHash: string;
  readonly maxTime: string;
  readonly envelopeFeeStroops: string;
  readonly signer: Signer['identity'];
}
export interface SubmissionRecorder {
  assertReady(): Promise<void>;
  record(intent: SubmissionIntent): Promise<void>;
}
export interface EngineExecutionDependencies {
  readonly reader: LedgerEntryReader;
  readonly rpc: ExtensionRpc;
  readonly readSecret?: (name: string) => string;
  readonly recorder?: SubmissionRecorder;
  readonly now?: () => Date;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}
export interface EngineExecutionOptions {
  readonly submit?: boolean;
  readonly dryRun?: boolean;
  readonly maxRunMs?: number;
}
export interface EngineExecutionResult {
  readonly preview: EngineRun;
  readonly mode: 'dry-run' | 'live';
  readonly decisions: readonly BumpDecision[];
  readonly records: readonly BumpRecord[];
  readonly previews: readonly PreparedExtension[];
  readonly refreshes: readonly ScanResult[];
  readonly liveness: LivenessVerdict;
  readonly feesByPayer: Readonly<
    Record<
      string,
      {
        readonly estimatedFeeStroops: string;
        readonly reservedFeeStroops: string;
        readonly capStroops?: string;
      }
    >
  >;
  readonly warnings: readonly string[];
  readonly diagnostics: readonly { readonly code: string; readonly message: string }[];
  readonly unattempted: readonly string[];
  readonly ok: boolean;
  readonly exitCode: 0 | 1 | 2;
}
type Payer = Extract<PayerConfig, { signer: 'ed25519' }> & { readonly sourceAccount: string };

function executionPayers(
  entries: readonly EngineExecutionEntry[],
  config: EvergreenConfig,
  live: boolean,
): Map<string, Payer> {
  const resolved = new Map<string, Payer>(),
    accounts = new Set<string>();
  for (const { payer: id } of entries) {
    if (resolved.has(id)) continue;
    const payer = config.payers[id];
    if (!payer || payer.signer !== 'ed25519')
      throw new EngineExecutionError(
        'UNSUPPORTED_SIGNER',
        'Selected payer needs the Stage 1 Ed25519 signer.',
      );
    if (typeof payer.sourceAccount !== 'string' || !isValidPayerAccount(payer.sourceAccount))
      throw new EngineExecutionError(
        'INVALID_PAYER',
        'Selected payer requires a valid public sourceAccount.',
      );
    if (
      (live && payer.maxFeeStroops === undefined) ||
      (payer.maxFeeStroops !== undefined && !/^[1-9]\d*$/.test(payer.maxFeeStroops))
    )
      throw new EngineExecutionError(
        'INVALID_FEE_CAP',
        'Live execution requires a positive decimal maxFeeStroops for every selected payer.',
      );
    if (accounts.has(payer.sourceAccount))
      throw new EngineExecutionError(
        'PAYER_ALIAS',
        'One public source account cannot have independent payer aliases in an execution run.',
      );
    accounts.add(payer.sourceAccount);
    resolved.set(id, { ...payer, sourceAccount: payer.sourceAccount });
  }
  return resolved;
}

/** No cached user-supplied decisions: obtain the real core pass, then select exact keys. */
export async function runEngineExecution(
  config: EvergreenConfig,
  deps: EngineExecutionDependencies,
  options: EngineExecutionOptions = {},
): Promise<EngineExecutionResult> {
  if (options.submit && options.dryRun)
    throw new EngineExecutionError('MODE_CONFLICT', '--submit and --dry-run conflict.');
  const live = options.submit === true;
  if (live && config.mode !== 'live')
    throw new EngineExecutionError('LIVE_CONFIG_REQUIRED', '--submit requires config mode=live.');
  if (!live && config.mode === 'live' && !options.dryRun)
    throw new EngineExecutionError(
      'SUBMIT_REQUIRED',
      'Config mode=live alone cannot submit; specify --submit or explicit --dry-run.',
    );
  if (live && !deps.recorder)
    throw new EngineExecutionError(
      'RECORDER_REQUIRED',
      'Live engine execution requires a verified before-submit recorder.',
    );
  const now = deps.now ?? (() => new Date());
  const sleep = deps.sleep ?? ((ms) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const transport = executionTransport(deps.rpc, deps.reader, now, sleep, options.maxRunMs);
  if (live) {
    try {
      await deps.recorder!.assertReady();
      transport.checkDeadline();
    } catch {
      throw new EngineExecutionError(
        'RECORDER_UNAVAILABLE',
        'Submission recorder is not ready. Reconcile existing state before any new live attempt.',
      );
    }
  }
  if (
    (await transport.rpc.getNetwork()).passphrase !== config.network.networkPassphrase ||
    config.network.networkPassphrase !== 'Test SDF Network ; September 2015'
  ) {
    throw new EngineExecutionError(
      'WRONG_NETWORK',
      'RPC and execution config must both identify Stellar Testnet.',
    );
  }
  const preview = await runEngine(transport.reader, config);
  const records: BumpRecord[] = [],
    previews: PreparedExtension[] = [],
    refreshes: ScanResult[] = [];
  const diagnostics: { code: string; message: string }[] = [],
    warnings: string[] = [];
  const feesByPayer: Record<
    string,
    { estimatedFeeStroops: string; reservedFeeStroops: string; capStroops?: string }
  > = {};
  let decisions = [...preview.decisions];
  let selected: readonly EngineExecutionEntry[] = [];
  const finished = new Set<string>();
  try {
    const selection = planEngineExecution(preview.scan, preview.decisions, config);
    decisions = [...selection.decisions];
    selected = selection.entries;
    if (
      preview.scan.issues.some(
        (i) => !['coverage-limited', 'sharing-undetermined'].includes(i.kind),
      )
    ) {
      throw new EngineExecutionError(
        'SCAN_INCOMPLETE',
        'Execution requires readable selected scope; inspect scan issues before retrying.',
      );
    }
    const payers = executionPayers(selected, config, live);
    for (const [payerId, payer] of payers) {
      transport.checkDeadline();
      const group = selected.filter((item) => item.payer === payerId).map((item) => item.entry);
      if (!live && payer.maxFeeStroops === undefined)
        warnings.push(
          `Payer ${payerId}: uncapped simulation; no fee was paid or live budget validated.`,
        );
      const result = await executeExtensionEntries(
        group,
        {
          payer: payerId,
          submit: live,
          reason: 'Engine threshold extension',
          ...(payer.maxFeeStroops === undefined ? {} : { maxFeeStroops: payer.maxFeeStroops }),
        },
        {
          now,
          async refresh(entry) {
            const owner = entry.contracts[0]!;
            const fresh = await scanContract(
              transport.reader,
              { id: owner },
              entry.kind === 'persistent' ? [entry.entryKey] : [],
            );
            refreshes.push(fresh);
            const observed = fresh.entries[entry.entryKey];
            if (
              !observed ||
              observed.ttl.status !== 'known' ||
              hasExpired(observed.ttl.remainingLedgers)
            )
              throw new Error('Selected entry is no longer readable/live');
            if (
              fresh.issues.some(
                (i) =>
                  !['coverage-limited', 'sharing-undetermined'].includes(i.kind) &&
                  (i.entryKey === entry.entryKey || !i.entryKey),
              )
            )
              throw new Error('Selected entry refresh failed');
            const network = await transport.reader.read([STATE_ARCHIVAL_CONFIG_KEY]);
            const state = network.entries.find((e) => e.key === STATE_ARCHIVAL_CONFIG_KEY);
            if (!state?.entryXdr) throw new Error('Network settings missing');
            const max = parseStateArchivalSettings(
              state.entryXdr,
              network.latestLedger,
            ).maxEntryTtl;
            const decision = decideBumps(fresh, config, max).find(
              (d) => d.entryKey === entry.entryKey,
            );
            if (!decision) throw new Error('Selected decision missing');
            decisions = decisions.map((d) => (d.entryKey === entry.entryKey ? decision : d));
            if (decision.action === 'skip') return { ...entry, skip: true };
            if (decision.payer !== payerId) throw new Error('Payer policy changed');
            const checked = planEngineExecution(fresh, [decision], config);
            if (checked.entries.length !== 1) throw new Error('Selected execution scope refused');
            return checked.entries[0]!.entry;
          },
          prepare: (entry) => prepareExtension(transport.rpc, entry, payer.sourceAccount),
          preview: async (prepared) => {
            previews.push(prepared);
          },
          signer(prepared, remainingFeeStroops) {
            transport.checkDeadline();
            assertWriteAllowed({
              contractId: prepared.entry.contracts[0]!,
              entryKeys: [prepared.entry.entryKey],
              scan: preview.scan,
            });
            return createEd25519Signer({
              payer: payerId,
              sourceAccount: payer.sourceAccount,
              entryKey: prepared.entry.entryKey,
              extendToLedgers: prepared.entry.extendToLedgers,
              expectedHash: prepared.transactionHash,
              maxFeeStroops: remainingFeeStroops,
              now: () => now().getTime() / 1000,
              readSecret: () => {
                if (!deps.readSecret) throw new Error('Secret provider missing');
                return deps.readSecret(payer.secretEnvVar);
              },
            });
          },
          async beforeSubmit(prepared, signer) {
            transport.checkDeadline();
            assertWriteAllowed({
              contractId: prepared.entry.contracts[0]!,
              entryKeys: [prepared.entry.entryKey],
              scan: preview.scan,
            });
            const tx = validateExtensionEnvelope(prepared.transactionXdr, {
              sourceAccount: payer.sourceAccount,
              entryKey: prepared.entry.entryKey,
              extendToLedgers: prepared.entry.extendToLedgers,
              expectedHash: prepared.transactionHash,
              maxFeeStroops: prepared.feeStroops,
              now: () => now().getTime() / 1000,
            });
            await deps.recorder!.record({
              payer: payerId,
              sourceAccount: payer.sourceAccount,
              sourceSequence: tx.sequence,
              entryKey: prepared.entry.entryKey,
              targetLedgers: prepared.entry.extendToLedgers,
              before: prepared.entry.before,
              transactionHash: prepared.transactionHash,
              maxTime: tx.timeBounds!.maxTime,
              envelopeFeeStroops: prepared.feeStroops,
              signer,
            });
            transport.checkDeadline();
          },
          submit: (prepared, signed) => submitExtension(transport.rpc, prepared, signed),
          confirm: (hash) => confirmExtension(transport.rpc, hash, { sleep: () => sleep(1000) }),
          async readAfter(key) {
            const response = await transport.reader.read([key]);
            const row = response.entries.find((e) => e.key === key);
            if (row?.liveUntilLedgerSeq === undefined) throw new Error('Post-state TTL missing');
            return {
              observedAtLedger: response.latestLedger,
              endsAtLedger: row.liveUntilLedgerSeq,
            };
          },
        },
      );
      records.push(...result.records);
      for (const r of result.records) finished.add(r.entryKey);
      for (const key of result.skipped) finished.add(key);
      feesByPayer[payerId] = {
        estimatedFeeStroops: result.estimatedFeeStroops,
        reservedFeeStroops: result.committedFeeStroops,
        ...(payer.maxFeeStroops === undefined ? {} : { capStroops: payer.maxFeeStroops }),
      };
      if (!result.ok) {
        diagnostics.push({
          code: 'EXECUTION_INCOMPLETE',
          message:
            'Execution stopped. Inspect records and reconcile any possibly-submitted hash before another attempt.',
        });
        break;
      }
    }
  } catch (error) {
    diagnostics.push(
      error instanceof EngineExecutionError
        ? { code: error.code, message: error.message }
        : {
            code: 'EXECUTION_PREFLIGHT_FAILED',
            message:
              'Execution preflight or refresh failed. No replacement was submitted; inspect public configuration and scan results.',
          },
    );
  }
  const liveness = assertLiveness({
    scan: preview.scan,
    thresholds: config.defaults,
    records,
    decisions,
    actionThresholdByEntry: Object.fromEntries(
      Object.entries(preview.health.thresholdsByEntry).map(([key, pair]) => [
        key,
        pair.criticalBelowLedgers,
      ]),
    ),
  });
  const unattempted = selected
    .filter((item) => !finished.has(item.entry.entryKey))
    .map((item) => item.entry.entryKey);
  const ok = diagnostics.length === 0 && unattempted.length === 0;
  return {
    preview,
    mode: live ? 'live' : 'dry-run',
    decisions,
    records,
    previews,
    refreshes,
    liveness,
    feesByPayer,
    warnings,
    diagnostics,
    unattempted,
    ok,
    exitCode: ok ? (liveness.isAlarm ? 1 : 0) : 2,
  };
}
