/**
 * Engine observations: each tick, the scheduler reads the TTL of every watched testnet contract
 * and appends one `observations` row per contract it could read (API `lastObservation`).
 *
 * Until this existed nothing wrote `observations` (0008 left the grant UNDETERMINED), so every
 * dashboard row read "Not checked by the engine yet", even for a contract autopilot had extended.
 *
 * - **Every watched contract, not only autopilot items.** Observations are per contract, not per
 *   user, so one row serves everyone who watches it. Each user's scope becomes a scan request;
 *   core merges requests for the same contract.
 * - **Health on the default tiers** (`DEFAULT_CRITICAL_LEDGERS`, `DEFAULT_WARN_LEDGERS`), the same
 *   tiers `scan` reports with no flags and the dashboard grades with. A user's autopilot threshold
 *   is when to extend, not how healthy the contract is, and one row cannot hold several users'.
 * - **A read failure is `unknown`, never healthy.** Any issue on the contract other than a
 *   coverage caveat or an expired entry makes the row `unknown`.
 * - **No entry, no row.** A contract whose read returned nothing (RPC down) gets no row this tick:
 *   there is no ledger it was observed at. The previous row stays, with its age.
 *
 * Reads go through the read-only wrapper; the one write is the INSERT below (grant: 0019).
 */
import {
  DEFAULT_CRITICAL_LEDGERS,
  assessEntryWithThresholds,
  resolveHealthThresholds,
  scanContracts,
  worstHealth,
  type ContractScanRequest,
  type LedgerEntryReader,
} from '@evergreen-stellar/core';
import type { LedgerEntryTTL, ScanResult } from '@evergreen-stellar/shared-types';
import { scopeRequest } from './due.js';
import { readOnlyQuery } from './evaluate.js';
import type { Query } from './hosted-store.js';

export type ObservedHealth = 'healthy' | 'warning' | 'critical' | 'unknown';

export interface Observation {
  readonly contractId: string;
  readonly observedAtLedger: number;
  /** This contract's slice of the tick's scan, in `scan --json` shape. */
  readonly scan: ScanResult;
  readonly health: ObservedHealth;
}

export interface ObserveSummary {
  /** Distinct watched testnet contracts. */
  readonly contracts: number;
  /** Rows appended. */
  readonly written: number;
  /** Contracts with no row this tick: unreadable scope or nothing came back. */
  readonly skipped: number;
}

/** Column-level grant on watch_items (0008): no user, label or email. */
export const WATCHED_SQL =
  "SELECT contract_id, scope FROM watch_items WHERE network = 'testnet' AND removed_at IS NULL";

export const INSERT_OBSERVATION_SQL =
  "INSERT INTO observations (network, contract_id, observed_at_ledger, observed_at, scan, health) VALUES ('testnet', $1, $2, now(), $3::jsonb, $4)";

/** Issue kinds that bound what a read proves without being a failed read (as in due.ts). */
const NON_FAILURE_ISSUES = new Set(['coverage-limited', 'sharing-undetermined', 'entry-expired']);

const THRESHOLDS = resolveHealthThresholds({
  bumpWhenRemainingLedgersBelow: DEFAULT_CRITICAL_LEDGERS,
});

/** One contract's part of a multi-contract scan. Entries keep their full `contracts` list. */
export function sliceScan(scan: ScanResult, contractId: string): ScanResult {
  const entries: Record<string, LedgerEntryTTL> = {};
  for (const [key, entry] of Object.entries(scan.entries))
    if (entry.contracts.includes(contractId)) entries[key] = entry;
  const coverage = scan.coverage;
  const supplied = coverage?.dataKeysSuppliedByContract[contractId];
  const declared = coverage?.noDataKeysDeclaredByContract?.[contractId];
  return {
    network: scan.network,
    contracts: scan.contracts.filter((c) => c.id === contractId),
    entries,
    issues: scan.issues.filter((i) => i.contracts.includes(contractId)),
    ...(coverage === undefined
      ? {}
      : {
          coverage: {
            mode: coverage.mode,
            dataKeysSuppliedByContract: supplied === undefined ? {} : { [contractId]: supplied },
            ...(declared === undefined
              ? {}
              : { noDataKeysDeclaredByContract: { [contractId]: declared } }),
          },
        }),
  };
}

/** The observation for one contract's slice, or null when nothing came back to observe. */
export function observationOf(slice: ScanResult, contractId: string): Observation | null {
  const entries = Object.values(slice.entries);
  if (entries.length === 0) return null;
  const observedAtLedger = Math.max(...entries.map((e) => e.observedAtLedger));
  if (!Number.isSafeInteger(observedAtLedger) || observedAtLedger <= 0) return null;
  const failed = slice.issues.some((i) => !NON_FAILURE_ISSUES.has(i.kind));
  const worst = worstHealth(entries.map((e) => assessEntryWithThresholds(e, THRESHOLDS)));
  return {
    contractId,
    observedAtLedger,
    scan: slice,
    health: failed || worst === undefined ? 'unknown' : worst,
  };
}

/** Reads every watched testnet contract once and returns what to append. Writes nothing. */
export async function observeWatched(
  query: Query,
  reader: LedgerEntryReader,
): Promise<{ readonly contracts: number; readonly observations: readonly Observation[] }> {
  const rows = await readOnlyQuery(query)(WATCHED_SQL, []);
  const requests: ContractScanRequest[] = [];
  const ids = new Set<string>();
  for (const row of rows) {
    const id = row['contract_id'];
    if (typeof id !== 'string') continue;
    ids.add(id);
    const request = scopeRequest(id, row['scope']);
    if (request !== null) requests.push(request);
  }
  if (requests.length === 0) return { contracts: ids.size, observations: [] };
  const scan = await scanContracts(reader, requests);
  const observations: Observation[] = [];
  for (const id of new Set(requests.map((r) => r.contract.id))) {
    const observation = observationOf(sliceScan(scan, id), id);
    if (observation !== null) observations.push(observation);
  }
  return { contracts: ids.size, observations };
}

/** Reads, then appends one row per observed contract. */
export async function recordObservations(
  query: Query,
  reader: LedgerEntryReader,
): Promise<ObserveSummary> {
  const { contracts, observations } = await observeWatched(query, reader);
  for (const o of observations)
    await query(INSERT_OBSERVATION_SQL, [
      o.contractId,
      o.observedAtLedger,
      JSON.stringify(o.scan),
      o.health,
    ]);
  return { contracts, written: observations.length, skipped: contracts - observations.length };
}
