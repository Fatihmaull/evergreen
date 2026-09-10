import {
  Account,
  Keypair,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import type { LedgerKey, Stroops } from '@evergreen-stellar/shared-types';
import type { RentQuote, RentQuoter } from './rent.js';

/**
 * The production `RentQuoter`: it asks the chain what an extend would cost
 * (`W2-D9-01`).
 *
 * **Simulation, never a local formula.** `simulateTransaction` prices a real
 * `ExtendFootprintTTLOp` against live network config. Reimplementing Soroban's
 * rent arithmetic here would mean inventing a mechanism, and the fee fixture is
 * explicit that our three measurements do not determine one — an earlier
 * reading got the right number from the wrong mechanism, which is worse than
 * no mechanism because it survives casual checking.
 *
 * **This never submits anything.** `simulateTransaction` is a read: no
 * signature, no sequence consumed, no chain state touched. The source account
 * is used for its public key only, which is why an unfunded or read-only
 * identity works.
 */

/** `minResourceFee` bundles rent with a small non-refundable component. */
export interface QuoteBreakdown extends RentQuote {
  /** What simulation said the whole resource fee would be. */
  readonly minResourceFeeStroops: Stroops;
  /** The fixed cost that was cancelled out. Reported so the subtraction is visible. */
  readonly baselineFeeStroops: Stroops;
}

export interface SimulatingQuoterOptions {
  /**
   * Optional. Simulation does not sign, does not consume a sequence number,
   * and — verified 2026-09-10 — **does not require the account to exist on
   * chain**: a freshly generated, never-funded key prices identically.
   *
   * So this defaults to a random synthetic key rather than a real identity.
   * The earlier version hardcoded our own testnet account, which a bundle
   * inspection found baked into the publishable artifact: not a secret, but it
   * put our account in every user's traffic and would have broken `--cost` for
   * everyone the day that account went away.
   */
  readonly sourceAccountId?: string;
  readonly networkPassphrase: string;
}

/**
 * A target any live entry already satisfies, so simulating it prices the
 * operation's FIXED cost with zero rent in it.
 */
const NO_OP_TARGET = 1;

export function createSimulatingQuoter(
  server: rpc.Server,
  options: SimulatingQuoterOptions,
): RentQuoter & {
  quoteDetailed(args: {
    entryKeys: readonly LedgerKey[];
    extendToLedgers: number;
  }): Promise<readonly QuoteBreakdown[]>;
} {
  // ⚠️ SEAM: this is the QUOTING path. SUBMISSION is different and must stay
  // different.
  //
  // A simulation is never submitted, so its source account is a formality the
  // simulator does not check — verified 2026-09-10, a freshly generated key
  // prices identically to a real one. That is why the hardcoded account could
  // be deleted, and why no `getAccount` round trip happens here.
  //
  // **A real `extendTTL` needs a real account with its real sequence number.**
  // The submit path (`W2-D11-01`) must resolve one and must NOT be simplified
  // to match this function, however much the inconsistency looks like an
  // oversight. Doing so builds a transaction against sequence 0, which is
  // rejected — with an error about sequence numbers that nobody will connect
  // to a bundle-hygiene change made the day before.
  // One synthetic identity per quoter. Never signs, never funded, never fetched.
  const sourceAccountId = options.sourceAccountId ?? Keypair.random().publicKey();

  async function simulateFee(entryKey: LedgerKey, extendTo: number): Promise<bigint> {
    // Sequence number is irrelevant to a simulation that is never submitted, so
    // this skips a `getAccount` round trip per quote as well.
    const source = new Account(sourceAccountId, '0');
    const sorobanData = new SorobanDataBuilder()
      .setReadOnly([xdr.LedgerKey.fromXDR(entryKey, 'base64')])
      .build();
    const tx = new TransactionBuilder(source, {
      fee: '100',
      networkPassphrase: options.networkPassphrase,
    })
      .addOperation(Operation.extendFootprintTtl({ extendTo }))
      .setSorobanData(sorobanData)
      .setTimeout(30)
      .build();

    const simulated = await server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(simulated)) {
      throw new Error(`Simulation refused to price this entry: ${simulated.error}`);
    }
    return BigInt(simulated.minResourceFee ?? '0');
  }

  /**
   * Rent is the DIFFERENCE between two simulations of the same operation.
   *
   * `extendTo` is a target remaining TTL, not a delta — verified against the
   * chain 2026-09-10, where targets at or below an entry's current remaining
   * priced identically and only targets above it scaled. So simulating a
   * target the entry already satisfies gives the operation's fixed cost with
   * no rent in it, and subtracting that isolates rent EXACTLY.
   *
   * The earlier version subtracted a measured non-refundable constant instead,
   * and reported 9,349 stroops of "rent" for an extend that needed none. A
   * constant that is right for the transactions it was measured on is still a
   * fitted number — the same trap the fee fixture warns about. This needs no
   * constant at all: the fixed cost cancels, whatever it currently is.
   */
  async function quoteOne(entryKey: LedgerKey, extendToLedgers: number): Promise<QuoteBreakdown> {
    const baseline = await simulateFee(entryKey, NO_OP_TARGET);
    const atTarget = await simulateFee(entryKey, extendToLedgers);
    const rent = atTarget > baseline ? atTarget - baseline : 0n;
    return {
      entryKey,
      estimatedRentStroops: rent.toString() as Stroops,
      minResourceFeeStroops: atTarget.toString() as Stroops,
      baselineFeeStroops: baseline.toString() as Stroops,
    };
  }

  async function quoteDetailed(args: {
    entryKeys: readonly LedgerKey[];
    extendToLedgers: number;
  }): Promise<readonly QuoteBreakdown[]> {
    const out: QuoteBreakdown[] = [];
    // Sequential: each key is priced against its own footprint, and a batched
    // simulation would return one blended fee that cannot be attributed back.
    for (const entryKey of args.entryKeys) {
      out.push(await quoteOne(entryKey, args.extendToLedgers));
    }
    return out;
  }

  return {
    quoteDetailed,
    quote: (args) => quoteDetailed(args),
  };
}
