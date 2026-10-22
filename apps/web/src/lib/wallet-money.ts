/**
 * The money half of the wallet seam: prepare → sign → submit → read back.
 *
 * `lib/wallet.ts` (WEBF) owns everything that talks to Freighter and never
 * submits. This module owns everything that costs XLM, and the login bundle may
 * not contain it (`LOGIN_FORBIDDEN` in `build.mjs`). The split and the failure
 * types follow Rakha's plan on #327.
 *
 * ONE PASSPHRASE. Signing is always asked for with `NETWORK.passphrase`, and
 * every RPC call goes through `verifiedServer()`, which refuses an endpoint
 * whose `getNetwork()` passphrase is not that one. Testnet only.
 *
 * A SIGNING TIMEOUT IS "POSSIBLY SIGNED". `wallet.ts` returns `timeout` when
 * its deadline passes, but Freighter's prompt stays open and the user can still
 * approve it. This module therefore reports `possibly-signed`, never retries,
 * and tells the screen to read the account's state before offering again.
 *
 * `pending` means the network accepted the transaction and our polling ended
 * before a final status: the outcome is UNDETERMINED, not failed.
 *
 * Whether `prepareTransaction` auto-restores archived entries under protocol
 * 23 (CAP-0066 `archivedEntries`) is undetermined here; a restore the
 * simulation asks for is reported as `restore-required`, not attempted.
 */
import { TransactionBuilder, rpc } from '@stellar/stellar-sdk';
import { verifiedServer } from './evergreen';
import { NETWORK } from './network';
import type { Wallet, WalletFailure } from './wallet';

export type MoneyFailure =
  | { kind: 'simulation-failed'; detail: string }
  | { kind: 'restore-required'; detail: string }
  | { kind: 'possibly-signed' } // the prompt outlived our deadline; do not retry blind
  | { kind: 'submit-failed'; detail: string }
  | { kind: 'failed-on-chain'; hash: string; detail: string }
  | { kind: 'pending'; hash: string }; // accepted, outcome undetermined

export type MoneyResult = { hash: string; ledger: number } | WalletFailure | MoneyFailure;

const MONEY_FAILURE_KINDS: ReadonlySet<string> = new Set<MoneyFailure['kind']>([
  'simulation-failed',
  'restore-required',
  'possibly-signed',
  'submit-failed',
  'failed-on-chain',
  'pending',
]);

export function isMoneyFailure(value: unknown): value is MoneyFailure {
  return (
    typeof value === 'object' &&
    value !== null &&
    MONEY_FAILURE_KINDS.has(String((value as { kind?: unknown }).kind))
  );
}

/** The chain calls this module makes, so tests can stand in for the RPC. */
export interface ChainPort {
  /** Simulate and assemble. Returns the prepared XDR or a failure. */
  prepare(xdr: string): Promise<{ xdr: string } | MoneyFailure>;
  send(signedXdr: string): Promise<{ hash: string } | MoneyFailure>;
  /** One status read; `NOT_FOUND` means not yet in a closed ledger. */
  status(
    hash: string,
  ): Promise<
    | { status: 'SUCCESS'; ledger: number }
    | { status: 'FAILED'; detail: string }
    | { status: 'NOT_FOUND' }
  >;
}

export interface MoneyOptions {
  pollIntervalMs?: number;
  /** How long to read back before answering `pending`. A default, not a measurement. */
  pollTimeoutMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function signAndSubmit(
  wallet: Wallet,
  chain: ChainPort,
  xdr: string,
  address: string,
  { pollIntervalMs = 2_000, pollTimeoutMs = 60_000, sleep = wait }: MoneyOptions = {},
): Promise<MoneyResult> {
  const prepared = await chain.prepare(xdr);
  if ('kind' in prepared) return prepared;

  const signed = await wallet.signTransaction(prepared.xdr, {
    networkPassphrase: NETWORK.passphrase,
    address,
  });
  if ('kind' in signed) return signed.kind === 'timeout' ? { kind: 'possibly-signed' } : signed;

  const sent = await chain.send(signed.signedXdr);
  if ('kind' in sent) return sent;

  for (let waited = 0; ; waited += pollIntervalMs) {
    const s = await chain.status(sent.hash);
    if (s.status === 'SUCCESS') return { hash: sent.hash, ledger: s.ledger };
    if (s.status === 'FAILED')
      return { kind: 'failed-on-chain', hash: sent.hash, detail: s.detail };
    if (waited >= pollTimeoutMs) return { kind: 'pending', hash: sent.hash };
    await sleep(pollIntervalMs);
  }
}

const message = (error: unknown) => (error instanceof Error ? error.message : String(error));

/** The real chain, always through `verifiedServer()`. */
export function rpcChain(serverOf: () => Promise<rpc.Server> = verifiedServer): ChainPort {
  return {
    async prepare(xdr) {
      const server = await serverOf();
      const tx = TransactionBuilder.fromXDR(xdr, NETWORK.passphrase);
      let sim: rpc.Api.SimulateTransactionResponse;
      try {
        sim = await server.simulateTransaction(tx);
      } catch (error) {
        return { kind: 'simulation-failed', detail: message(error) };
      }
      if (rpc.Api.isSimulationError(sim)) return { kind: 'simulation-failed', detail: sim.error };
      if (rpc.Api.isSimulationRestore(sim)) {
        return { kind: 'restore-required', detail: 'simulation returned a restore preamble' };
      }
      return { xdr: rpc.assembleTransaction(tx, sim).build().toXDR() };
    },
    async send(signedXdr) {
      const server = await serverOf();
      try {
        const r = await server.sendTransaction(
          TransactionBuilder.fromXDR(signedXdr, NETWORK.passphrase),
        );
        if (r.status === 'ERROR' || r.status === 'TRY_AGAIN_LATER') {
          return { kind: 'submit-failed', detail: r.status };
        }
        return { hash: r.hash };
      } catch (error) {
        return { kind: 'submit-failed', detail: message(error) };
      }
    },
    async status(hash) {
      const server = await serverOf();
      const r = await server.getTransaction(hash);
      if (r.status === rpc.Api.GetTransactionStatus.SUCCESS) {
        return { status: 'SUCCESS', ledger: r.ledger };
      }
      if (r.status === rpc.Api.GetTransactionStatus.FAILED) {
        return { status: 'FAILED', detail: r.resultXdr.toXDR('base64') };
      }
      return { status: 'NOT_FOUND' };
    },
  };
}
