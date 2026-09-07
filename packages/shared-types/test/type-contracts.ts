// These examples are checked by tsc (including in CI), never executed by Vitest.
// Each @ts-expect-error must correspond to a real rejection or typecheck fails.
import type {
  BumpDecision,
  BumpRecord,
  EntryLifecycle,
  LedgerEntryTTL,
  ScanResult,
  Stroops,
  TTLObservation,
  TestnetPassphrase,
} from '../src/index.js';
import { contractA, sharedKey, successfulBump } from './examples.js';

export const missingTTL: TTLObservation = { status: 'unavailable' };
// @ts-expect-error Unknown TTL cannot invent an expiry or zero remaining lifetime.
export const fabricatedTTL: TTLObservation = {
  status: 'unavailable',
  endsAtLedger: 0,
  remainingLedgers: 0,
};
// @ts-expect-error Temporary entries are deleted, never archived.
export const restorableTemporary: EntryLifecycle = { kind: 'temporary', endBehavior: 'archived' };
// @ts-expect-error Persistent entries are archived, not deleted.
export const deletedPersistent: EntryLifecycle = { kind: 'persistent', endBehavior: 'deleted' };
// @ts-expect-error A known TTL requires the observation fields.
export const incompleteTTL: TTLObservation = { status: 'known' };
// @ts-expect-error This project's network type does not accept mainnet.
export const wrongNetwork: TestnetPassphrase = 'Public Global Stellar Network ; September 2015';
// @ts-expect-error Fees must survive JSON without floating-point rounding.
export const numericFee: Stroops = 1;
// @ts-expect-error Stroops are integer quantities, not decimal XLM.
export const fractionalFee: Stroops = '1.5';
// @ts-expect-error An extend decision must explicitly name its payer.
export const unpaidDecision: BumpDecision = {
  action: 'extend',
  entryKey: sharedKey,
  contracts: [contractA],
  reason: 'low TTL',
  extendToLedgers: 1000,
};
const { transactionHash, ...withoutHash } = successfulBump;
// @ts-expect-error A successful record requires a transaction hash.
export const unprovenSuccess: BumpRecord = withoutHash;
const { after, ...withoutAfter } = successfulBump;
// @ts-expect-error A successful record also requires observed post-bump TTL.
export const unobservedSuccess: BumpRecord = withoutAfter;
// @ts-expect-error A simulated result cannot claim a live transaction hash.
export const simulatedTransaction: BumpRecord = {
  ...withoutAfter,
  outcome: 'simulated',
  mode: 'dry-run',
};
// @ts-expect-error A simulated result cannot claim an observed post-bump TTL.
export const simulatedObservation: BumpRecord = {
  ...withoutHash,
  outcome: 'simulated',
  mode: 'dry-run',
};
const { signer, ...withoutSigner } = successfulBump;
// @ts-expect-error Successful transactions still require the signer that produced them.
export const unidentifiedSuccess: BumpRecord = withoutSigner;
const { signer: submittedSigner, ...withoutAfterOrSigner } = withoutAfter;
// @ts-expect-error Submitted transactions still require the signer that produced them.
export const unidentifiedSubmission: BumpRecord = {
  ...withoutAfterOrSigner,
  outcome: 'submitted',
};
export const contractCentricScan: ScanResult = {
  network: 'testnet',
  contracts: [],
  // @ts-expect-error Entries are keyed by ledger key, not an array of per-contract results.
  entries: [],
  issues: [],
};

export function consumeUnknownTTL(entry: LedgerEntryTTL): number | undefined {
  // @ts-expect-error Consumers must narrow unknown TTL before doing arithmetic.
  const unsafe: number = entry.ttl.remainingLedgers;
  void unsafe;
  return entry.ttl.status === 'known' ? entry.ttl.remainingLedgers : undefined;
}

void transactionHash;
void after;
void signer;
void submittedSigner;

// @ts-expect-error A failed dry-run cannot claim a live transaction hash either.
export const failedSimulation: BumpRecord = {
  ...withoutAfter,
  outcome: 'failed',
  mode: 'dry-run',
  error: { code: 'SIMULATION_FAILED', message: 'Synthetic failure' },
};
