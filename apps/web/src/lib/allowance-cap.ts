/**
 * Cap sizing for /allowance/ (PH2-E3-05).
 *
 * One hosted action is one extend of one contract. The fee is
 * `hostedFeeStroops` of that action's rent, so the minimum binds once per
 * action and not once across the horizon. The pull for one action is
 * `pullAmountStroops` — rent, plus that fee, plus the retry margin — which is
 * the sum the engine pulls. The cap is that pull times the number of actions,
 * summed over the contracts named here.
 *
 * The retry margin is absolute stroops and has no default
 * (`packages/core/src/pull-amount.ts`). While it is unset the allowance amount
 * is undetermined. This module does not invent a percentage to stand in for it.
 *
 * One allowance covers every contract. A per-contract budget is not a cap the
 * chain enforces; `actionFitsBudget` only says whether a budget can pay one
 * pull.
 */
import {
  PROVISIONAL_HOSTED_FEE,
  hostedFeeStroops,
  pullAmountStroops,
  type HostedFeeConfig,
} from '../../../../packages/core/src/index';

/**
 * `current + this` was accepted on testnet; `current + this + 1` was rejected.
 * The #297 spike, at ledger 5,191,523: 8,301,922 accepted, 8,301,923 rejected.
 * Same ceiling as `max_entry_ttl - 1`. This page does not read the network's
 * ConfigSetting, so it will not offer a longer expiry than the one measured.
 */
export const MAX_ALLOWANCE_EXTENSION_LEDGERS = 3_110_399;

/** Days before expiry the renewal reminders are for. The page shows them; it does not send them. */
export const RENEWAL_REMINDER_DAYS = [30, 7, 1] as const;

/**
 * Unset on purpose. The pull's retry margin has no default, and a cap that
 * multiplied it in anyway would be a number this page must not ask anyone to sign.
 */
export const ALLOWANCE_RETRY_MARGIN_STROOPS: bigint | undefined = undefined;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ContractRent {
  /** Simulated rent of one extend, stroops. */
  readonly simulatedRentStroops: bigint;
  /** How many hosted actions (extends) of this contract the cap should cover. */
  readonly hostedActions: bigint;
}

export interface CapLine {
  readonly simulatedRentStroops: bigint;
  readonly hostedActions: bigint;
  readonly perActionRentStroops: bigint;
  readonly perActionFeeStroops: bigint;
  /** Rent across this contract's actions. */
  readonly rentStroops: bigint;
  /** Fee across this contract's actions. The minimum is applied per action, then multiplied. */
  readonly feeStroops: bigint;
}

export interface CapEstimate {
  readonly lines: readonly CapLine[];
  /** Rent across every contract and action. Its own line; never added into the fee on screen. */
  readonly rentStroops: bigint;
  readonly feeStroops: bigint;
  readonly marginStroops: bigint | undefined;
  /**
   * The allowance amount, stroops. Undefined when the margin is unset or no
   * contract was named: there is then no amount to sign.
   */
  readonly amountStroops: bigint | undefined;
}

export function estimateAllowanceCap(
  contracts: readonly ContractRent[],
  retryMarginStroops: bigint | undefined = ALLOWANCE_RETRY_MARGIN_STROOPS,
  config: HostedFeeConfig = PROVISIONAL_HOSTED_FEE,
): CapEstimate {
  if (retryMarginStroops !== undefined && retryMarginStroops < 0n) {
    throw new RangeError('margin cannot be negative');
  }
  const lines: CapLine[] = [];
  let rentStroops = 0n;
  let feeStroops = 0n;
  let amountStroops: bigint | undefined =
    retryMarginStroops === undefined || contracts.length === 0 ? undefined : 0n;
  for (const contract of contracts) {
    if (contract.hostedActions < 1n) throw new RangeError('hosted actions must be at least 1');
    const perActionFee = hostedFeeStroops(contract.simulatedRentStroops, config);
    const line: CapLine = {
      simulatedRentStroops: contract.simulatedRentStroops,
      hostedActions: contract.hostedActions,
      perActionRentStroops: contract.simulatedRentStroops,
      perActionFeeStroops: perActionFee,
      rentStroops: contract.simulatedRentStroops * contract.hostedActions,
      feeStroops: perActionFee * contract.hostedActions,
    };
    lines.push(line);
    rentStroops += line.rentStroops;
    feeStroops += line.feeStroops;
    if (amountStroops !== undefined && retryMarginStroops !== undefined) {
      const pull = pullAmountStroops(
        {
          simulatedRentStroops: contract.simulatedRentStroops,
          retryMarginStroops,
        },
        config,
      );
      if (pull === undefined) throw new Error('a configured margin produced no pull');
      amountStroops += pull.totalStroops * contract.hostedActions;
    }
  }
  return { lines, rentStroops, feeStroops, marginStroops: retryMarginStroops, amountStroops };
}

