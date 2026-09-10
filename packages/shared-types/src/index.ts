/** Shared domain contracts. No SDK dependency, credentials, or runtime I/O. */

/** Public Stellar contract ID; validate StrKey at the input boundary. */
export type ContractId = string;
/** Canonical base64 XDR LedgerKey, not a contract ID or a display label. */
export type LedgerKey = string;
/** Lookup key in EvergreenConfig.payers, not a contract owner. */
export type PayerId = string;
/** Integer stroops encoded as decimal text for lossless JSON. Validate >= 0 at input. */
export type Stroops = `${bigint}`;
export type TestnetPassphrase = 'Test SDF Network ; September 2015';
export type ExecutionMode = 'dry-run' | 'live';

export interface ContractRef {
  readonly id: ContractId;
  readonly label?: string;
}

/** End behavior follows storage kind; temporary data cannot be restored. */
export type EntryLifecycle =
  | { readonly kind: 'temporary'; readonly endBehavior: 'deleted' }
  | { readonly kind: 'instance' | 'code' | 'persistent'; readonly endBehavior: 'archived' };

export type TTLObservation =
  | {
      readonly status: 'known';
      /** Final LIVE ledger (inclusive). Expiry starts after this ledger. */
      readonly endsAtLedger: number;
      /** endsAtLedger - observedAtLedger. Zero is still live, negative is expired. */
      readonly remainingLedgers: number;
    }
  | {
      /** Missing TTL metadata is unknown, never a fabricated zero or expiry. */
      readonly status: 'unavailable';
      readonly endsAtLedger?: never;
      readonly remainingLedgers?: never;
    };

export type LedgerEntryTTL = EntryLifecycle & {
  /** Unique input contracts known to use this entry; not a global usage census. */
  readonly contracts: readonly ContractId[];
  /** latestLedger from THIS entry's response; batches may observe different ledgers. */
  readonly observedAtLedger: number;
  readonly ttl: TTLObservation;
};

export interface ScanIssue {
  /**
   * `coverage-limited` and `sharing-undetermined` are not read FAILURES — they
   * are bounds on what a successful read can establish. They live here anyway,
   * so that a consumer asking the obvious question (`issues.length === 0`) gets
   * a correct answer. A schema with no representation for "I don't know" makes
   * the machine channel confident exactly where the human channel is careful.
   */
  readonly kind:
    | 'entry-not-found'
    | 'rpc-error'
    | 'invalid-response'
    | 'unsupported-executable'
    | 'coverage-limited'
    | 'sharing-undetermined';
  readonly contracts: readonly ContractId[];
  readonly entryKey?: LedgerKey;
  /** Present only when a valid RPC response supplied it. */
  readonly observedAtLedger?: number;
  /** Sanitized diagnostic; never a raw error containing credentials. */
  readonly message: string;
}

export interface ScanResult {
  readonly network: 'testnet';
  readonly contracts: readonly ContractRef[];
  /** Each canonical ledger key occurs once; contracts are back-references on entries. */
  readonly entries: Readonly<Record<LedgerKey, LedgerEntryTTL>>;
  /** Absence is not proof of archival/deletion. Consumers must handle partial scans. */
  readonly issues: readonly ScanIssue[];
  /** Omitted by legacy producers: coverage unknown, never proof of a complete scan. */
  readonly coverage?: {
    /** RPC reads specified keys; it does not enumerate arbitrary contract storage. */
    readonly mode: 'known-keys';
    /** Unique, validated explicit data keys, not a count of all on-chain storage. */
    readonly dataKeysSuppliedByContract: Readonly<Record<ContractId, number>>;
    /** Caller assertion of no additional data keys, not verified storage enumeration. */
    readonly noDataKeysDeclaredByContract?: Readonly<Record<ContractId, boolean>>;
  };
  /** Omitted by a TTL-only scan; missing estimate does not mean zero rent. */
  readonly rentEstimate?: RentEstimate;
}

export interface RentEstimate {
  readonly estimatedAtLedger: number;
  /** Target lifetime relative to execution, not an absolute ledger number. */
  readonly extendToLedgers: number;
  /** Sum each unique entry once, even when several contracts share it. */
  readonly estimatedRentStroopsByEntry: Readonly<Record<LedgerKey, Stroops>>;
  readonly totalEstimatedRentStroops: Stroops;
}

interface EntryDecision {
  readonly entryKey: LedgerKey;
  readonly contracts: readonly ContractId[];
  readonly reason: string;
}

