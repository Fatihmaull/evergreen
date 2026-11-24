/**
 * The allowance screen's chain side (PH2-E3-05): read the native-XLM SAC
 * allowance a wallet has granted the engine, and revoke it.
 *
 * THE SPENDER IS THE ENGINE'S TESTNET ACCOUNT. `allowance(from, spender)` and
 * `approve(from, spender, amount, liveUntil)` both need the engine's public
 * account. Fatih created it on 2026-11-23 (PH2-E4-03), separate from the
 * treasury, and it is the account the preview scheduler signs as.
 * `ENGINE_SPENDER` below is the ONE place it is configured, and only a testnet
 * build gets it: any other network resolves to `undefined`, and then this
 * module makes no chain call and refuses to build a revoke or an approve. A
 * revoke aimed at the wrong spender would leave the real allowance in place
 * while the screen said it was gone. Never fill it with a spike address.
 *
 * THE CHAIN READ STAYS UNDETERMINED. The chain reads zero (or no entry)
 * after expiry, after a revoke and when none ever existed (#297); only the
 * engine's stored history tells them apart, through `GET
 * /wallets/{account}/allowance` (docs/API.md §7). That route is not served
 * yet. A missing answer stays undetermined. A body that parses as `expired`
 * is shown as stopped, and never as protected (`allowance-status.ts`).
 *
 * Every RPC call goes through `verifiedServer()`; testnet only.
 */
import {
  Account,
  Address,
  Asset,
  BASE_FEE,
  Contract,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';
import { verifiedServer } from './evergreen';
import { NETWORK } from './network';

/**
 * The engine's testnet account (Fatih, 2026-11-23, PH2-E4-03). A public key,
 * not a secret: the scheduler holds the matching `ENGINE_SECRET`.
 */
export const TESTNET_ENGINE_SPENDER = 'GBNCEF5FV44CFHVFGJKRG7SK3QPJYFI34J7PPRHBCHWZYCU5VCOCJ6AM';

/**
 * The allowance's spender for this build. Testnet only until DoD-2: any other
 * network has no published engine account, so it is unset there. This is the
 * single configuration point; nothing else in `apps/web` names a spender.
 */
export const ENGINE_SPENDER: string | undefined =
  NETWORK.name === 'testnet' ? TESTNET_ENGINE_SPENDER : undefined;

/**
 * The spender a caller asked for. A caller that passes `spender` at all, even
 * as `undefined`, gets exactly that; only a caller that leaves it out gets
 * `ENGINE_SPENDER`. Tests use the explicit `undefined` to exercise the unset path.
 */
export function spenderFrom(options: {
  readonly spender?: string | undefined;
}): string | undefined {
  return Object.prototype.hasOwnProperty.call(options, 'spender')
    ? options.spender
    : ENGINE_SPENDER;
}

/** The native XLM SAC on the network this build is for, derived, never typed. */
export function nativeSac(): string {
  return Asset.native().contractId(NETWORK.passphrase);
}

/** What the chain says right now, unjoined with any history. */
export type RawAllowance = {
  /** Whole stroops as read; "0" when the entry is absent. */
  amountStroops: string;
  /** The entry's `live_until_ledger`, or null when there is no entry. */
  liveUntilLedger: number | null;
  /** The ledger the read was taken at. */
  observedAtLedger: number;
};

export type ReadResult =
  | { kind: 'spender-unset' }
  | { kind: 'read'; spender: string; raw: RawAllowance }
  | { kind: 'read-failed'; detail: string };

/** The chain calls the allowance read and the revoke build make, so tests can stand in. */
export interface AllowanceChain {
  readAllowance(from: string, spender: string): Promise<RawAllowance>;
  /** An unprepared `approve(from, spender, 0, 0)` with `from` as the source. */
  buildRevoke(from: string, spender: string): Promise<string>;
  /**
   * An unprepared `approve(from, spender, amount, liveUntil)` with `from` as
   * the source. Amount must be a positive number of stroops: zero is a revoke
   * and goes through `buildRevoke`, not here.
   */
  buildApprove(
    from: string,
    spender: string,
    amountStroops: bigint,
    liveUntilLedger: number,
  ): Promise<string>;
}

/**
 * The arguments of a grant `approve`. Refuses zero and a non-u32 ledger, so
 * the grant path cannot build the revoke and cannot build an expiry the
 * protocol will not accept as a u32. The protocol ceiling (`current +
 * 3,110,399`) is `refusalForApprove`'s job: it needs the ledger the read was
 * taken at, which this function does not have.
 */
export function approveScVals(
  amountStroops: bigint,
  liveUntilLedger: number,
): { readonly amount: bigint; readonly liveUntil: number } {
  if (amountStroops <= 0n) {
    throw new RangeError('a grant approve must move a positive number of stroops');
  }
  if (!Number.isInteger(liveUntilLedger) || liveUntilLedger < 0 || liveUntilLedger > 0xffff_ffff) {
    throw new RangeError('live_until_ledger must be a u32');
  }
  return { amount: amountStroops, liveUntil: liveUntilLedger };
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function readAllowance(
  from: string,
  options: { spender?: string | undefined; chain?: AllowanceChain } = {},
): Promise<ReadResult> {
  const spender = spenderFrom(options);
  const { chain } = options;
  if (spender === undefined) return { kind: 'spender-unset' };
  try {
    return {
      kind: 'read',
      spender,
      raw: await (chain ?? rpcAllowanceChain()).readAllowance(from, spender),
    };
  } catch (error) {
    return { kind: 'read-failed', detail: message(error) };
  }
}

/** The SAC's storage key, `DataKey::Allowance(AllowanceDataKey { from, spender })`, temporary. */
export function allowanceKey(from: string, spender: string): xdr.LedgerKey {
  return xdr.LedgerKey.contractData(
    new xdr.LedgerKeyContractData({
      contract: new Address(nativeSac()).toScAddress(),
      key: xdr.ScVal.scvVec([
        xdr.ScVal.scvSymbol('Allowance'),
        xdr.ScVal.scvMap([
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('from'),
            val: new Address(from).toScVal(),
          }),
          new xdr.ScMapEntry({
            key: xdr.ScVal.scvSymbol('spender'),
            val: new Address(spender).toScVal(),
          }),
        ]),
      ]),
      durability: xdr.ContractDataDurability.temporary,
    }),
  );
}

