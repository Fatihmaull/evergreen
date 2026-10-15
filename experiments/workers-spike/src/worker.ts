// Throwaway Workers spike. Imports the BUILT core and CLI command layer read-only
// (packages/*/dist): nothing under packages/ is edited.
import { runCli } from '../../../packages/cli/dist/command.js';
import { extensionPreview } from '../../../packages/cli/dist/extend.js';
import {
  connectTestnet,
  createRpcReader,
  scanContract,
  readStateArchivalSettings,
  planExtension,
  executeExtensions,
  prepareExtension,
  submitExtension,
  confirmExtension,
  createEd25519Signer,
  coverageIssues,
} from '../../../packages/core/dist/index.js';
import { rpc, Networks, Keypair, TransactionBuilder } from '@stellar/stellar-sdk';
import recording from './recording.json';
import { neon, Pool, Client, neonConfig } from '@neondatabase/serverless';

type Rec = { key: string; req: string; status: number; res: string };
type Env = { RPC_URL: string; NEON_DATABASE_URL?: string };

const keyOf = (url: string, body: string | undefined): string => {
  let j: { method?: string; params?: unknown } = {};
  try {
    j = JSON.parse(body ?? '{}');
  } catch {
    /* not json */
  }
  return `${url}|${j.method}|${JSON.stringify(j.params ?? null)}`;
};

/** Counts every outbound subrequest; optionally answers from the recording instead of the network. */
function instrument(replay: boolean) {
  const realFetch = globalThis.fetch.bind(globalThis);
  const log: { method: string; ms: number; bytes: number }[] = [];
  let count = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    count++;
    const req = new Request(input as RequestInfo, init);
    const body = await req.clone().text();
    const t0 = Date.now();
    let method = 'unknown';
    try {
      method = JSON.parse(body).method ?? 'unknown';
    } catch {
      /* ignore */
    }
    if (replay) {
      const hit = (recording as Rec[]).find((r) => r.key === keyOf(req.url, body));
      if (!hit) console.error('REPLAYMISS ' + keyOf(req.url, body));
      if (!hit) throw new Error('replay miss: ' + keyOf(req.url, body).slice(0, 120));
      const out = JSON.parse(hit.res);
      out.id = JSON.parse(body).id;
      log.push({ method, ms: 0, bytes: hit.res.length });
      return new Response(JSON.stringify(out), {
        status: hit.status,
        headers: { 'content-type': 'application/json' },
      });
    }
    const res = await realFetch(req);
    const text = await res.clone().text();
    log.push({ method, ms: Date.now() - t0, bytes: text.length });
    return res;
  }) as typeof fetch;
  return {
    done: () => {
      globalThis.fetch = realFetch;
      return { count, log };
    },
  };
}

/** Replay-only: freeze `Date` so timestamps/timebounds (and therefore tx hashes) are comparable with the CLI run. */
function freezeDate(iso: string | null): () => void {
  if (!iso) return () => {};
  const RealDate = Date;
  const fixed = new RealDate(iso).getTime();
  class Frozen extends RealDate {
    constructor(...a: unknown[]) {
      // @ts-expect-error spread into Date
      super(...(a.length ? a : [fixed]));
    }
    static now() {
      return fixed;
    }
  }
  globalThis.Date = Frozen as unknown as DateConstructor;
  return () => {
    globalThis.Date = RealDate;
  };
}

function runtimeFacts() {
  const g = globalThis as Record<string, unknown>;
  return {
    Buffer: typeof g.Buffer,
    process: typeof g.process,
    atob: typeof g.atob,
    TextEncoder: typeof g.TextEncoder,
    userAgent: (g.navigator as { userAgent?: string } | undefined)?.userAgent,
  };
}

