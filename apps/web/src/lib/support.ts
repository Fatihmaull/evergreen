/**
 * "Support Evergreen" (PH2-E3-07): a payment of an amount the user chooses,
 * from their own wallet to Evergreen's treasury address (PHASE2-PLAN §3.3).
 *
 * THE TREASURY ADDRESS IS NOT SET. It comes from the key-separation work
 * (PH2-E4-03), which is not done, and #381 still asks whether the testnet
 * treasury recorded there is final. `TREASURY_ADDRESS` below is the ONE place it
 * is configured, and it stays `undefined` until that is decided. While it is
 * unset this module builds nothing and asks no wallet to sign. Never fill it
 * from a spike or a guess: a tip sent to the wrong address is gone.
 *
 * OPT-IN ONLY. Nothing here has a default amount; the user types one. A tip is
 * its own transaction and is never bundled with another action.
 *
 * The payment is the native XLM SAC's `transfer(from, to, amount)`, so it goes
 * through `wallet-money.ts` `signAndSubmit` (simulate, sign, submit, read back),
 * the one money path. Every RPC call goes through `verifiedServer()`; testnet only.
 */
import {
  Account,
  Address,
  BASE_FEE,
  Contract,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
} from '@stellar/stellar-sdk';
import { verifiedServer } from './evergreen';
import { NETWORK } from './network';
import { nativeSac } from './allowance';
import type { Wallet } from './wallet';
import { signAndSubmit, type ChainPort, type MoneyResult } from './wallet-money';

/**
 * Evergreen's treasury, the tip's destination. UNSET until PH2-E4-03 publishes
 * it (#381). This is the single configuration point.
 */
export const TREASURY_ADDRESS: string | undefined = undefined;

const STROOPS_PER_XLM = 10_000_000n;

export type AmountParse = { ok: true; stroops: bigint } | { ok: false; reason: string };

/**
 * An amount the user typed, in XLM, as whole stroops. Exact: at most seven
 * decimals, no rounding, no exponent, no sign, never zero.
 */
export function parseXlmAmount(input: string): AmountParse {
  const text = input.trim();
  if (text === '') return { ok: false, reason: 'Enter an amount in XLM.' };
  const m = /^(\d+)(?:\.(\d+))?$/.exec(text);
  if (m === null)
    return { ok: false, reason: 'Use digits and at most one decimal point, e.g. 5 or 2.5.' };
  const frac = m[2] ?? '';
  if (frac.length > 7) return { ok: false, reason: 'XLM has at most 7 decimal places.' };
  const stroops = BigInt(m[1] ?? '0') * STROOPS_PER_XLM + BigInt(frac.padEnd(7, '0') || '0');
  if (stroops === 0n) return { ok: false, reason: 'The amount must be more than zero.' };
  // i128 holds far more than exists; a cap here only rejects nonsense input.
  if (stroops > 2n ** 63n - 1n) return { ok: false, reason: 'That amount is too large.' };
  return { ok: true, stroops };
}

/** The chain call the tip build makes, so tests can stand in. */
export interface SupportChain {
  /** An unprepared SAC `transfer(from, to, amount)` with `from` as the source. */
  buildTip(from: string, to: string, stroops: bigint): Promise<string>;
}

export function rpcSupportChain(): SupportChain {
  return {
    async buildTip(from, to, stroops) {
      const server = await verifiedServer();
      const source = await server.getAccount(from);
      return new TransactionBuilder(new Account(from, source.sequenceNumber()), {
        fee: BASE_FEE,
        networkPassphrase: NETWORK.passphrase,
      })
        .addOperation(
          new Contract(nativeSac()).call(
            'transfer',
            new Address(from).toScVal(),
            new Address(to).toScVal(),
            nativeToScVal(stroops, { type: 'i128' }),
          ),
        )
        .setTimeout(300)
        .build()
        .toXDR();
    },
  };
}

export type TipOutcome =
  | MoneyResult
  | { kind: 'treasury-unset' }
  | { kind: 'invalid-amount'; reason: string }
  | { kind: 'self-payment' }
  | { kind: 'build-failed'; detail: string }
  | { kind: 'already-sent' };

/** Kinds after which nothing can have been sent, so asking again is safe. */
const NOTHING_SENT: ReadonlySet<string> = new Set<string>([
  'treasury-unset',
  'invalid-amount',
  'self-payment',
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

export function tipMayHaveSent(outcome: TipOutcome): boolean {
  return !('kind' in outcome) || !NOTHING_SENT.has(outcome.kind);
}

export interface TipperDeps {
  wallet: Wallet;
  treasury?: string;
  supportChain?: SupportChain;
  /** Test seam for `signAndSubmit`'s chain; the site always uses the real one. */
  moneyChain?: ChainPort;
  sleep?: (ms: number) => Promise<void>;
}

export interface Tipper {
  /** True once a tip may have reached the network; never reset on this page. */
  readonly locked: boolean;
  /** A treasury is configured, nothing is in flight and nothing may have been sent. */
  readonly available: boolean;
  send(from: string, amountInput: string): Promise<TipOutcome>;
}

/**
 * NEVER TWICE. Once a tip may have reached the network (success, `pending`,
 * `possibly-signed`, `submit-failed`, `failed-on-chain`) the tipper locks until
 * the page is reloaded, so a double click or a retry cannot pay twice.
 */
export function createTipper({
  wallet,
  treasury = TREASURY_ADDRESS,
  supportChain,
  moneyChain,
  sleep,
}: TipperDeps): Tipper {
  let busy = false;
  let locked = false;
  return {
    get locked() {
      return locked;
    },
    get available() {
      return treasury !== undefined && !locked && !busy;
    },
    async send(from, amountInput) {
      if (treasury === undefined) return { kind: 'treasury-unset' };
      if (locked || busy) return { kind: 'already-sent' };
      if (!StrKey.isValidEd25519PublicKey(treasury)) {
        return {
          kind: 'build-failed',
          detail: 'the configured treasury is not an account address',
        };
      }
      if (from === treasury) return { kind: 'self-payment' };
      const amount = parseXlmAmount(amountInput);
      if (!amount.ok) return { kind: 'invalid-amount', reason: amount.reason };
      busy = true;
      try {
        let built: string;
        try {
          built = await (supportChain ?? rpcSupportChain()).buildTip(
            from,
            treasury,
            amount.stroops,
          );
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
        if (tipMayHaveSent(outcome)) locked = true;
        return outcome;
      } finally {
        busy = false;
      }
    },
  };
}
