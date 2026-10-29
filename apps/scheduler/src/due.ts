/**
 * Stage 1b of PH2-E4-04: which planned items are **due**, read from each contract's TTL on chain
 * with core's `scanContracts`. Still read-only and dry-run: nothing is written, signed or queued.
 *
 * The reader speaks JSON-RPC `getLedgerEntries` over the injected `fetch`, not through the SDK's
 * `rpc.Server`, so each read carries its own timeout (design §5: reads are cancellable) and tests
 * inject a fake RPC. The tick has already refused an RPC that is not on the testnet passphrase,
 * on the same URL, before this runs. Batching is core's (at most 200 keys per read).
 *
 * An item is:
 * - `due` when every entry it watches has a known TTL, none has ended, and the smallest
 *   remaining TTL is at or below its `threshold_ledgers`;
 * - `not-due` under the same conditions with every entry above the threshold;
 * - `expired` when an entry's TTL has ended (an extend cannot revive it; restore is separate);
 * - `undetermined` otherwise (a failed or partial read, an unknown TTL, a scope we cannot read).
 *   Undetermined is never read as either answer.
 */
import {
  isExpiredObservation,
  needsAction,
  scanContracts,
  type ContractScanRequest,
  type LedgerEntryReader,
} from '@evergreen-stellar/core';
import type { LedgerEntryTTL, ScanResult } from '@evergreen-stellar/shared-types';
import type { TenantItem, TenantPlan } from '@evergreen/engine/dist/tenants.js';
import type { FetchLike } from './tick.js';

export type DueVerdict = 'due' | 'not-due' | 'expired' | 'undetermined';

export interface DueCounts {
  readonly due: number;
  readonly notDue: number;
  readonly expired: number;
  readonly undetermined: number;
}

/** Issue kinds that bound what a successful read proves, without being a failed read. */
const NON_FAILURE_ISSUES = new Set(['coverage-limited', 'sharing-undetermined']);

export interface FetchReaderOptions {
  readonly rpcUrl: string;
  /** Called as a plain function, never as a method (#439). */
  readonly fetch: FetchLike;
  /** Per read. */
  readonly timeoutMs: number;
}

function isObj(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** A testnet `LedgerEntryReader` over JSON-RPC. Any failure throws; core records it as `rpc-error`. */
export function createFetchReader(options: FetchReaderOptions): LedgerEntryReader {
  const doFetch = options.fetch;
  return {
    network: 'testnet',
    async read(keys) {
      const response = await doFetch(options.rpcUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'getLedgerEntries',
          params: { keys },
        }),
        signal: AbortSignal.timeout(options.timeoutMs),
        redirect: 'manual',
      });
      if (response.status < 200 || response.status >= 300) throw new Error('RPC status');
      const body: unknown = await response.json();
      if (!isObj(body) || 'error' in body || !isObj(body['result'])) throw new Error('RPC body');
      const result = body['result'];
      const latestLedger = result['latestLedger'];
      const entries = result['entries'] ?? [];
      if (typeof latestLedger !== 'number' || !Array.isArray(entries)) throw new Error('RPC body');
      return {
        latestLedger,
        entries: entries.map((e: unknown) => {
          if (!isObj(e) || typeof e['key'] !== 'string') throw new Error('RPC entry');
          const ttl = e['liveUntilLedgerSeq'];
          return {
            key: e['key'],
            ...(typeof e['xdr'] === 'string' ? { entryXdr: e['xdr'] } : {}),
            liveUntilLedgerSeq: typeof ttl === 'number' ? ttl : undefined,
          };
        }),
      };
    },
  };
}

/** Per-tick RPC timing of the Stage 1b reads. Durations in whole milliseconds. */
export interface RpcTiming {
  /** Sum of every `getLedgerEntries` read's duration, failed reads included. */
  readonly rpcMs: number;
  /** Reads attempted (core batches at most 200 keys per read). */
  readonly rpcBatches: number;
  /** The slowest single read, 0 when none ran. */
  readonly rpcMaxMs: number;
}

/**
 * Wraps a reader so each read is timed with the injected clock (tests pass a fake one). A read
 * that throws is still counted and timed, then the error is rethrown unchanged for core.
 */
