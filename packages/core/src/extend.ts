import { Address, xdr } from '@stellar/stellar-sdk';
import type {
  BumpRecord,
  LedgerEntryTTL,
  ScanResult,
  Signer,
} from '@evergreen-stellar/shared-types';
import type { ExtensionConfirmation, PreparedExtension } from './extend-rpc.js';
import { instanceKey, isValidContractId } from './rpc.js';
import { resolveExtendTarget } from './network-config.js';
import { hasExpired, needsAction } from './ttl.js';

export interface ExtensionOptions {
  readonly contractId: string;
  readonly additionalLedgers: number;
  readonly maxEntryTtl: number;
  readonly dataKeys?: readonly string[];
  readonly includeCode?: boolean;
}
export interface PlannedExtension {
  readonly entryKey: string;
  readonly kind: LedgerEntryTTL['kind'];
  readonly contracts: readonly string[];
  readonly before: { readonly observedAtLedger: number; readonly endsAtLedger: number };
  readonly extendToLedgers: number;
  readonly wasCapped: boolean;
  readonly skip: boolean;
}
export interface ExtensionPlan {
  readonly contractId: string;
  readonly additionalLedgers: number;
  readonly entries: readonly PlannedExtension[];
  readonly warnings: readonly string[];
}

/** Strict base64 round trip: Buffer alone would silently repair invalid input. */
export function extensionKey(text: string): xdr.LedgerKey {
  if (!text || Buffer.from(text, 'base64').toString('base64') !== text)
    throw new Error('Invalid extension ledger key');
  const key = xdr.LedgerKey.fromXDR(text, 'base64');
  if (key.toXDR('base64') !== text) throw new Error('Invalid extension ledger key');
  return key;
}

export function planExtension(scan: ScanResult, options: ExtensionOptions): ExtensionPlan {
  const { contractId, additionalLedgers, maxEntryTtl } = options;
  if (scan.network !== 'testnet' || !isValidContractId(contractId))
    throw new Error('Extension requires a valid Testnet contract');
  if (
    !Number.isSafeInteger(additionalLedgers) ||
    additionalLedgers <= 0 ||
    !Number.isSafeInteger(maxEntryTtl) ||
    maxEntryTtl <= 0 ||
    maxEntryTtl > 0xffff_ffff
  )
    throw new Error('Invalid extension increment or network ceiling');
  const keys = new Map<string, LedgerEntryTTL['kind']>([[instanceKey(contractId), 'instance']]);
  for (const supplied of options.dataKeys ?? []) {
    const text = supplied.trim();
    const key = extensionKey(text);
    if (
      key.type !== 'contractData' ||
      Address.fromScAddress(key.contractData.contract).toString() !== contractId ||
      key.contractData.key.type === 'scvLedgerKeyContractInstance'
    )
      throw new Error('Expected a data key belonging to this contract');
    keys.set(text, key.contractData.durability.name === 'temporary' ? 'temporary' : 'persistent');
  }
  if (options.includeCode) {
    const code = Object.entries(scan.entries).filter(
      ([, e]) => e.kind === 'code' && e.contracts.includes(contractId),
    );
    if (code.length !== 1) throw new Error('Cannot identify the selected code entry');
    const key = code[0]![0];
    if (extensionKey(key).type !== 'contractCode') throw new Error('Invalid code entry');
    keys.set(key, 'code');
  }
  const entries = [...keys].map(([entryKey, kind]): PlannedExtension => {
    const entry = scan.entries[entryKey];
    if (
      !entry ||
      entry.kind !== kind ||
      !entry.contracts.includes(contractId) ||
      entry.ttl.status !== 'known' ||
      scan.issues.some(
        (i) => i.entryKey === entryKey || (!i.entryKey && i.contracts.includes(contractId)),
      )
    )
      throw new Error('A selected entry is missing or unreadable');
    const { endsAtLedger, remainingLedgers } = entry.ttl;
    if (
      !Number.isSafeInteger(entry.observedAtLedger) ||
      entry.observedAtLedger < 0 ||
      !Number.isSafeInteger(endsAtLedger) ||
      endsAtLedger > 0xffff_ffff ||
      remainingLedgers !== endsAtLedger - entry.observedAtLedger ||
      hasExpired(remainingLedgers) ||
      !Number.isSafeInteger(remainingLedgers + additionalLedgers)
    )
      throw new Error('A selected entry is expired or has invalid TTL metadata');
    const target = resolveExtendTarget({
      currentRemainingLedgers: remainingLedgers,
      additionalLedgers,
      maxEntryTtl,
    });
    return {
      entryKey,
      kind,
      contracts: [...new Set(entry.contracts)],
      before: { observedAtLedger: entry.observedAtLedger, endsAtLedger },
      extendToLedgers: target.extendToLedgers,
      wasCapped: target.wasCapped,
      skip: !needsAction(remainingLedgers, target.extendToLedgers - 1),
    };
  });
  return {
    contractId,
    additionalLedgers,
    entries,
    warnings: [
      'Only selected keys are extended; storage is not enumerated and whole-contract protection is not established.',
      ...(options.includeCode
        ? ['Code can serve other contracts outside this scan; extending it affects all consumers.']
        : []),
      ...(entries.some((e) => e.wasCapped)
        ? ['The network ceiling limits the requested additional lifetime.']
        : []),
    ],
  };
}