async function extendDryRun(rpcUrl: string, contractId: string, source: string, ledgers: number) {
  // Mirrors packages/cli/src/bin.ts runExtension() for the dry-run path (simulate only, never signs).
  const server = new rpc.Server(rpcUrl, { timeout: 10_000, allowHttp: rpcUrl.startsWith('http:') });
  if ((await server.getNetwork()).passphrase !== Networks.TESTNET) throw new Error('RPC is not Testnet');
  const reader = createRpcReader(server);
  const scan = await scanContract(reader, { id: contractId }, []);
  const settings = await readStateArchivalSettings(server);
  const plan = planExtension(scan, {
    contractId,
    additionalLedgers: ledgers,
    maxEntryTtl: settings.maxEntryTtl,
    dataKeys: [],
    includeCode: false,
  });
  const previews: unknown[] = [];
  const result = await executeExtensions(
    plan,
    { payer: source, submit: false },
    {
      prepare: (entry: never) => prepareExtension(server, entry, source),
      signer: () => {
        throw new Error('signing is unreachable in dry-run');
      },
      submit: (p: never, s: never) => submitExtension(server, p, s),
      confirm: (h: never) => confirmExtension(server, h),
      readAfter: async () => {
        throw new Error('unreachable in dry-run');
      },
      preview: async (p: never) => {
        previews.push(p);
        void extensionPreview;
      },
      now: () => new Date(),
    } as never,
  );
  return { plan, result, previews };
}
async function extendDryRunRaw(rpcUrl: string, contractId: string, source: string, ledgers: number) {
  const server = new rpc.Server(rpcUrl, { timeout: 10_000 });
  const reader = createRpcReader(server);
  const scan = await scanContract(reader, { id: contractId }, []);
  const settings = await readStateArchivalSettings(server);
  const plan = planExtension(scan, { contractId, additionalLedgers: ledgers, maxEntryTtl: settings.maxEntryTtl, dataKeys: [], includeCode: false });
  return prepareExtension(server, plan.entries[0] as never, source);
}
void createEd25519Signer;


/** Strip anything that could carry the connection string out of an error message. */
function scrub(msg: string, secret: string | undefined): string {
  let out = msg;
  if (secret) {
    const parts = new Set<string>([secret]);
    try {
      const u = new URL(secret);
      for (const x of [u.host, u.hostname, u.username, u.password, decodeURIComponent(u.password), u.pathname.slice(1)]) if (x && x.length > 2) parts.add(x);
    } catch {
      /* not parseable: the full-string replacement below still applies */
    }
    for (const x of parts) out = out.split(x).join('[redacted]');
  }
  return out.replace(/postgres(ql)?:\/\/\S+/gi, '[redacted-url]').replace(/\b[\w-]*ep-[\w-]+\.[\w.-]+/gi, '[redacted-host]');
}

const pct = (xs: number[], p: number) => {
  const a = [...xs].sort((x, y) => x - y);
  return a.length ? a[Math.min(a.length - 1, Math.ceil(p * a.length) - 1)] : null;
};

/**
 * READ-ONLY Neon reachability probe. Only `SELECT 1` and `SELECT version()` are ever sent.
 *   transport=http : neon() one-shot driver, each query is one HTTPS fetch to the Neon HTTP SQL endpoint.
 *   transport=ws   : Client over the driver's WebSocket transport; one WebSocket carries handshake + all queries.
 * Subrequests are counted by wrapping globalThis.fetch, neonConfig.fetchFunction and the WebSocket constructor.
 * The connection string is read from env (.dev.vars locally) and never returned or logged.
 */
