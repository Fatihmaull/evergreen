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
  isValidBumpWindow,
  isValidThreshold,
  measureCadence,
  needsAction,
  expiredEntryIssues,
  isExpiredObservation,
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
export {
  ConfigError,
  TESTNET_PASSPHRASE,
  loadConfig,
  WORST_OBSERVED_SCHEDULER_GAP_MINUTES,
  MIN_ACTION_RUNS_IN_WINDOW,
  SCHEDULER_GAP_FLOOR_MINUTES,
} from './config.js';
export { SHARED_CODE_ENTRY_KEY } from './shared-code.js';
export { ARCHIVED_ENTRY_ADVICE } from './archived-advice.js';
export {
  lowestPassingActionWindowLedgers,
  marginLedgers,
  schedulerGapCheck,
  tickGapsLedgers,
  worstGapLedgers,
} from './scheduler-gap.js';
export {
  PROVISIONAL_HOSTED_FEE,
  PROVISIONAL_ROUTER_FEE,
  hostedFeeStroops,
  routerFeeStroops,
} from './fee.js';
export type { HostedFeeConfig } from './fee.js';
export type { ConfigLoadResult } from './config.js';
export {
  DEFAULT_CRITICAL_LEDGERS,
  DEFAULT_THRESHOLDS,
  DEFAULT_WARN_LEDGERS,
  assessEntry,
  assessEntryWithThresholds,
  resolveHealthThresholds,
  coverageIssues,
  worstHealth,
} from './health.js';
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
export type { EntryAssessment, EntryHealth, HealthThresholds, SharingStatus } from './health.js';
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
export { decideBumps, runEngine } from './engine.js';
export { approachingCritical, bumpFailed, bumpSucceeded } from './notification-templates.js';
export type { Notification } from './notification-templates.js';
export type { EngineRun, EngineHealthReport } from './engine.js';
export {
  extensionKey,
  planExtension,
  executeExtensions,
  executeExtensionEntries,
} from './extend.js';
export type {
  ExtensionPlan,
  ExtensionOptions,
  PlannedExtension,
  ExtensionExecutionDependencies,
  ExtensionExecutionResult,
  ExtensionExecutionOptions,
} from './extend.js';
export { prepareExtension, submitExtension, confirmExtension } from './extend-rpc.js';
export type { PreparedExtension, ExtensionRpc, ExtensionConfirmation } from './extend-rpc.js';
export { createEd25519Signer, isValidPayerAccount } from './ed25519-signer.js';
export { analyzeStorage } from './optimizer.js';
export type {
  StorageSettings,
  StorageAdviceContext,
  StorageAdvice,
  StorageAdviceReport,
} from './optimizer.js';

export { planEngineExecution } from './engine-execution-plan.js';
export type { EngineExecutionEntry, EngineExecutionSelection } from './engine-execution-plan.js';
export { validateExtensionEnvelope } from './ed25519-signer.js';
export { formatCount, EVIDENCE_LOCALE } from './format.js';

export { temporaryConsent } from './temporary-policy.js';
export {
  NETWORKS,
  RPC_PROVIDERS_URL,
  NetworkConfigError,
  NetworkMismatchError,
  connectNetwork,
  resolveNetwork,
} from './network.js';
export type { NetworkChoice } from './network.js';
export { priceExtend } from './price-extend.js';
export type { ExtendPrice } from './price-extend.js';
export { MIN_ACTION_RUNS_IN_WINDOW } from './config.js';
export { gapMarginLedgers, gapMarginHolds, belowGapMargin } from './gap-margin.js';
