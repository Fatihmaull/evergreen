/**
 * Evergreen core — TTL math, the RPC seam, and scan assembly.
 *
 * The unit of work is the ledger key, not the contract. `core` never imports
 * from `cli`, `engine`, or `dashboard`.
 */
export {
  MEASURED_TESTNET_CADENCE,
  SECONDS_PER_LEDGER,
  estimateEndsAt,
  hasExpired,
  isLive,
  isValidThreshold,
  measureCadence,
  needsAction,
  observeTTL,
  projectEnd,
  uniqueEntryCount,
} from './ttl.js';
export type { EndProjection, LedgerCadence, LedgerCloseSample } from './ttl.js';
export {
  NotTestnetError,
  codeKey,
  connectTestnet,
  createRpcReader,
  instanceKey,
  isValidContractId,
} from './rpc.js';
export type { LedgerEntryReader, RawLedgerEntry } from './rpc.js';
export { scanInstances } from './scan.js';
export { ConfigError, TESTNET_PASSPHRASE, loadConfig } from './config.js';
export type { ConfigLoadResult } from './config.js';
export { assessEntry, coverageIssues, worstHealth } from './health.js';
export { estimateRent, stroopsToXlm } from './rent.js';
export { createSimulatingQuoter } from './rent-quoter.js';
export {
  STATE_ARCHIVAL_CONFIG_KEY,
  parseStateArchivalSettings,
  readStateArchivalSettings,
  resolveExtendTarget,
} from './network-config.js';
export type { ResolvedTarget, StateArchivalSettings } from './network-config.js';
export type { QuoteBreakdown, SimulatingQuoterOptions } from './rent-quoter.js';
export type { RentEstimateResult, RentQuote, RentQuoter } from './rent.js';
export type { EntryAssessment, EntryHealth, SharingStatus } from './health.js';
export { assertLiveness } from './liveness.js';
export type {
  LivenessFinding,
  LivenessReason,
  LivenessRemediation,
  LivenessSeverity,
  LivenessVerdict,
} from './liveness.js';
export type { ContractScanRequest } from './scan-contract.js';
export { scanContract, scanContracts } from './scan-contract.js';
export { planExtension, executeExtensions } from './extend.js';
export type {
  ExtensionPlan,
  ExtensionOptions,
  PlannedExtension,
  ExtensionExecutionDependencies,
  ExtensionExecutionResult,
} from './extend.js';
export { prepareExtension, submitExtension, confirmExtension } from './extend-rpc.js';
export type { PreparedExtension, ExtensionRpc, ExtensionConfirmation } from './extend-rpc.js';
export { createEd25519Signer, isValidPayerAccount } from './ed25519-signer.js';
