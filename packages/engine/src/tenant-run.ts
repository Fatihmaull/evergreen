/**
 * Runs each tenant plan through core's read-only engine (PH2-E4-01, plan §3.3).
 *
 * Decide-only: every config is testnet and dry-run, and the payer is a policy reference with no
 * secret. Nothing here signs or submits; the signing path (execution.ts) is untouched. Tenants run
 * one after another; one tenant's failure or timeout never stops the others, and no provider error
 * text reaches the result (it can carry RPC URLs or credentials).
 */
import { runEngine } from '@evergreen-stellar/core';
import type { LedgerEntryReader } from '@evergreen-stellar/core';
import type { BumpDecision, EvergreenConfig } from '@evergreen-stellar/shared-types';
import { checkBudget } from './tenants.js';
import type { BudgetVerdict, TenantItem, TenantPlan } from './tenants.js';
import type { TenantJournal } from './tenant-journal.js';

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const DEFAULT_TENANT_DEADLINE_MS = 20_000;
const PAYER_ALIAS = 'tenant';

export type TenantRunStatus = 'ok' | 'failed' | 'skipped';
export type TenantErrorCode = 'TENANT_SCAN_FAILED' | 'TENANT_TIMEOUT' | 'TENANT_CONFIG_INVALID';

export interface TenantItemResult {
  readonly userId: string;
  readonly contractId: string;
  readonly budget: BudgetVerdict;
}

export interface TenantRunResult {
  readonly payerAccount: string;
  readonly status: TenantRunStatus;
  readonly errorCode?: TenantErrorCode;
  readonly decisions: readonly BumpDecision[];
  readonly items: readonly TenantItemResult[];
}

export interface TenantRunReport {
  readonly runId: string;
  readonly tenants: readonly TenantRunResult[];
  /** Non-fatal problems, e.g. a journal write that failed. Codes only, no provider text. */
  readonly warnings: readonly string[];
}

export interface TenantRunDeps {
  readonly reader: LedgerEntryReader;
  readonly runId: string;
  readonly journal?: TenantJournal;
  readonly tenantDeadlineMs?: number;
  /** Whole-run budget; tenants not started before it passes are marked skipped. */
  readonly runDeadlineMs?: number;
  readonly now?: () => number;
  /**
   * Estimated stroops one job for this item would pull. Core's runEngine does not fill
   * estimatedRentStroops today and has no fee estimate, so the default is undefined and every
   * budget verdict is 'undetermined'.
   */
  readonly estimate?: (item: TenantItem, decisions: readonly BumpDecision[]) => bigint | undefined;
  readonly engine?: (
    reader: LedgerEntryReader,
    config: EvergreenConfig,
  ) => ReturnType<typeof runEngine>;
}

class TenantError extends Error {
  constructor(readonly code: TenantErrorCode) {
    super(code);
  }
}

function toLedgers(v: bigint): number {
  const n = Number(v);
  if (!Number.isSafeInteger(n)) throw new TenantError('TENANT_CONFIG_INVALID');
  return n;
}

function scopeOf(scope: unknown): { dataKeys: readonly string[] } | { noDataKeys: true } {
  if (typeof scope === 'object' && scope !== null) {
    const s = scope as Record<string, unknown>;
    if (s.noDataKeys === true) return { noDataKeys: true };
    if (Array.isArray(s.dataKeys) && s.dataKeys.every((k) => typeof k === 'string' && k !== ''))
      return { dataKeys: s.dataKeys as string[] };
  }
  throw new TenantError('TENANT_CONFIG_INVALID');
}

/**
 * One config per chunk of a tenant's items. A config holds each contract once, so the same
 * contract watched by two users of one payer goes into separate chunks with their own thresholds.
 */
export function tenantConfigs(plan: TenantPlan): EvergreenConfig[] {
  if (plan.network !== 'testnet' || plan.items.length === 0)
    throw new TenantError('TENANT_CONFIG_INVALID');
  const chunks: TenantItem[][] = [];
  for (const item of plan.items) {
    const chunk = chunks.find((c) => !c.some((i) => i.contractId === item.contractId));
    if (chunk) chunk.push(item);
    else chunks.push([item]);
  }
  return chunks.map((items) => {
    const contracts = items.map((item) => ({
      id: item.contractId,
      payer: PAYER_ALIAS,
      thresholds: {
        bumpWhenRemainingLedgersBelow: toLedgers(item.thresholdLedgers),
        extendToLedgers: toLedgers(item.extendToLedgers),
      },
      ...scopeOf(item.scope),
    }));
    return {
      network: { rpcUrl: 'hosted:reader', networkPassphrase: TESTNET_PASSPHRASE },
      mode: 'dry-run',
      defaults: contracts[0]!.thresholds,
      contracts,
      payers: { [PAYER_ALIAS]: { signer: 'policy', signerRef: `hosted:${plan.payerAccount}` } },
    } satisfies EvergreenConfig;
  });
}

function withDeadline<T>(work: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TenantError('TENANT_TIMEOUT')), ms);
  });
  return Promise.race([work, timeout]).finally(() => clearTimeout(timer));
}

async function runOne(plan: TenantPlan, deps: TenantRunDeps): Promise<TenantRunResult> {
  const engine = deps.engine ?? runEngine;
  try {
    const configs = tenantConfigs(plan);
    const decisions = await withDeadline(
      (async () => {
        const out: BumpDecision[] = [];
        for (const config of configs) out.push(...(await engine(deps.reader, config)).decisions);
        return out;
      })(),
      deps.tenantDeadlineMs ?? DEFAULT_TENANT_DEADLINE_MS,
    );
    const items = plan.items.map((item) => ({
      userId: item.userId,
      contractId: item.contractId,
      budget: checkBudget(
        item,
        deps.estimate?.(
          item,
          decisions.filter((d) => d.contracts.includes(item.contractId)),
        ),
      ),
    }));
    return { payerAccount: plan.payerAccount, status: 'ok', decisions, items };
  } catch (err) {
    const errorCode = err instanceof TenantError ? err.code : 'TENANT_SCAN_FAILED';
    return {
      payerAccount: plan.payerAccount,
      status: 'failed',
      errorCode,
      decisions: [],
      items: [],
    };
  }
}

/** Sequential, isolated, read-only. Never throws for a tenant's failure. */
export async function runTenantPlan(
  plans: readonly TenantPlan[],
  deps: TenantRunDeps,
): Promise<TenantRunReport> {
  const now = deps.now ?? Date.now;
  const started = now();
  const tenants: TenantRunResult[] = [];
  const warnings: string[] = [];
  for (const plan of plans) {
    const late = deps.runDeadlineMs !== undefined && now() - started >= deps.runDeadlineMs;
    const result: TenantRunResult = late
      ? { payerAccount: plan.payerAccount, status: 'skipped', decisions: [], items: [] }
      : await runOne(plan, deps);
    tenants.push(result);
    if (deps.journal) {
      try {
        await deps.journal.record({
          runId: deps.runId,
          payerAccount: plan.payerAccount,
          status: result.status,
          ...(result.errorCode ? { errorCode: result.errorCode } : {}),
          at: new Date(now()),
        });
      } catch {
        warnings.push(`TENANT_JOURNAL_FAILED:${plan.payerAccount}`);
      }
    }
  }
  return { runId: deps.runId, tenants, warnings };
}