async function neonProbe(env: Env, transport: string, queries: number): Promise<Record<string, unknown>> {
  const cs = env.NEON_DATABASE_URL;
  if (!cs) return { ok: false, error: 'NEON_DATABASE_URL not set' };
  const realFetch = globalThis.fetch.bind(globalThis);
  const fetchCalls: { kind: string; ms: number; status?: number }[] = [];
  let wsOpened = 0;
  const countingFetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const t0 = Date.now();
    const res = await realFetch(input as RequestInfo, init);
    fetchCalls.push({ kind: 'fetch', ms: Date.now() - t0, status: res.status });
    return res;
  }) as typeof fetch;
  globalThis.fetch = countingFetch;
  const RealWS = globalThis.WebSocket;
  class CountingWS extends RealWS {
    constructor(url: string | URL, protocols?: string | string[]) {
      super(url, protocols);
      wsOpened++;
    }
  }
  neonConfig.webSocketConstructor = CountingWS as unknown as typeof WebSocket;
  neonConfig.fetchFunction = countingFetch;
  const queryMs: number[] = [];
  let connectMs: number | null = null;
  let version: string | undefined;
  let select1: unknown;
  const t00 = Date.now();
  let error: string | undefined;
  try {
    if (transport === 'http') {
      const sql = neon(cs);
      for (let i = 0; i < queries; i++) {
        const t0 = Date.now();
        if (i === 0) select1 = (await sql`SELECT 1 AS one`)[0];
        else if (i === 1) version = String((await sql`SELECT version() AS v`)[0].v).slice(0, 40);
        else await sql`SELECT 1 AS one`;
        queryMs.push(Date.now() - t0);
      }
    } else {
      const client = new Client({ connectionString: cs });
      const t0 = Date.now();
      await client.connect();
      connectMs = Date.now() - t0;
      try {
        for (let i = 0; i < queries; i++) {
          const q0 = Date.now();
          if (i === 0) select1 = (await client.query('SELECT 1 AS one')).rows[0];
          else if (i === 1) version = String((await client.query('SELECT version() AS v')).rows[0].v).slice(0, 40);
          else await client.query('SELECT 1 AS one');
          queryMs.push(Date.now() - q0);
        }
      } finally {
        await client.end();
      }
    }
  } catch (e) {
    error = scrub((e as Error).name + ': ' + (e as Error).message, cs);
  } finally {
    globalThis.fetch = realFetch;
  }
  return {
    ok: !error,
    error,
    transport,
    queries,
    select1,
    version,
    connectMs,
    queryMs,
    totalMs: Date.now() - t00,
    subrequests: { fetch: fetchCalls.length, websocket: wsOpened, total: fetchCalls.length + wsOpened },
    fetchStatuses: fetchCalls.map((c) => c.status),
    neonPoolType: typeof Pool,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/neon') {
      const r = await neonProbe(env, url.searchParams.get('transport') === 'ws' ? 'ws' : 'http', Math.max(1, Math.min(50, Number(url.searchParams.get('q') ?? '1'))));
      const cf = (request as unknown as { cf?: { colo?: string; country?: string } }).cf;
      return new Response(JSON.stringify({ ...r, colo: cf?.colo, country: cf?.country }), { status: r.ok ? 200 : 500, headers: { 'content-type': 'application/json', 'x-colo': String(cf?.colo) } });
    }
    const replay = url.searchParams.get('replay') === '1';
    const contract = url.searchParams.get('contract') ?? '';
    const rpcUrl = env.RPC_URL;
    const started = Date.now();
    const inst = instrument(replay);
    const unfreeze = replay ? freezeDate(url.searchParams.get('now')) : () => {};
    let body = '';
    let exitCode: number | undefined;
    let error: string | undefined;
    let stderr = '';
    try {
      if (url.pathname === '/facts') {
        body = JSON.stringify(runtimeFacts());
      } else if (url.pathname === '/scan') {
        // Same entry point the real CLI uses (packages/cli/dist/command.js runCli), same core calls.
        const now = new Date(url.searchParams.get('now') ?? Date.now());
        const args = ['scan', ...contract.split(','), ...(url.searchParams.get('format') === 'json' ? ['--json'] : [])];
        const out = await runCli(args, {
          connect: () => connectTestnet(rpcUrl),
          readKeysFile: async () => {
            throw new Error('no fs in Workers');
          },
          now: () => now,
        } as never);
        body = out.stdout;
        stderr = out.stderr;
        exitCode = out.exitCode;
      } else if (url.pathname === '/core-scan') {
        // core only: scanContract + coverageIssues (what runCli does before formatting)
        const reader = await connectTestnet(rpcUrl);
        const scanned = await scanContract(reader, { id: contract }, []);
        body = JSON.stringify({ ...scanned, issues: [...scanned.issues, ...coverageIssues(scanned)] }, null, 2);
      } else if (url.pathname === '/debug-prepare') {
        // Surfaces the error that executeExtensions() collapses into SIMULATION_FAILED.
        try {
          await extendDryRunRaw(rpcUrl, contract, url.searchParams.get('source') ?? '', 1000);
          body = 'prepareExtension: OK';
        } catch (e) {
          body = 'prepareExtension threw: ' + (e as Error).name + ': ' + (e as Error).message + '\n' + String((e as Error).stack).split('\n').slice(0, 4).join('\n');
        }
      } else if (url.pathname === '/sign-bench') {
        // CPU micro-bench of the signing step only. EPHEMERAL in-memory keypair: never funded, never submitted,
        // not a testnet key. Prepared tx comes from the same dry-run path; signature will not be valid for the payer.
        const prepared = await extendDryRunRaw(rpcUrl, contract, url.searchParams.get('source') ?? '', 1000);
        const kp = Keypair.random();
        const tx = TransactionBuilder.fromXDR(prepared.transactionXdr, Networks.TESTNET);
        tx.sign(kp);
        body = 'signed (ephemeral key, not submitted); signatures=' + tx.signatures.length;
      } else if (url.pathname === '/neon-load') {
        // LOAD CHECK ONLY: does the Neon serverless driver bundle and construct in workerd? No connection is made,
        // no account exists, the connection string below is a non-resolving placeholder. Reachability stays UNDETERMINED.
        const sql = neon('postgres://user:placeholder@ep-placeholder.invalid/db');
        const pool = new Pool({ connectionString: 'postgres://user:placeholder@ep-placeholder.invalid/db' });
        body = JSON.stringify({ neonFn: typeof sql, Pool: typeof Pool, poolConstructed: pool instanceof Pool, WebSocket: typeof WebSocket });
      } else if (url.pathname === '/extend-dryrun') {
        const source = url.searchParams.get('source') ?? '';
        const ledgers = Number(url.searchParams.get('ledgers') ?? '1000');
        // Same entry point as the CLI: runCli(['extend', ...]) with the wiring of bin.ts runExtension() injected.
        const out = await runCli(
          ['extend', contract, '--ledgers', String(ledgers), '--source-account', source, '--json'],
          {
            extend: {
              readKeysFile: async () => {
                throw new Error('no fs in Workers');
              },
              preview: () => {},
              run: (request: { contractId: string; sourceAccount: string; additionalLedgers: number }) =>
                extendDryRun(rpcUrl, request.contractId, request.sourceAccount, request.additionalLedgers),
            },
            connect: () => connectTestnet(rpcUrl),
            readKeysFile: async () => '',
            now: () => new Date(),
          } as never,
        );
        body = out.stdout;
        stderr = out.stderr;
        exitCode = out.exitCode;
      } else {
        body = 'routes: /facts /scan /core-scan /extend-dryrun /neon-load /neon';
      }
    } catch (e) {
      error = (e as Error).name + ': ' + (e as Error).message;
    }
    unfreeze();
    const { count, log } = inst.done();
    const headers = new Headers({
      'content-type': 'text/plain; charset=utf-8',
      'x-subrequests': String(count),
      'x-wall-ms': String(Date.now() - started),
      'x-colo': String((request as unknown as { cf?: { colo?: string } }).cf?.colo),
      'x-fetch-log': JSON.stringify(log),
    });
    if (exitCode !== undefined) headers.set('x-exit-code', String(exitCode));
    if (stderr) headers.set('x-stderr', encodeURIComponent(stderr));
    if (error) headers.set('x-error', error.slice(0, 300));
    return new Response(error ? 'ERROR ' + error + '\n' + body : body, { status: error ? 500 : 200, headers });
  },
};
