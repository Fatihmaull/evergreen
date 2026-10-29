/**
 * The scheduler Worker, Stage 0 of PH2-E4-04: a heartbeat. See
 * docs/PH2-E4-04-SCHEDULER-DESIGN.md and apps/scheduler/README.md.
 */
import { NETWORKS } from '@evergreen-stellar/core';
import { neon } from '@neondatabase/serverless';
import { TickError, runTick } from './tick.js';
import { handleFetch, handleScheduled, type Env, type Runtime } from './worker.js';

/** The runtime, built lazily so `/health` works with no database configured. */
export function productionRuntime(env: Env): Runtime {
  return {
    log: (entry) => console.log(JSON.stringify(entry)),
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
export { INSERT_TICK_SQL, TickError, runTick } from './tick.js';
export type { FetchLike, TickDeps, TickErrorCode } from './tick.js';
