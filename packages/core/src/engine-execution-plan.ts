import { Address } from '@stellar/stellar-sdk';
import type { BumpDecision, EvergreenConfig, ScanResult } from '@evergreen-stellar/shared-types';
import { extensionKey } from './extend.js';
import type { PlannedExtension } from './extend.js';
import { hasExpired, needsAction } from './ttl.js';
import { resolveHealthThresholds } from './health.js';
import { assertWriteAllowed, ProtectedEntryError } from './write-guard.js';

export interface EngineExecutionEntry {
  readonly payer: string;
  readonly entry: PlannedExtension;
}
export interface EngineExecutionSelection {
  readonly entries: readonly EngineExecutionEntry[];
  readonly decisions: readonly BumpDecision[];
}

/** Exact-key adapter. It never adds the manual planner's implicit instance. */
export function planEngineExecution(
  scan: ScanResult,
  decisions: readonly BumpDecision[],
  config: EvergreenConfig,
): EngineExecutionSelection {
  if (scan.network !== 'testnet') throw new Error('Execution requires Testnet observations');
  if (new Set(decisions.map((d) => d.entryKey)).size !== decisions.length)
    throw new Error('Duplicate execution decisions');
  const entries: EngineExecutionEntry[] = [];
  const selected: BumpDecision[] = [];
  for (const decision of decisions) {
    if (decision.action === 'skip') {
      selected.push(decision);
      continue;
    }
    const entry = scan.entries[decision.entryKey];
    if (!entry) throw new Error('Selected entry is missing or unreadable');
    const skip = (reason: string): void => {
      selected.push({
        action: 'skip',
        entryKey: decision.entryKey,
        contracts: entry.contracts,
        reason,
      });
    };
    if (entry.kind !== 'instance' && entry.kind !== 'persistent') {
      skip(`Execution scope excludes ${entry.kind} entries in D16-01.`);
      continue;
    }
    const key = extensionKey(decision.entryKey);
    if (key.type !== 'contractData') throw new Error('Selected key kind mismatch');
    const owner = Address.fromScAddress(key.contractData.contract).toString();
    const kind =
      key.contractData.key.type === 'scvLedgerKeyContractInstance' ? 'instance' : 'persistent';
    if (
      key.contractData.durability.name !== 'persistent' ||
      kind !== entry.kind ||
      entry.contracts.length !== 1 ||
      entry.contracts[0] !== owner ||
      decision.contracts.length !== 1 ||
      decision.contracts[0] !== owner
    ) {
      throw new Error('Selected key kind or consumer mismatch');
    }
    try {
      assertWriteAllowed({ contractId: owner, entryKeys: [decision.entryKey], scan });
    } catch (error) {
      if (!(error instanceof ProtectedEntryError)) throw error;
      skip(`REFUSED BY WRITE GUARD — ${error.message.split('\n')[0]}`);
      continue;
    }
    const registrations = config.contracts.filter((c) => c.id === owner);
    if (
      !registrations.length ||
      !Object.hasOwn(config.payers, decision.payer) ||
      registrations.some((c) => c.payer !== decision.payer)
    )
      throw new Error('Selected payer does not match config');
    if (
      kind === 'persistent' &&
      !registrations.some((c) => c.dataKeys?.some((k) => k.trim() === decision.entryKey))
    ) {
      throw new Error('Persistent execution key was not declared');
    }
    if (
      entry.ttl.status !== 'known' ||
      scan.issues.some(
        (i) =>
          i.kind !== 'coverage-limited' &&
          i.kind !== 'sharing-undetermined' &&
          (i.entryKey === decision.entryKey || (!i.entryKey && i.contracts.includes(owner))),
      )
    ) {
      throw new Error('Selected entry is unreadable');
    }
    const { remainingLedgers, endsAtLedger } = entry.ttl;
    if (
      !Number.isSafeInteger(entry.observedAtLedger) ||
      entry.observedAtLedger < 0 ||
      !Number.isSafeInteger(endsAtLedger) ||
      endsAtLedger > 0xffff_ffff ||
      remainingLedgers !== endsAtLedger - entry.observedAtLedger ||
      hasExpired(remainingLedgers)
    ) {
      throw new Error('Selected entry is not valid live state');
    }
    const action = Math.max(
      ...registrations.map(
        (c) => resolveHealthThresholds(config.defaults, c.thresholds).criticalBelowLedgers,
      ),
    );
    const targets = registrations.map(
      (c) => c.thresholds?.extendToLedgers ?? config.defaults.extendToLedgers,
    );
    if (
      targets.some((t) => t !== targets[0]) ||
      !needsAction(remainingLedgers, action) ||
      !Number.isSafeInteger(decision.extendToLedgers) ||
      decision.extendToLedgers <= 0 ||
      decision.extendToLedgers > 0xffff_ffff ||
      decision.extendToLedgers > targets[0]! ||
      needsAction(decision.extendToLedgers, remainingLedgers) ||
      needsAction(decision.extendToLedgers, action)
    ) {
      throw new Error('Selected target does not match the action policy');
    }
    entries.push({
      payer: decision.payer,
      entry: {
        entryKey: decision.entryKey,
        kind: entry.kind,
        contracts: entry.contracts,
        before: { observedAtLedger: entry.observedAtLedger, endsAtLedger },
        extendToLedgers: decision.extendToLedgers,
        wasCapped: decision.extendToLedgers < targets[0]!,
        skip: false,
      },
    });
    selected.push(decision);
  }
  return { entries, decisions: selected };
}