export function timedReader(
  inner: LedgerEntryReader,
  now: () => number = Date.now,
): { readonly reader: LedgerEntryReader; readonly timing: () => RpcTiming } {
  let rpcMs = 0;
  let rpcBatches = 0;
  let rpcMaxMs = 0;
  const reader: LedgerEntryReader = {
    ...(inner.network === undefined ? {} : { network: inner.network }),
    async read(keys) {
      const start = now();
      try {
        return await inner.read(keys);
      } finally {
        const ms = Math.max(0, Math.round(now() - start));
        rpcMs += ms;
        rpcBatches += 1;
        rpcMaxMs = Math.max(rpcMaxMs, ms);
      }
    },
  };
  return { reader, timing: () => ({ rpcMs, rpcBatches, rpcMaxMs }) };
}

/** The watch item's scope as core's scan request, or null when it is not one of the two API shapes. */
export function scanRequest(item: TenantItem): ContractScanRequest | null {
  const scope = item.scope;
  if (!isObj(scope)) return null;
  if (scope['noDataKeys'] === true && Object.keys(scope).length === 1)
    return { contract: { id: item.contractId }, noDataKeys: true };
  const keys = scope['dataKeys'];
  if (
    Object.keys(scope).length === 1 &&
    Array.isArray(keys) &&
    keys.every((k) => typeof k === 'string')
  )
    return { contract: { id: item.contractId }, dataKeys: keys as string[] };
  return null;
}

/** The verdict for one item from a scan that covered it. */
export function verdict(item: TenantItem, scan: ScanResult): DueVerdict {
  const id = item.contractId;
  const issues = scan.issues.filter((i) => i.contracts.includes(id));
  if (issues.some((i) => i.kind !== 'entry-expired' && !NON_FAILURE_ISSUES.has(i.kind)))
    return 'undetermined';
  if (issues.some((i) => i.kind === 'entry-expired')) return 'expired';
  const entries = (Object.values(scan.entries) as LedgerEntryTTL[]).filter((e) =>
    e.contracts.includes(id),
  );
  if (entries.length === 0) return 'undetermined';
  let min = Infinity;
  for (const entry of entries) {
    if (isExpiredObservation(entry.ttl)) return 'expired';
    if (entry.ttl.status !== 'known') return 'undetermined';
    min = Math.min(min, entry.ttl.remainingLedgers);
  }
  // The engine's plan only admits safe-integer thresholds (isEligible), so Number() is exact.
  return needsAction(min, Number(item.thresholdLedgers)) ? 'due' : 'not-due';
}

/** Scans every planned item's scope once (core dedupes keys) and returns each item's verdict. */
export async function dueVerdicts(
  plans: readonly TenantPlan[],
  reader: LedgerEntryReader,
): Promise<Map<TenantItem, DueVerdict>> {
  const out = new Map<TenantItem, DueVerdict>();
  const requests: ContractScanRequest[] = [];
  const readable: TenantItem[] = [];
  for (const item of plans.flatMap((p) => p.items)) {
    const request = scanRequest(item);
    if (request === null) out.set(item, 'undetermined');
    else {
      requests.push(request);
      readable.push(item);
    }
  }
  if (requests.length === 0) return out;
  const scan = await scanContracts(reader, requests);
  for (const item of readable) out.set(item, verdict(item, scan));
  return out;
}

/** Counts verdicts from `dueVerdicts`. */
export function countVerdicts(verdicts: ReadonlyMap<TenantItem, DueVerdict>): DueCounts {
  const counts = { due: 0, notDue: 0, expired: 0, undetermined: 0 };
  for (const v of verdicts.values()) {
    if (v === 'due') counts.due += 1;
    else if (v === 'not-due') counts.notDue += 1;
    else if (v === 'expired') counts.expired += 1;
    else counts.undetermined += 1;
  }
  return counts;
}

/** Scans every planned item's scope once and counts verdicts. */
export async function countDue(
  plans: readonly TenantPlan[],
  reader: LedgerEntryReader,
): Promise<DueCounts> {
  return countVerdicts(await dueVerdicts(plans, reader));
}
