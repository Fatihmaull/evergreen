/**
 * The one place the web talks to the engine's own code.
 *
 * Everything graded or counted here comes from `@evergreen-stellar/core`, and
 * the verdict and health report come from the CLI's library entry, which
 * imports only core. Nothing about health, thresholds, sharing or blast radius
 * is re-derived here — that is the rule the spec calls "reuse, do not
 * re-derive", and #195 moves the rest of the CLI's presentation rules into core.
 */
import { installBufferShim } from '../shim/buffer-shim.js';

// Must run before any core call. Core reads `Buffer` inside its functions, not
// at import time, so installing here is early enough. Temporary — see #194.
export const bufferSource = installBufferShim();

import {
  DEFAULT_CRITICAL_LEDGERS,
  assessEntryWithThresholds,
  connectTestnet,
  coverageIssues,
  createSimulatingQuoter,
  estimateEndsAt,
  estimateRent,
  isValidContractId,
  readStateArchivalSettings as readArchivalSettings,
  resolveExtendTarget,
  resolveHealthThresholds,
  scanContract,
  scanContracts,
  worstHealth,
} from '../../../../packages/core/src/index';
import type { EntryAssessment, EntryHealth } from '../../../../packages/core/src/index';
import { exitCodeFor, healthReport } from '../../../../packages/cli/src/index';
import type { LedgerEntryTTL, ScanIssue, ScanResult } from '../../../../packages/shared-types/src/index';
import { Networks, rpc } from '@stellar/stellar-sdk';

export const RPC_URL = 'https://soroban-testnet.stellar.org';

/** Our own contracts, from `docs/SETUP.md`. No other IDs are hard-coded anywhere. */
export const OUR_CONTRACTS = [
  { id: 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L', label: 'guinea-pig A' },
  { id: 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ', label: 'guinea-pig B' },
  { id: 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL', label: 'guinea-pig C' },
] as const;

export { isValidContractId, estimateEndsAt, worstHealth, DEFAULT_CRITICAL_LEDGERS };
export type { EntryAssessment, EntryHealth, LedgerEntryTTL, ScanIssue, ScanResult };

export interface AssessedEntry {
  readonly key: string;
  readonly entry: LedgerEntryTTL;
  readonly assessment: EntryAssessment;
}

export interface ScanReport {
  readonly result: ScanResult;
  /** Issues plus core's caveats, merged exactly as the CLI merges them (command.ts:260). */
  readonly issues: readonly ScanIssue[];
  readonly entries: readonly AssessedEntry[];
  readonly worst: EntryHealth | undefined;
  /** error · incomplete · below-threshold · ok — from the CLI's exit code, not re-derived. */
  readonly verdict: 'error' | 'incomplete' | 'below-threshold' | 'ok';
  readonly partial: boolean;
  readonly thresholds: { readonly warnBelowLedgers: number; readonly criticalBelowLedgers: number };
  readonly observedAtLedger: number | undefined;
}

const VERDICTS = ['ok', 'below-threshold', 'error', 'incomplete'] as const;

export function report(result: ScanResult): ScanReport {
  const issues = [...result.issues, ...coverageIssues(result)];
  const thresholds = resolveHealthThresholds({
    bumpWhenRemainingLedgersBelow: DEFAULT_CRITICAL_LEDGERS,
  });
  const entries = Object.entries(result.entries).map(([key, entry]) => ({
    key,
    entry,
    assessment: assessEntryWithThresholds(entry, thresholds),
  }));
  const ledgers = entries.map((e) => e.entry.observedAtLedger);
  return {
    result,
    issues,
    entries,
    worst: worstHealth(entries.map((e) => e.assessment)),
    verdict: VERDICTS[exitCodeFor(result, DEFAULT_CRITICAL_LEDGERS)] ?? 'error',
    partial: issues.length > 0,
    thresholds,
    observedAtLedger: ledgers.length > 0 ? Math.max(...ledgers) : undefined,
  };
}

/** The health block the CLI puts in `--json`, for the JSON panel. */
export function health(result: ScanResult): unknown {
  return healthReport(result, DEFAULT_CRITICAL_LEDGERS);
}

export async function reader() {
  return connectTestnet(RPC_URL);
}

/** The network's own archival configuration, read live — never hard-coded. */
export async function archivalSettings() {
  return readArchivalSettings(new rpc.Server(RPC_URL));
}

export async function scanOne(id: string, dataKeys: readonly string[] = []): Promise<ScanResult> {
  return scanContract(await reader(), { id }, dataKeys);
}

export async function scanMany(ids: readonly string[]): Promise<ScanResult> {
  return scanContracts(
    await reader(),
    ids.map((id) => ({ contract: { id } })),
  );
}

export interface RentQuote {
  readonly totalRentStroops: string;
  readonly byEntry: Readonly<Record<string, string>>;
  readonly pricedAtLedger: number;
  readonly additionalLedgers: number;
  readonly cappedEntries: number;
}

/**
 * Rent only, priced by simulation. The CLI's total also carries the
 * non-refundable resource and base fees, and that assembly lives in its `bin.ts`
 * where the browser cannot reach it (#195) — so this panel says "rent", never
 * "total".
 */
export async function quoteRent(scan: ScanResult, additionalLedgers: number): Promise<RentQuote> {
  const server = new rpc.Server(RPC_URL);
  const settings = await readStateArchivalSettings(server);
  const targets: Record<string, number> = {};
  let cappedEntries = 0;
  for (const [key, entry] of Object.entries(scan.entries)) {
    if (entry.ttl.status !== 'known') continue;
    const resolved = resolveExtendTarget({
      currentRemainingLedgers: entry.ttl.remainingLedgers,
      additionalLedgers,
      maxEntryTtl: settings.maxEntryTtl,
    });
    if (resolved.wasCapped) cappedEntries += 1;
    targets[key] = resolved.extendToLedgers;
  }
  const quoter = createSimulatingQuoter(server, { networkPassphrase: Networks.TESTNET });
  const { estimate } = await estimateRent(scan, { extendToLedgers: targets }, quoter);
  return {
    totalRentStroops: estimate.totalEstimatedRentStroops,
    byEntry: estimate.estimatedRentStroopsByEntry,
    pricedAtLedger: settings.observedAtLedger,
    additionalLedgers,
    cappedEntries,
  };
}
