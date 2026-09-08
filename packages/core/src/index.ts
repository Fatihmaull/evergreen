/**
 * Evergreen core — TTL math, the RPC seam, and scan assembly.
 *
 * The unit of work is the ledger key, not the contract. `core` never imports
 * from `cli`, `engine`, or `dashboard`.
 */
export { SECONDS_PER_LEDGER, estimateEndsAt, isLive, observeTTL, uniqueEntryCount } from './ttl.js';
export { NotTestnetError, codeKey, connectTestnet, createRpcReader, instanceKey } from './rpc.js';
export type { LedgerEntryReader, RawLedgerEntry } from './rpc.js';
export { scanInstances } from './scan.js';
