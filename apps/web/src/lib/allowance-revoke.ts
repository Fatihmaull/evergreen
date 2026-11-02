/**
 * Revoke: `approve(from, spender, 0, 0)` (#297 §3: refused afterwards,
 * `allowance()` reads "0"), signed by the user's wallet and submitted through
 * `wallet-money.ts` `signAndSubmit`, the one money path.
 *
 * NEVER TWICE. Once a revoke may have reached the network — `possibly-signed`,
 * `pending`, `submit-failed` (a thrown send cannot prove the network did not
 * take it), `failed-on-chain`, or success — the revoker locks and will not
 * build another until the page is reloaded and the allowance read again.
 * Only outcomes where nothing can have been sent leave it open: the user
 * saying no (`rejected`, kept apart from every failure), a wallet that is not
 * ready, a failed simulation or a required restore, and a build that failed.
 */
import { ENGINE_SPENDER, rpcAllowanceChain, type AllowanceChain } from './allowance';
import type { Wallet } from './wallet';
import { signAndSubmit, type ChainPort, type MoneyResult } from './wallet-money';

export type RevokeOutcome =
  | MoneyResult
  | { kind: 'spender-unset' }
  | { kind: 'build-failed'; detail: string }
  | { kind: 'already-sent' }; // an earlier revoke may have reached the network

/** Kinds after which nothing can have been sent, so asking again is safe. */
const NOTHING_SENT: ReadonlySet<string> = new Set<string>([
  'spender-unset',
  'build-failed',
  'simulation-failed',
  'restore-required',
  'rejected',
  'not-installed',
  'locked',
  'not-connected',
  'wrong-network',
  'account-mismatch',
  'unavailable',
]);

export function mayHaveSent(outcome: RevokeOutcome): boolean {
  return !('kind' in outcome) || !NOTHING_SENT.has(outcome.kind);
}

export interface RevokerDeps {
  wallet: Wallet;
  spender?: string;
  allowanceChain?: AllowanceChain;
  /** Test seam for `signAndSubmit`'s chain; the site always uses the real one. */
  moneyChain?: ChainPort;
  sleep?: (ms: number) => Promise<void>;
}

export interface Revoker {
  /** True once a revoke may have reached the network; never reset on this page. */
  readonly locked: boolean;
  /** A spender is configured, nothing is in flight and nothing may have been sent. */
  readonly available: boolean;
  revoke(from: string): Promise<RevokeOutcome>;
}

export function createRevoker({
  wallet,
  spender = ENGINE_SPENDER,
  allowanceChain,
  moneyChain,
  sleep,
}: RevokerDeps): Revoker {
  let busy = false;
  let locked = false;
  return {
    get locked() {
      return locked;
    },
    get available() {
      return spender !== undefined && !locked && !busy;
    },
    async revoke(from: string): Promise<RevokeOutcome> {
      if (spender === undefined) return { kind: 'spender-unset' };
      if (locked || busy) return { kind: 'already-sent' };
      busy = true;
      try {
        let built: string;
        try {
          built = await (allowanceChain ?? rpcAllowanceChain()).buildRevoke(from, spender);
        } catch (error) {
          return {
            kind: 'build-failed',
            detail: error instanceof Error ? error.message : String(error),
          };
        }
        const outcome = await signAndSubmit(wallet, built, from, {
          ...(moneyChain ? { chain: moneyChain } : {}),
          ...(sleep ? { sleep } : {}),
        });
        if (mayHaveSent(outcome)) locked = true;
        return outcome;
      } finally {
        busy = false;
      }
    },
  };
}