export type BudgetFit =
  | {
      readonly kind: 'never';
      readonly perActionRentStroops: bigint;
      readonly perActionFeeStroops: bigint;
    }
  | { readonly kind: 'undetermined' }
  | { readonly kind: 'short'; readonly perActionTotalStroops: bigint }
  | { readonly kind: 'covers'; readonly perActionTotalStroops: bigint };

/**
 * Whether one hosted action of this rent can run inside a per-job budget.
 *
 * Below rent + fee it can never run, margin or not. At or above that, and with
 * no margin configured, the answer stays undetermined: the pull is not a number yet.
 */
export function actionFitsBudget(
  perJobMaxStroops: bigint,
  simulatedRentStroops: bigint,
  retryMarginStroops: bigint | undefined,
  config: HostedFeeConfig = PROVISIONAL_HOSTED_FEE,
): BudgetFit {
  if (perJobMaxStroops < 0n) throw new RangeError('budget cannot be negative');
  const fee = hostedFeeStroops(simulatedRentStroops, config);
  if (perJobMaxStroops < simulatedRentStroops + fee) {
    return {
      kind: 'never',
      perActionRentStroops: simulatedRentStroops,
      perActionFeeStroops: fee,
    };
  }
  const pull = pullAmountStroops({ simulatedRentStroops, retryMarginStroops }, config);
  if (pull === undefined) return { kind: 'undetermined' };
  if (perJobMaxStroops < pull.totalStroops) {
    return { kind: 'short', perActionTotalStroops: pull.totalStroops };
  }
  return { kind: 'covers', perActionTotalStroops: pull.totalStroops };
}

export type RentParse =
  | { readonly ok: true; readonly rents: readonly bigint[] }
  | { readonly ok: false; readonly detail: string };

/** One whole number of stroops per line. Blank lines are ignored. Anything else refuses the lot. */
export function parseRentLines(text: string): RentParse {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) {
    return {
      ok: false,
      detail: 'Enter the estimated rent for at least one contract, in stroops.',
    };
  }
  const rents: bigint[] = [];
  for (const line of lines) {
    if (!/^\d+$/.test(line)) {
      return { ok: false, detail: 'Each line must be a whole number of stroops.' };
    }
    rents.push(BigInt(line));
  }
  return { ok: true, rents };
}

/**
 * Blank means the budgets were not given. A non-blank text must be one whole
 * number of stroops per contract, in the same order as the rents. A mismatch
 * refuses the estimate rather than pairing a budget with the wrong contract.
 */
export function parseBudgetLines(
  text: string,
  contractCount: number,
):
  | { readonly ok: true; readonly budgets: readonly bigint[] | undefined }
  | { readonly ok: false; readonly detail: string } {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '');
  if (lines.length === 0) return { ok: true, budgets: undefined };
  if (lines.length !== contractCount) {
    return {
      ok: false,
      detail: 'Enter one per-job budget per contract, in the same order, or leave the field blank.',
    };
  }
  const budgets: bigint[] = [];
  for (const line of lines) {
    if (!/^\d+$/.test(line)) {
      return { ok: false, detail: 'Each budget must be a whole number of stroops.' };
    }
    budgets.push(BigInt(line));
  }
  return { ok: true, budgets };
}

/** A positive integer. Zero, blank and any other text are undefined — not coerced to 1. */
export function parseHostedActions(text: string): bigint | undefined {
  const trimmed = text.trim();
  if (!/^[1-9]\d*$/.test(trimmed)) return undefined;
  return BigInt(trimmed);
}

export function maxLiveUntilLedger(observedAtLedger: number): number {
  if (!Number.isInteger(observedAtLedger) || observedAtLedger < 0) {
    throw new RangeError('observed ledger must be a non-negative integer');
  }
  return observedAtLedger + MAX_ALLOWANCE_EXTENSION_LEDGERS;
}

export type ApproveRefusal =
  | 'spender-unset'
  | 'cap-undetermined'
  | 'amount-not-positive'
  | 'expiry-not-after-read'
  | 'expiry-too-far';

export function refusalForApprove(args: {
  readonly spender: string | undefined;
  readonly amountStroops: bigint | undefined;
  readonly liveUntilLedger: number;
  readonly observedAtLedger: number;
}): ApproveRefusal | undefined {
  if (args.spender === undefined) return 'spender-unset';
  if (args.amountStroops === undefined) return 'cap-undetermined';
  if (args.amountStroops <= 0n) return 'amount-not-positive';
  if (
    !Number.isInteger(args.liveUntilLedger) ||
    !Number.isInteger(args.observedAtLedger) ||
    args.liveUntilLedger <= args.observedAtLedger
  ) {
    return 'expiry-not-after-read';
  }
  if (args.liveUntilLedger > args.observedAtLedger + MAX_ALLOWANCE_EXTENSION_LEDGERS) {
    return 'expiry-too-far';
  }
  return undefined;
}

export function reminderInstants(
  expiry: Date,
): readonly { readonly daysBefore: number; readonly at: Date }[] {
  return RENEWAL_REMINDER_DAYS.map((daysBefore) => ({
    daysBefore,
    at: new Date(expiry.getTime() - daysBefore * DAY_MS),
  }));
}
