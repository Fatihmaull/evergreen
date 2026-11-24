/**
 * The scheduler Worker of PH2-E4-04: Stage 0 heartbeat, Stage 1 dry-run evaluation. See
 * docs/PH2-E4-04-SCHEDULER-DESIGN.md and apps/scheduler/README.md.
 */
import {
  NETWORKS,
  createSimulatingQuoter,
  readStateArchivalSettings,
  scanContracts,
} from '@evergreen-stellar/core';
import type { LedgerEntryTTL } from '@evergreen-stellar/shared-types';
import { neon } from '@neondatabase/serverless';
import { rpc as stellarRpc } from '@stellar/stellar-sdk';
import { createFetchReader, scanRequest } from './due.js';
import { createHostedChain } from './hosted-chain.js';
import { parseHostedConfig, runHostedStage } from './hosted-run.js';
import { pgSubmittedStore, type Query } from './hosted-store.js';
import { evaluate } from './evaluate.js';
import { dryRunTenantPlans } from './tenant-dry-run.js';
import { DEFAULT_RPC_TIMEOUT_MS, TickError, runTick } from './tick.js';

/** The dry-run tenant pass may not hold the tick past this (DevOps, 2026-11-23). */
export const TENANT_RUN_DEADLINE_MS = 120_000;
import { handleFetch, handleScheduled, type Env, type Runtime } from './worker.js';

/** The runtime, built lazily so `/health` works with no database configured. */
export function productionRuntime(env: Env): Runtime {
  const databaseUrl = (): string => {
    const url = env.DATABASE_URL;
    if (url === undefined || url === '') throw new TickError('NOT_CONFIGURED');
    return url;
  };
  return {
    log: (entry) => console.log(JSON.stringify(entry)),
    // Stage 1, read-only and dry-run (src/evaluate.ts). Only reached after a recorded heartbeat,
    // so DATABASE_URL is present by then.
    evaluate: async () => {
      const sql = neon(databaseUrl());
      const reader = createFetchReader({
        rpcUrl: env.SOROBAN_RPC_URL ?? NETWORKS.testnet.defaultRpcUrl,
        fetch: (url, init) => fetch(url, init),
        timeoutMs: DEFAULT_RPC_TIMEOUT_MS,
      });
      return evaluate(
        async (text, params) =>
          (await sql.query(text, [...params])) as readonly Record<string, unknown>[],
        // Stage 1b: the same RPC the tick just verified as testnet, same per-read timeout.
        reader,
      );
    },
    // PH2-E4-01: dry-run only. No pull estimate, so checkBudget stays undetermined.
    dryRunTenants: (plans) => {
      const reader = createFetchReader({
        rpcUrl: env.SOROBAN_RPC_URL ?? NETWORKS.testnet.defaultRpcUrl,
        fetch: (url, init) => fetch(url, init),
        timeoutMs: DEFAULT_RPC_TIMEOUT_MS,
      });
      return dryRunTenantPlans(plans, reader, `tick-${Date.now()}`, TENANT_RUN_DEADLINE_MS);
    },
    // Stage 2: the money step. Dry-run unless HOSTED_MODE=live with ENGINE_SECRET (hosted-run.ts).
    hostedJobs: (input) => {
      const config = parseHostedConfig(env);
      const sql = neon(databaseUrl());
      const query: Query = async (text, params) =>
        (await sql.query(text, [...params])) as readonly Record<string, unknown>[];
      const rpcUrl = env.SOROBAN_RPC_URL ?? NETWORKS.testnet.defaultRpcUrl;
      const server = new stellarRpc.Server(rpcUrl);
      const reader = createFetchReader({
        rpcUrl,
        fetch: (url, init) => fetch(url, init),
        timeoutMs: DEFAULT_RPC_TIMEOUT_MS,
      });
      return runHostedStage(input, {
        config,
        query,
        transaction: async (statements) => {
          await sql.transaction(statements.map((s) => sql.query(s.text, [...s.params])));
        },
        chainFor: async (job, item) => {
          const engine = config.engine;
          const request = scanRequest(item);
          if (engine === undefined || request === null) throw new Error('CHAIN_UNAVAILABLE');
          // The entries to extend: every live entry the item watches, read fresh.
          const scan = await scanContracts(reader, [request]);
          const entryKeys = Object.entries(scan.entries)
            .filter(
              ([, e]) =>
                (e as LedgerEntryTTL).contracts.includes(item.contractId) &&
                (e as LedgerEntryTTL).ttl.status === 'known',
            )
            .map(([k]) => k);
          if (entryKeys.length === 0) throw new Error('CHAIN_UNAVAILABLE');
          const settings = await readStateArchivalSettings(server);
          const extendTo = Math.min(Number(item.extendToLedgers), settings.maxEntryTtl - 1);
          const quoter = createSimulatingQuoter(server, {
            sourceAccountId: engine.publicKey(),
            networkPassphrase: NETWORKS.testnet.passphrase,
          });
          return createHostedChain({
            rpc: server,
            engine,
            payerAccount: job.payerAccount,
            entryKeys,
            extendToLedgers: extendTo,
            submitted: pgSubmittedStore(query, job.id),
            quoteRent: async () => {
              const quotes = await quoter.quoteDetailed({ entryKeys, extendToLedgers: extendTo });
              return quotes.reduce((sum, q) => sum + BigInt(q.estimatedRentStroops), 0n);
            },
          });
        },
      });
    },
    runTick: () => {
      const databaseUrl = env.DATABASE_URL;
      if (databaseUrl === undefined || databaseUrl === '') {
        return Promise.reject(new TickError('NOT_CONFIGURED'));
      }
      const sql = neon(databaseUrl);
      return runTick({
        // Testnet only until DoD-2 (PH2-E5-02). A SOROBAN_RPC_URL for another network is
        // refused by the passphrase check, not trusted by its name.
        rpcUrl: env.SOROBAN_RPC_URL ?? NETWORKS.testnet.defaultRpcUrl,
        expectedPassphrase: NETWORKS.testnet.passphrase,
        fetch: (url, init) => fetch(url, init),
        query: (text, params) => sql.query(text, [...params]),
      });
    },
  };
}