/**
 * The stored value of a SAC allowance entry. The built-in Stellar Asset
 * Contract stores `AllowanceValue { amount, live_until_ledger }`; the field was
 * `expiration_ledger` in pre-release protocol-20 hosts and in token examples,
 * so that spelling is read too. Fatih's first approve on testnet (2026-11-23,
 * ledger 5,883,380) read the amount and no expiry because only
 * `expiration_ledger` was read here.
 *
 * An entry with neither field is not "no entry": it throws, so the read is
 * undetermined rather than a claim about the expiry.
 */
export function allowanceValue(val: xdr.ScVal): {
  amountStroops: string;
  liveUntilLedger: number;
} {
  const value = scValToNative(val) as Record<string, unknown> | null;
  if (value === null || typeof value !== 'object') {
    throw new Error('the allowance entry is not a map');
  }
  const amount = value.amount;
  const until = value.live_until_ledger ?? value.expiration_ledger;
  if (typeof amount !== 'bigint' || typeof until !== 'number' || !Number.isInteger(until)) {
    throw new Error(
      `the allowance entry has an unexpected shape (fields: ${Object.keys(value).join(', ') || 'none'})`,
    );
  }
  return { amountStroops: amount.toString(), liveUntilLedger: until };
}

/** The real chain, through `verifiedServer()` only. */
export function rpcAllowanceChain(): AllowanceChain {
  return {
    async readAllowance(from, spender) {
      const server = await verifiedServer();
      const r = await server.getLedgerEntries(allowanceKey(from, spender));
      const entry = r.entries[0];
      if (entry === undefined) {
        return { amountStroops: '0', liveUntilLedger: null, observedAtLedger: r.latestLedger };
      }
      if (entry.val.type !== 'contractData') {
        throw new Error(`unexpected ledger entry type ${entry.val.type}`);
      }
      return { ...allowanceValue(entry.val.contractData.val), observedAtLedger: r.latestLedger };
    },
    async buildRevoke(from, spender) {
      const server = await verifiedServer();
      const source = await server.getAccount(from);
      return new TransactionBuilder(new Account(from, source.sequenceNumber()), {
        fee: BASE_FEE,
        networkPassphrase: NETWORK.passphrase,
      })
        .addOperation(
          new Contract(nativeSac()).call(
            'approve',
            new Address(from).toScVal(),
            new Address(spender).toScVal(),
            nativeToScVal(0n, { type: 'i128' }),
            nativeToScVal(0, { type: 'u32' }),
          ),
        )
        .setTimeout(300)
        .build()
        .toXDR();
    },
    async buildApprove(from, spender, amountStroops, liveUntilLedger) {
      const terms = approveScVals(amountStroops, liveUntilLedger);
      const server = await verifiedServer();
      const source = await server.getAccount(from);
      return new TransactionBuilder(new Account(from, source.sequenceNumber()), {
        fee: BASE_FEE,
        networkPassphrase: NETWORK.passphrase,
      })
        .addOperation(
          new Contract(nativeSac()).call(
            'approve',
            new Address(from).toScVal(),
            new Address(spender).toScVal(),
            nativeToScVal(terms.amount, { type: 'i128' }),
            nativeToScVal(terms.liveUntil, { type: 'u32' }),
          ),
        )
        .setTimeout(300)
        .build()
        .toXDR();
    },
  };
}
