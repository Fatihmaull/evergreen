import type {
  BumpDecision,
  EvergreenConfig,
  LedgerKey,
  ScanResult,
} from '@evergreen-stellar/shared-types';
import { hasExpired, needsAction } from './ttl.js';
import { assessEntry } from './health.js';
import { assertLiveness, type LivenessVerdict } from './liveness.js';
import { ProtectedEntryError, assertWriteAllowed } from './write-guard.js';
import {
  STATE_ARCHIVAL_CONFIG_KEY,
  parseStateArchivalSettings,
  resolveExtendTarget,
} from './network-config.js';
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

/** One resolution is shared by the decision pass and the liveness assertion. */
interface DecisionPass {
  readonly decisions: readonly BumpDecision[];
  readonly actionThresholdByEntry: Readonly<Record<LedgerKey, number>>;
}

/** Pure preview. Without an observed ceiling, due entries refuse to plan a target. */
export function decideBumps(
  scan: ScanResult,
  config: EvergreenConfig,
  maxEntryTtl?: number,
): readonly BumpDecision[] {
  return evaluateBumps(scan, config, maxEntryTtl).decisions;
}

function evaluateBumps(
  scan: ScanResult,
  config: EvergreenConfig,
  maxEntryTtl: number | undefined,
): DecisionPass {
  const decisions: BumpDecision[] = [];
  const actionThresholdByEntry: Record<LedgerKey, number> = {};
  const byContract = new Map(config.contracts.map((c) => [c.id, c]));

  for (const [entryKey, entry] of Object.entries(scan.entries)) {
    const consumers = entry.contracts;
    const registrations = consumers.map((id) => byContract.get(id));
    const configured = registrations.filter((c) => c !== undefined);
    if (configured.length === 0) continue;
    const policies = configured.map((c) => ({ ...config.defaults, ...c.thresholds }));
    const actionThreshold = Math.max(...policies.map((p) => p.bumpWhenRemainingLedgersBelow));
    actionThresholdByEntry[entryKey] = actionThreshold;
    const skip = (reason: string): void => {
      decisions.push({ action: 'skip', entryKey, contracts: consumers, reason });
    };
    if (entry.ttl.status === 'unavailable') {
      skip('TTL could not be read. Unknown is not healthy — investigate rather than extend.');
      continue;
    }
    const { remainingLedgers } = entry.ttl;
    if (!needsAction(remainingLedgers, actionThreshold)) {
      skip(`Above threshold: ${remainingLedgers.toLocaleString()} ledgers remaining.`);
      continue;
    }

    // Preserve refusals as decisions, before payer selection or target planning.
    // The full scan lets the guard check every consumer, including shared keys.
    const first = configured[0]!;
    try {
      assertWriteAllowed({ contractId: first.id, entryKeys: [entryKey], scan });
    } catch (error) {
      if (!(error instanceof ProtectedEntryError)) throw error;
      skip(`REFUSED BY WRITE GUARD — ${error.message.split('\n')[0]}`);
      continue;
    }
    if (hasExpired(remainingLedgers)) {
      skip(
        entry.endBehavior === 'deleted'
          ? 'Expired temporary entry cannot be extended or restored.'
          : 'Expired entry requires restoration, not extendTTL.',
      );
      continue;
    }
    if (
      configured.length !== registrations.length ||
      configured.some((c) => !Object.hasOwn(config.payers, c.payer))
    ) {
      skip('Unresolved payer policy for a consumer of this entry.');
      continue;
    }
    if (configured.some((c) => c.payer !== first.payer)) {
      skip('Conflicting payer policies for a shared entry; no payer was selected.');
      continue;
    }
    const requestedTarget = policies[0]!.extendToLedgers;
    if (policies.some((p) => p.extendToLedgers !== requestedTarget)) {
      skip('Conflicting target policies for a shared entry; no target was selected.');
      continue;
    }
    if (
      !Number.isSafeInteger(requestedTarget) ||
      requestedTarget <= 0 ||
      needsAction(requestedTarget, actionThreshold) ||
      needsAction(requestedTarget, remainingLedgers)
    ) {
      skip('Configured target must increase TTL and clear the action threshold.');
      continue;
    }
    if (
      maxEntryTtl === undefined ||
      !Number.isSafeInteger(maxEntryTtl) ||
      maxEntryTtl <= 0 ||
      maxEntryTtl > 0xffff_ffff
    ) {
      skip('No valid observed network TTL ceiling; target planning refused.');
      continue;
    }
    const target = resolveExtendTarget({
      currentRemainingLedgers: remainingLedgers,
      additionalLedgers: requestedTarget - remainingLedgers,
      maxEntryTtl,
    });
    if (
      needsAction(target.extendToLedgers, actionThreshold) ||
      needsAction(target.extendToLedgers, remainingLedgers)
    ) {
      skip('Network-capped target cannot increase TTL and clear the action threshold.');
      continue;
    }
    const assessment = assessEntry(entry, actionThreshold);
    decisions.push({
      action: 'extend',
      entryKey,
      contracts: consumers,
      payer: first.payer,
      extendToLedgers: target.extendToLedgers,
      reason:
        `${assessment.health.toUpperCase()} — ${assessment.reason}` +
        (target.wasCapped
          ? ` Target capped to ${target.extendToLedgers} by the network ceiling.`
          : ''),
    });
  }
  return { decisions, actionThresholdByEntry };
}

/** Read config, scan registered contracts, decide, assert liveness. Never execute. */
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
  let maxEntryTtl: number | undefined;
  if (Object.keys(scan.entries).length > 0) {
    try {
      const response = await reader.read([STATE_ARCHIVAL_CONFIG_KEY]);
      const entry = response.entries.find((e) => e.key === STATE_ARCHIVAL_CONFIG_KEY);
      if (!entry?.entryXdr) throw new Error('Missing settings');
      const settings = parseStateArchivalSettings(entry.entryXdr, response.latestLedger);
      if (
        !Number.isSafeInteger(settings.maxEntryTtl) ||
        settings.maxEntryTtl <= 0 ||
        settings.maxEntryTtl > 0xffff_ffff
      )
        throw new Error('Invalid settings');
      maxEntryTtl = settings.maxEntryTtl;
    } catch {
      // No raw RPC error or URL: the reader can carry credentials in diagnostics.
      scan.issues.push({
        kind: 'rpc-error',
        contracts: scan.contracts.map((c) => c.id),
        message:
          'Could not read valid state-archival settings; no extension target can be planned.',
      });
    }
  }
  const { decisions, actionThresholdByEntry } = evaluateBumps(scan, config, maxEntryTtl);
  const liveness = assertLiveness({
    scan,
    thresholds: { bumpWhenRemainingLedgersBelow: config.defaults.bumpWhenRemainingLedgersBelow },
    actionThresholdByEntry,
    records: [],
    decisions,
  });
  return { scan, decisions, liveness, mode: 'dry-run' };
}