export interface ExtensionExecutionDependencies {
  prepare(entry: PlannedExtension): Promise<PreparedExtension>;
  signer(prepared: PreparedExtension, remainingFeeStroops: string): Signer;
  submit(prepared: PreparedExtension, signedXdr: string): Promise<{ status: string; hash: string }>;
  confirm(hash: string): Promise<ExtensionConfirmation>;
  readAfter(entryKey: string): Promise<{ observedAtLedger: number; endsAtLedger: number }>;
  preview(prepared: PreparedExtension): Promise<void>;
  now(): Date;
}
export interface ExtensionExecutionResult {
  readonly ok: boolean;
  readonly mode: 'dry-run' | 'live';
  readonly records: readonly BumpRecord[];
  readonly skipped: readonly string[];
  readonly unattempted: readonly string[];
  /** Reserved envelope fee upper bound; not a claim about actual fees charged. */
  readonly committedFeeStroops: string;
}

/** Execute sequentially. A possibly-sent transaction stops the run until reconciled. */
export async function executeExtensions(
  plan: ExtensionPlan,
  options: {
    readonly payer: string;
    readonly submit?: boolean;
    readonly maxFeeStroops?: string;
  },
  deps: ExtensionExecutionDependencies,
): Promise<ExtensionExecutionResult> {
  const live = options.submit === true;
  if (
    !options.payer ||
    (options.maxFeeStroops !== undefined && !/^[1-9]\d*$/.test(options.maxFeeStroops)) ||
    (live && options.maxFeeStroops === undefined)
  )
    throw new Error('Live extension needs an explicit payer and fee budget');
  const budget = options.maxFeeStroops === undefined ? undefined : BigInt(options.maxFeeStroops);
  let committed = 0n;
  const records: BumpRecord[] = [];
  const skipped: string[] = [];
  const visited = new Set<string>();
  let ok = true;
  for (const entry of plan.entries) {
    visited.add(entry.entryKey);
    if (entry.skip) {
      skipped.push(entry.entryKey);
      continue;
    }
    const base = {
      entryKey: entry.entryKey,
      contracts: entry.contracts,
      payer: options.payer,
      before: entry.before,
      extendToLedgers: entry.extendToLedgers,
      recordedAt: deps.now().toISOString(),
      reason: 'Explicit manual extension',
    };
    let sent: { hash: string; signer: Signer['identity'] } | undefined;
    let confirmed = false;
    try {
      const prepared = await deps.prepare(entry);
      if (
        !/^\d+$/.test(prepared.feeStroops) ||
        (budget !== undefined && committed + BigInt(prepared.feeStroops) > budget)
      )
        throw new Error('Fee budget exceeded');
      await deps.preview(prepared);
      if (!live) {
        records.push({ ...base, mode: 'dry-run', outcome: 'simulated' });
        // For a multi-entry preview the supplied cap bounds the whole selection.
        committed += BigInt(prepared.feeStroops);
        continue;
      }
      const signer = deps.signer(prepared, (budget! - committed).toString());
      if (signer.payer !== options.payer || signer.identity.account !== prepared.sourceAccount)
        throw new Error('Signer identity mismatch');
      const signed = await signer.signExtendTTL({
        networkPassphrase: 'Test SDF Network ; September 2015',
        transactionXdr: prepared.transactionXdr,
      });
      sent = { hash: prepared.transactionHash, signer: signer.identity };
      committed += BigInt(prepared.feeStroops);
      const response = await deps.submit(prepared, signed);
      if (response.hash !== sent.hash) throw new Error('Submission hash mismatch');
      if (response.status === 'ERROR') {
        confirmed = true;
        throw new Error('Submission rejected');
      }
      if (!['PENDING', 'DUPLICATE'].includes(response.status))
        throw new Error('Submission uncertain');
      const confirmation = await deps.confirm(sent.hash);
      if (confirmation.status === 'unconfirmed') throw new Error('Confirmation pending');
      confirmed = true;
      if (confirmation.status !== 'confirmed') throw new Error('Transaction failed');
      const after = await deps.readAfter(entry.entryKey);
      // Stellar core sets liveUntil = inclusion ledger + extendTo. Compare the
      // absolute expiry, not remaining TTL measured at different read ledgers.
      if (
        !Number.isSafeInteger(after.observedAtLedger) ||
        after.observedAtLedger < confirmation.ledger ||
        !Number.isSafeInteger(after.endsAtLedger) ||
        after.endsAtLedger <= entry.before.endsAtLedger ||
        after.endsAtLedger < confirmation.ledger + entry.extendToLedgers
      )
        throw new Error('TTL increase could not be verified');
      records.push({
        ...base,
        mode: 'live',
        outcome: 'succeeded',
        transactionHash: sent.hash,
        signer: sent.signer,
        after,
      });
    } catch {
      ok = false;
      if (sent && !confirmed)
        records.push({
          ...base,
          mode: 'live',
          outcome: 'submitted',
          transactionHash: sent.hash,
          signer: sent.signer,
        });
      else if (live)
        records.push({
          ...base,
          mode: 'live',
          outcome: 'failed',
          ...(sent ? { transactionHash: sent.hash, signer: sent.signer } : {}),
          error: {
            code: 'EXTENSION_FAILED',
            message: 'Extension rejected or post-state unverified. No replacement was submitted.',
          },
        });
      else
        records.push({
          ...base,
          mode: 'dry-run',
          outcome: 'failed',
          error: {
            code: 'SIMULATION_FAILED',
            message: 'Extension preparation or fee validation failed. Nothing was submitted.',
          },
        });
      break;
    }
  }
  return {
    ok,
    mode: live ? 'live' : 'dry-run',
    records,
    skipped,
    unattempted: plan.entries.filter((e) => !visited.has(e.entryKey)).map((e) => e.entryKey),
    committedFeeStroops: live ? committed.toString() : '0',
  };
}
