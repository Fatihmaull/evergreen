import type {
  BumpDecision,
  ContractId,
  EvergreenConfig,
  LedgerKey,
  ScanResult,
} from '@evergreen-stellar/shared-types';
import { needsAction } from './ttl.js';
import { assessEntry } from './health.js';
import { assertLiveness, type LivenessVerdict } from './liveness.js';
import { ProtectedEntryError, assertWriteAllowed } from './write-guard.js';
import { resolveExtendTarget } from './network-config.js';
import { scanContracts } from './scan-contract.js';
import { coverageIssues } from './health.js';
import type { LedgerEntryReader } from './rpc.js';

/**
 * The engine's decision pass (`W3-D15-01`).
 *
 * **This is the first thing in the project that selects targets without a human
 * choosing them**, which is the entire scenario the write guard exists for. So
 * the guard is consulted on every candidate, before anything is planned, and a
 * refusal is recorded as a DECISION rather than thrown.
 *
 * That distinction is the whole design. A refusal is a non-event — no
 * transaction, no hash, nothing an explorer will ever show — so if the engine
 * crashed or silently skipped, the most important thing it did would leave no
 * trace. `W3-D18-02b` depends on exactly this: on ~2026-09-20 the engine will
 * detect guinea-pig B crossing, the guard will refuse, and that refusal IS the
 * evidence.
 *
 * Decide only. Execution stays behind `planExtension`/`executeExtensions`
 * (`W3-D16-01`) so that nothing here can submit by accident.
 */

export interface EngineRun {
  readonly scan: ScanResult;
  readonly decisions: readonly BumpDecision[];
  readonly liveness: LivenessVerdict;
  /** Always 'dry-run' from this module. Nothing here signs or submits. */
  readonly mode: 'dry-run';
}

/** Contracts the caller told us about, keyed by entry, as a floor not a census. */
function consumersOf(scan: ScanResult, entryKey: LedgerKey): readonly ContractId[] {
  return scan.entries[entryKey]?.contracts ?? [];
}

/**
 * Pure. No network, no clock, no config file — so `W3-D15-03` can exercise
 * every branch against fixtures.
 */
export function decideBumps(scan: ScanResult, config: EvergreenConfig): readonly BumpDecision[] {
  const decisions: BumpDecision[] = [];
  const byContract = new Map(config.contracts.map((c) => [c.id, c]));

  for (const [entryKey, entry] of Object.entries(scan.entries)) {
    const consumers = consumersOf(scan, entryKey as LedgerKey);
    // The first configured consumer owns the decision. A shared code entry can
    // have several; picking one deterministically beats emitting duplicates for
    // the same ledger key, which is the within-run idempotency case W3-D16-02b
    // covers on the execution side.
    const owner = consumers.map((id) => byContract.get(id)).find((c) => c !== undefined);
    if (!owner) continue;

    const thresholds = { ...config.defaults, ...(owner.thresholds ?? {}) };
    const assessment = assessEntry(entry, thresholds.bumpWhenRemainingLedgersBelow);

    if (entry.ttl.status === 'unavailable') {
      decisions.push({
        action: 'skip',
        entryKey: entryKey as LedgerKey,
        contracts: consumers,
        reason: 'TTL could not be read. Unknown is not healthy — investigate rather than extend.',
      });
      continue;
    }

    // CALLS the shared predicate. Never restates it: a longhand copy of this
    // comparison is what made the engine and CI disagree at exactly the
    // threshold on 2026-09-10.
    if (!needsAction(entry.ttl.remainingLedgers, thresholds.bumpWhenRemainingLedgersBelow)) {
      decisions.push({
        action: 'skip',
        entryKey: entryKey as LedgerKey,
        contracts: consumers,
        reason: `Above threshold: ${entry.ttl.remainingLedgers.toLocaleString()} ledgers remaining.`,
      });
      continue;
    }

    // 🔴 THE GUARD, BEFORE ANYTHING IS PLANNED.
    //
    // Recorded as a skip, not thrown. One protected subject must not abort the
    // run: the other contracts in the config still need deciding, and a crash
    // here would take the alert down with it — silence at exactly the moment
    // the engine is doing the most interesting thing it will ever do.
    try {
      assertWriteAllowed({
        contractId: owner.id,
        entryKeys: [entryKey as LedgerKey],
        scan,
      });
    } catch (error) {
      if (!(error instanceof ProtectedEntryError)) throw error;
      decisions.push({
        action: 'skip',
        entryKey: entryKey as LedgerKey,
        contracts: consumers,
        reason: `REFUSED BY WRITE GUARD — ${error.message.split('\n')[0]}`,
      });
      continue;
    }

    const target = resolveExtendTarget({
      currentRemainingLedgers: entry.ttl.remainingLedgers,
      additionalLedgers: thresholds.extendToLedgers,
      maxEntryTtl: Number.MAX_SAFE_INTEGER,
    });

    decisions.push({
      action: 'extend',
      entryKey: entryKey as LedgerKey,
      contracts: consumers,
      payer: owner.payer,
      extendToLedgers: target.extendToLedgers,
      reason: `${assessment.health.toUpperCase()} — ${assessment.reason}`,
    });
  }

  return decisions;
}

/**
 * Read config, scan every registered contract, decide. Dry-run always.
 *
 * `assertLiveness` runs over the decisions so a run that acted on nothing says
 * WHY it acted on nothing — a deliberate skip and a broken run look identical
 * from the outside otherwise, and that is the failure this project keeps
 * catching everywhere else.
 */
export async function runEngine(
  reader: LedgerEntryReader,
  config: EvergreenConfig,
): Promise<EngineRun> {
  const scanned = await scanContracts(
    reader,
    config.contracts.map((c) => ({
      contract: { id: c.id, ...(c.label === undefined ? {} : { label: c.label }) },
      dataKeys: c.dataKeys ?? [],
      ...(c.noDataKeys === undefined ? {} : { noDataKeys: c.noDataKeys }),
    })),
  );
  const scan = { ...scanned, issues: [...scanned.issues, ...coverageIssues(scanned)] };
  const decisions = decideBumps(scan, config);
  const liveness = assertLiveness({
    scan,
    thresholds: { bumpWhenRemainingLedgersBelow: config.defaults.bumpWhenRemainingLedgersBelow },
    records: [],
    decisions,
  });
  return { scan, decisions, liveness, mode: 'dry-run' };
}
