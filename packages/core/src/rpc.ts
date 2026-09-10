import { Contract, Networks, rpc, xdr } from '@stellar/stellar-sdk';
import type { ContractId, LedgerKey } from '@evergreen-stellar/shared-types';

/**
 * The only place in the system that talks to the network.
 *
 * `LedgerEntryReader` is the seam: `scan` depends on this interface, never on
 * the SDK, so unit tests run against a mock and never touch RPC
 * (`AGENTS.md` hard rule 9).
 */

export interface RawLedgerEntry {
  readonly key: LedgerKey;
  /** Serialized LedgerEntryData. Optional only for legacy TTL-only readers. */
  readonly entryXdr?: string;
  /** Absent for entry types that carry no TTL — never coerce to a number. */
  readonly liveUntilLedgerSeq: number | undefined;
}

export interface LedgerEntryReader {
  /** One round trip: `latestLedger` arrives with the entries, so callers must not fetch it separately. */
  read(keys: readonly LedgerKey[]): Promise<{
    readonly latestLedger: number;
    readonly entries: readonly RawLedgerEntry[];
  }>;
}

export class NotTestnetError extends Error {
  constructor(actual: string) {
    // Hard rule 1. Compare the live passphrase rather than trusting a config
    // label that merely says "testnet".
    super(`Refusing to run: RPC network is "${actual}", not Stellar testnet.`);
    this.name = 'NotTestnetError';
  }
}

/**
 * Is this a well-formed Stellar contract address?
 *
 * Named so callers validate at the input boundary instead of discovering a typo
 * as an RPC issue three layers down. Answers shape only — a well-formed ID for
 * a contract that was never deployed is still well-formed.
 */
export function isValidContractId(contractId: string): boolean {
  try {
    new Contract(contractId);
    return true;
  } catch {
    return false;
  }
}

/** Canonical base64 XDR LedgerKey for a contract's instance entry. */
export function instanceKey(contractId: ContractId): LedgerKey {
  return new Contract(contractId).getFootprint().toXDR('base64');
}

/** Canonical base64 XDR LedgerKey for a contract's Wasm code entry. */
export function codeKey(wasmHash: Uint8Array): LedgerKey {
  return xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash: wasmHash })).toXDR(
    'base64',
  );
}

export function createRpcReader(server: rpc.Server): LedgerEntryReader {
  return {
    async read(keys) {
      const res = await server.getLedgerEntries(
        ...keys.map((k) => xdr.LedgerKey.fromXDR(k, 'base64')),
      );
      return {
        latestLedger: res.latestLedger,
        entries: res.entries.map((e) => ({
          key: e.key.toXDR('base64'),
          entryXdr: e.val.toXDR('base64'),
          liveUntilLedgerSeq: e.liveUntilLedgerSeq,
        })),
      };
    },
  };
}

/** Build a reader, refusing anything that is not testnet. */
export async function connectTestnet(rpcUrl: string): Promise<LedgerEntryReader> {
  const server = new rpc.Server(rpcUrl);
  const { passphrase } = await server.getNetwork();
  if (passphrase !== Networks.TESTNET) throw new NotTestnetError(passphrase);
  return createRpcReader(server);
}
