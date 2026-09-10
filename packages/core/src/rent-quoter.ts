import {
  Account,
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
  /** Public key only. Never a secret — simulation does not sign. */
  readonly sourceAccountId: string;
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
  async function simulateFee(entryKey: LedgerKey, extendTo: number): Promise<bigint> {
    const account = await server.getAccount(options.sourceAccountId);
    const source = new Account(account.accountId(), account.sequenceNumber());
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
