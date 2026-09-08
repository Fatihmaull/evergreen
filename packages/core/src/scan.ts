import type {
  ContractId,
  ContractRef,
  LedgerEntryTTL,
  LedgerKey,
  ScanIssue,
  ScanResult,
} from '@evergreen-stellar/shared-types';
import type { LedgerEntryReader } from './rpc.js';
import { instanceKey } from './rpc.js';
import { observeTTL } from './ttl.js';

/**
 * Assemble a `ScanResult` from a reader. Pure given the reader, so tests run
 * against the mock and never touch the network.
 *
 * The unit of work is the LEDGER KEY, not the contract. Contracts built from
 * identical Wasm share one `ContractCode` entry, so N contracts can map to one
 * entry — `entries` is keyed by ledger key and each entry carries the contracts
 * that consume it. Keying by contract would duplicate the shared entry, which
 * is where the rent double-count and the duplicate-bump bugs come from.
 *
 * This slice reads instance entries only (`W1-D7-01`). Code, persistent and
 * temporary entries land at `W2-D8-03`; until then a scan is deliberately
 * partial, and `issues` says so rather than implying health.
 */

export async function scanInstances(
  reader: LedgerEntryReader,
  contracts: readonly ContractRef[],
): Promise<ScanResult> {
  const issues: ScanIssue[] = [];
  const byKey = new Map<LedgerKey, ContractId[]>();

  for (const c of contracts) {
    try {
      const key = instanceKey(c.id);
      // Dedupe here, not after: two contracts sharing a key must not produce
      // two requests or two entries.
      const seen = byKey.get(key);
      if (seen) seen.push(c.id);
      else byKey.set(key, [c.id]);
    } catch (err) {
      issues.push({
        kind: 'invalid-response',
        contracts: [c.id],
        message: `Could not derive a ledger key: ${err instanceof Error ? err.message : 'unknown'}`,
      });
    }
  }

  const keys = [...byKey.keys()];
  if (keys.length === 0) {
    return { network: 'testnet', contracts, entries: {}, issues };
  }

  let latestLedger: number;
  let raw;
  try {
    ({ latestLedger, entries: raw } = await reader.read(keys));
  } catch (err) {
    return {
      network: 'testnet',
      contracts,
      entries: {},
      issues: [
        ...issues,
        {
          kind: 'rpc-error',
          contracts: contracts.map((c) => c.id),
          message: err instanceof Error ? err.message : 'RPC read failed',
        },
      ],
    };
  }

  const entries: Record<LedgerKey, LedgerEntryTTL> = {};
  const returned = new Set<LedgerKey>();

  for (const e of raw) {
    returned.add(e.key);
    entries[e.key] = {
      kind: 'instance',
      endBehavior: 'archived',
      contracts: byKey.get(e.key) ?? [],
      observedAtLedger: latestLedger,
      ttl: observeTTL({ liveUntilLedgerSeq: e.liveUntilLedgerSeq, observedAtLedger: latestLedger }),
    };
  }

  // A key we asked for and did not get back is NOT proof of archival — the
  // contract may never have been deployed. Report it as an issue and let the
  // caller decide; inferring death here would be the confidently-wrong answer.
  for (const [key, ids] of byKey) {
    if (!returned.has(key)) {
      issues.push({
        kind: 'entry-not-found',
        contracts: ids,
        entryKey: key,
        observedAtLedger: latestLedger,
        message: 'No ledger entry returned. Absence is not proof of archival or deletion.',
      });
    }
  }

  return { network: 'testnet', contracts, entries, issues };
}