// The one default export allowed: the Workers runtime requires a module Worker's
// handler object as the default export.
// eslint-disable-next-line no-restricted-syntax
export default {
  scheduled(_controller: { cron: string; scheduledTime: number }, env: Env): Promise<void> {
    return handleScheduled(env, productionRuntime(env));
  },
  fetch(request: Request, env: Env): Promise<Response> {
    return handleFetch(request, env, productionRuntime(env));
  },
};

export { handleFetch, handleScheduled, deployedCommit, tokenMatches, SERVICE } from './worker.js';
export type { Env, Runtime } from './worker.js';
export {
  EvaluationError,
  evaluate,
  isReadOnlyStatement,
  readOnlyQuery,
  summarise,
} from './evaluate.js';
export {
  countDue,
  countVerdicts,
  createFetchReader,
  dueVerdicts,
  scanRequest,
  verdict,
} from './due.js';
export {
  dryRunSubmitter,
  planExtendRequests,
  submitPlan,
  summariseWouldSubmit,
} from './extend-plan.js';
export type {
  ExtendItem,
  ExtendPlan,
  ExtendRequest,
  ExtendSubmitter,
  SkipReason,
  SubmitOutcome,
  WouldSubmitSummary,
} from './extend-plan.js';
export type { DueCounts, DueVerdict, FetchReaderOptions } from './due.js';
export type { EvaluationErrorCode, EvaluationSummary } from './evaluate.js';
export { INSERT_TICK_SQL, TickError, runTick } from './tick.js';
export type { FetchLike, TickDeps, TickErrorCode } from './tick.js';
