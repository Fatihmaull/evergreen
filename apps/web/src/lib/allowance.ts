/**
 * The allowance screen's chain side (PH2-E3-05): read the native-XLM SAC
 * allowance a wallet has granted the engine, and revoke it.
 *
 * THE SPENDER IS NOT PUBLISHED YET. `allowance(from, spender)` and
 * `approve(from, spender, 0, 0)` both need the engine's public account, and it
 * comes from the engine key work (PH2-E4-01, PH2-E4-03), which has not
 * published one (Rakha, 2026-10-31). `ENGINE_SPENDER` below is the ONE place it
 * is configured, and it stays `undefined` until CER publishes it. While it is
 * unset this module makes no chain call at all and refuses to build a revoke:
 * a revoke aimed at the wrong spender would leave the real allowance in place
 * while the screen said it was gone. Never fill it with a spike address.
 *
 * STATUS IS ALWAYS UNDETERMINED FOR NOW. The chain reads zero (or no entry)
 * after expiry, after a revoke and when none ever existed (#297); only the
 * engine's stored history tells them apart, through `GET
 * /wallets/{account}/allowance` (docs/API.md §7), which is not implemented
 * yet. So the screen shows the raw read and never says revoked, none or
 * expired from it (Rakha, 2026-10-31).
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
 * The engine's public account, the allowance's spender. UNSET until the engine
 * key work (PH2-E4-01 / PH2-E4-03) publishes it. This is the single
 * configuration point; nothing else in `apps/web` names a spender.
 */
export const ENGINE_SPENDER: string | undefined = undefined;

/** The native XLM SAC on the network this build is for, derived, never typed. */
export function nativeSac(): string {
  return Asset.native().contractId(NETWORK.passphrase);
}

/** What the chain says right now, unjoined with any history. */
export type RawAllowance = {
  /** Whole stroops as read; "0" when the entry is absent. */
  amountStroops: string;
  /** The entry's `expiration_ledger`, or null when there is no entry. */
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
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

export async function readAllowance(
  from: string,
  { spender = ENGINE_SPENDER, chain }: { spender?: string; chain?: AllowanceChain } = {},
): Promise<ReadResult> {
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
      const value = scValToNative(entry.val.contractData.val) as {
        amount?: bigint;
        expiration_ledger?: number;
      };
      return {
        amountStroops: String(value.amount ?? 0n),
        liveUntilLedger:
          typeof value.expiration_ledger === 'number' ? value.expiration_ledger : null,
        observedAtLedger: r.latestLedger,
      };
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
  };
}
