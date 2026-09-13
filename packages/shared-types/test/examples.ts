import recorded from '../../core/test/fixtures/getLedgerEntries-guinea-pig-a.json' with { type: 'json' };
import type {
  BumpRecord,
  EntryLifecycle,
  EvergreenConfig,
  LedgerEntryTTL,
  ScanResult,
} from '../src/index.js';

export const contractA = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
// Synthetic second consumer: this is NOT a claim about a second live contract.
export const secondContract = 'synthetic-second-consumer';
const lifecycles = [
  { kind: 'instance', endBehavior: 'archived' },
  { kind: 'code', endBehavior: 'archived' },
  { kind: 'persistent', endBehavior: 'archived' },
  { kind: 'temporary', endBehavior: 'deleted' },
] as const satisfies readonly EntryLifecycle[];

// Demonstrates that the recorded RPC shape fits the types; not the production scanner.
const entries: Record<string, LedgerEntryTTL> = {};
for (const [index, entry] of recorded.result.entries.entries()) {
  const lifecycle = lifecycles[index];
  if (!lifecycle) throw new Error('Unexpected fixture entry');
  entries[entry.key] = {
    ...lifecycle,
    contracts: [contractA],
    observedAtLedger: recorded.result.latestLedger,
    ttl: {
      status: 'known',
      endsAtLedger: entry.liveUntilLedgerSeq,
      remainingLedgers: entry.liveUntilLedgerSeq - recorded.result.latestLedger,
    },
  };
}

export const recordedScan = {
  network: 'testnet',
  contracts: [{ id: contractA }],
  entries,
  issues: [],
} satisfies ScanResult;

const code = recorded.result.entries[1];
if (!code) throw new Error('Missing recorded code entry');
export const sharedKey = code.key;
export const sharedScan = {
  network: 'testnet',
  contracts: [{ id: contractA }, { id: secondContract }],
  entries: {
    [sharedKey]: {
      kind: 'code',
      endBehavior: 'archived',
      contracts: [contractA, secondContract],
      observedAtLedger: 100,
      ttl: { status: 'known', endsAtLedger: 100, remainingLedgers: 0 },
    },
  },
  issues: [],
  rentEstimate: {
    estimatedAtLedger: 100,
    extendToLedgers: 1000,
    estimatedRentStroopsByEntry: { [sharedKey]: '9007199254740993' },
    totalEstimatedRentStroops: '9007199254740993',
  },
} as const satisfies ScanResult;

// Compared to the real JSON file after removing documentation-only fields.
export const configExample = {
  network: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  defaults: {
    warnBelowLedgers: 120960,
    bumpWhenRemainingLedgersBelow: 17280,
    extendToLedgers: 518400,
  },
  contracts: [{ id: 'REPLACE_WITH_GUINEA_PIG_A_ID', label: 'guinea-pig-A', payer: 'bot-testnet' }],
  payers: { 'bot-testnet': { signer: 'ed25519', secretEnvVar: 'EVERGREEN_SIGNER_SECRET' } },
  notifications: { channel: 'email', toEnvVar: 'EVERGREEN_ALERT_TO' },
  mode: 'dry-run',
} as const satisfies EvergreenConfig;

// Compile-time compatibility: callers may still omit the new warning field.
export const legacyConfigExample = {
  ...configExample,
  defaults: { bumpWhenRemainingLedgersBelow: 17280, extendToLedgers: 518400 },
} as const satisfies EvergreenConfig;

export const multiPayerConfig = {
  ...configExample,
  contracts: [
    { id: contractA, payer: 'first' },
    { id: secondContract, payer: 'second' },
    { id: 'synthetic-third-consumer', payer: 'first' },
  ],
  payers: {
    first: { signer: 'ed25519', secretEnvVar: 'FIRST_PAYER_SECRET' },
    second: { signer: 'policy', signerRef: 'second-payer-policy' },
  },
} as const satisfies EvergreenConfig;

// Synthetic bump record. No real transaction, signature, payer, or timestamp claim.
export const successfulBump = {
  entryKey: sharedKey,
  contracts: [contractA, secondContract],
  reason: 'below configured threshold',
  payer: 'first',
  signer: { kind: 'ed25519', account: 'synthetic-public-account' },
  extendToLedgers: 1000,
  recordedAt: '2026-09-07T00:00:00Z',
  before: { observedAtLedger: 100, endsAtLedger: 100 },
  outcome: 'succeeded',
  mode: 'live',
  transactionHash: 'synthetic-confirmed-hash',
  after: { observedAtLedger: 101, endsAtLedger: 1101 },
} as const satisfies BumpRecord;
