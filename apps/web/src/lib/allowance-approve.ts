/**
 * Approve: one `approve(from, spender, amount, liveUntil)`, signed by the
 * user's wallet and submitted through `wallet-money.ts` `signAndSubmit`.
 *
 * A new approve replaces the cap. It does not add to it. Zero is not an
 * amount this path will build — that is the revoke, and it has its own function.
 *
 * The chain is read again immediately before anything is built. If that read
 * is not the amount the disclosure showed, nothing is signed: the sentence
 * "this replaces the current cap" is only true of the cap that was just read.
 *
 * NEVER TWICE. The same lock as the revoker: once an approve may have reached
 * the network, this page will not build another until it is reloaded.
 */
import { rpcAllowanceChain, spenderFrom, type AllowanceChain } from './allowance';
import { refusalForApprove, type ApproveRefusal } from './allowance-cap';
import type { Wallet } from './wallet';
import { signAndSubmit, type ChainPort, type MoneyResult } from './wallet-money';

export interface ApproveTerms {
  readonly amountStroops: bigint | undefined;
  readonly liveUntilLedger: number;
  readonly observedAtLedger: number;
  /** The amount the disclosure said the chain currently holds, whole stroops. */
  readonly shownCurrentStroops: string;
}

export type ApproveOutcome =
  | MoneyResult
  | { readonly kind: ApproveRefusal }
  | { readonly kind: 'build-failed'; readonly detail: string }
  | { readonly kind: 'read-failed'; readonly detail: string }
  | { readonly kind: 'stale-read'; readonly currentStroops: string }
  | { readonly kind: 'already-sent' };

const NOTHING_SENT: ReadonlySet<string> = new Set<string>([
  'spender-unset',
  'cap-undetermined',
  'amount-not-positive',
  'expiry-not-after-read',
  'expiry-too-far',
  'build-failed',
  'read-failed',
  'stale-read',
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

export function approveMayHaveSent(outcome: ApproveOutcome): boolean {
  return !('kind' in outcome) || !NOTHING_SENT.has(outcome.kind);
}

export interface ApproverDeps {
  wallet: Wallet;
  spender?: string | undefined;
  allowanceChain?: AllowanceChain;
  moneyChain?: ChainPort;
  sleep?: (ms: number) => Promise<void>;
}

export interface Approver {
  readonly locked: boolean;
  /** A spender is configured, nothing is in flight and nothing may have been sent. */
  readonly available: boolean;
  approve(from: string, terms: ApproveTerms): Promise<ApproveOutcome>;
}

export function createApprover(deps: ApproverDeps): Approver {
  const { wallet, allowanceChain, moneyChain, sleep } = deps;
  const spender = spenderFrom(deps);
  let busy = false;
  let locked = false;
  const chain = () => allowanceChain ?? rpcAllowanceChain();
  return {
    get locked() {
      return locked;
    },
    get available() {
      return spender !== undefined && !locked && !busy;
    },
    async approve(from, terms): Promise<ApproveOutcome> {
      const refusal = refusalForApprove({
        spender,
        amountStroops: terms.amountStroops,
        liveUntilLedger: terms.liveUntilLedger,
        observedAtLedger: terms.observedAtLedger,
      });
      if (refusal !== undefined) return { kind: refusal };
      if (spender === undefined || terms.amountStroops === undefined) {
        return { kind: spender === undefined ? 'spender-unset' : 'cap-undetermined' };
      }
      const who = spender;
      const amount = terms.amountStroops;
      if (locked || busy) return { kind: 'already-sent' };
      busy = true;
      try {
        let current;
        try {
          current = await chain().readAllowance(from, who);
        } catch (error) {
          return {
            kind: 'read-failed',
            detail: error instanceof Error ? error.message : String(error),
          };
        }
        if (current.amountStroops !== terms.shownCurrentStroops) {
          return { kind: 'stale-read', currentStroops: current.amountStroops };
        }
        let built: string;
        try {
          built = await chain().buildApprove(from, who, amount, terms.liveUntilLedger);
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
        if (approveMayHaveSent(outcome)) locked = true;
        return outcome;
      } finally {
        busy = false;
      }
    },
  };
}