export type BumpDecision = EntryDecision &
  (
    | {
        readonly action: 'extend';
        /** Explicitly resolved payer. Never choose the first shared contract implicitly. */
        readonly payer: PayerId;
        readonly extendToLedgers: number;
        readonly estimatedRentStroops?: Stroops;
      }
    | {
        /** Includes insufficient scan data/unresolved payer as well as healthy TTL. */
        readonly action: 'skip';
        readonly payer?: never;
        readonly extendToLedgers?: never;
      }
  );

export interface SignerIdentity {
  readonly kind: 'ed25519' | 'policy';
  /** Public fee-paying account identity; never a secret key. */
  readonly account: string;
}

export interface ExtendTTLSigningRequest {
  readonly networkPassphrase: TestnetPassphrase;
  /** Prepared envelope. Adapter must verify network, payer and allowed operations. */
  readonly transactionXdr: string;
}

/**
 * Resolved per payer. Signs only; never submits or exposes a key.
 * Adapter must reject non-extendTTL operations and unauthorized fees/payers.
 * This interface is NOT a security boundary; real adapters are validated in W3.
 */
export interface Signer {
  readonly payer: PayerId;
  readonly identity: SignerIdentity;
  signExtendTTL(request: ExtendTTLSigningRequest): Promise<string>;
}

interface BumpAttempt extends EntryDecision {
  readonly payer: PayerId;
  readonly extendToLedgers: number;
  /** ISO 8601 event timestamp; unlike TTL, history events do use wall-clock time. */
  readonly recordedAt: string;
  readonly before: { readonly observedAtLedger: number; readonly endsAtLedger: number };
}

export type BumpRecord = BumpAttempt &
  (
    | {
        readonly outcome: 'simulated';
        readonly mode: 'dry-run';
        /** Resolved identity if available; simulation does not prove signing occurred. */
        readonly signer?: SignerIdentity;
        readonly transactionHash?: never;
        readonly after?: never;
      }
    | {
        /** Submitted or awaiting confirmation; never treated as successful yet. */
        readonly outcome: 'submitted';
        readonly mode: 'live';
        readonly signer: SignerIdentity;
        readonly transactionHash: string;
        readonly after?: never;
      }
    | {
        /** Confirmed transaction AND a verified post-bump TTL observation. */
        readonly outcome: 'succeeded';
        readonly mode: 'live';
        readonly signer: SignerIdentity;
        readonly transactionHash: string;
        readonly after: { readonly observedAtLedger: number; readonly endsAtLedger: number };
        readonly paidFeeStroops?: Stroops;
      }
    | ({
        readonly outcome: 'failed';
        /** Omit when failure prevented signer resolution; retain any known identity. */
        readonly signer?: SignerIdentity;
        readonly after?: never;
        readonly error: { readonly code: string; readonly message: string };
      } & (
        | { readonly mode: 'dry-run'; readonly transactionHash?: never }
        | {
            readonly mode: 'live';
            /** Optional: failures before submission have no transaction hash. */
            readonly transactionHash?: string;
          }
      ))
  );

/** Transport implemented later; channel owns its private destination configuration. */
export interface NotificationChannel {
  readonly name: string;
  notify(record: BumpRecord): Promise<void>;
}

export interface BumpThresholds {
  readonly bumpWhenRemainingLedgersBelow: number;
  readonly extendToLedgers: number;
}

export type PayerConfig =
  | { readonly signer: 'ed25519'; readonly secretEnvVar: string }
  | {
      readonly signer: 'policy';
      /** Opaque adapter configuration reference; provider-specific setup is W3. */
      readonly signerRef: string;
    };

export interface EvergreenConfig {
  readonly network: { readonly rpcUrl: string; readonly networkPassphrase: TestnetPassphrase };
  /** Runtime loader must default omission to dry-run; live requires explicit opt-in. */
  readonly mode?: ExecutionMode;
  readonly defaults: BumpThresholds;
  readonly contracts: readonly (ContractRef & {
    readonly payer: PayerId;
    readonly thresholds?: Partial<BumpThresholds>;
    /**
     * Explicit known data keys for this contract. Additive, optional, and
     * carried so a caller's coverage scope survives config round-tripping —
     * ADR-006 makes coverage part of the health answer, and a config that
     * silently dropped it would downgrade every configured scan to unknown.
     */
    readonly dataKeys?: readonly LedgerKey[];
    /**
     * Caller assertion that this contract has no data keys beyond its
     * instance. **A declaration, never verified emptiness** (ADR-006). Only
     * the contract's author can know it; preserved here rather than re-asserted
     * per run so the claim has one recorded home.
     */
    readonly noDataKeys?: boolean;
  })[];
  /** Validate every contract's payer reference at the input boundary. */
  readonly payers: Readonly<Record<PayerId, PayerConfig>>;
  readonly notifications?: { readonly channel: 'email'; readonly toEnvVar: string };
}
