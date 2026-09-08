// Explicit integration experiment: writes only synthetic data in a unique temporary schema.
import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import console from 'node:console';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import process from 'node:process';
import { clearTimeout, setTimeout } from 'node:timers';
import { pathToFileURL, URL } from 'node:url';
import {
  claim,
  complete,
  connect,
  createSchema,
  prepare,
  schemaName,
} from './persistence-store.mjs';

const CHECKS = [
  'two-process contention grants exactly one claim',
  'different entries can be claimed independently',
  'expired pre-send claim is recoverable and fences its old owner',
  'pending send survives expiry and blocks another claim',
  'history failure rolls back completion',
  'confirmation and history commit once and retain payer identities',
  'history survives client exit and a new reader process',
  'closed database connection refuses new work',
];

export function parseMode(args) {
  if (args.length === 0) return 'preview';
  if (args.length === 1 && args[0] === '--run') return 'run';
  if (args.length === 1 && args[0] === '--help') return 'help';
  throw new Error('Use no flags for preview, or exactly --run for a database experiment');
}

function contender(databaseUrl, schema, key, owner, operation = 'claim') {
  const child = fork(
    new URL('./persistence-contender.mjs', import.meta.url),
    [schema, key, owner, operation],
    {
      execArgv: [],
      env: { PATH: process.env.PATH, PERSISTENCE_DATABASE_URL: databaseUrl },
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
    },
  );
  let resolveReady, rejectReady, resolveResult, rejectResult;
  const ready = new Promise((resolve, reject) => {
    resolveReady = resolve;
    rejectReady = reject;
  });
  const result = new Promise((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });
  // Both promises can fail before the caller reaches its second await.
  void ready.catch(() => {});
  void result.catch(() => {});
  const fail = () => {
    rejectReady(new Error('Contender failed'));
    rejectResult(new Error('Contender failed'));
  };
  const timeout = setTimeout(() => {
    fail();
    child.kill();
  }, 20_000);
  child.on('error', fail);
  child.on('exit', () => {
    clearTimeout(timeout);
    // Reject unsettled promises even after a clean but premature exit.
    // A rejection after a received result cannot change that resolved promise.
    fail();
  });
  child.on('message', (message) => {
    if (message.failed) {
      fail();
      return;
    }
    if (message.ready) resolveReady(message.backendPid);
    else {
      clearTimeout(timeout);
      resolveResult(message.value);
    }
  });
  return {
    pid: child.pid,
    ready,
    result,
    start: () => child.send('start'),
    stop: () => child.kill(),
  };
}

/** No connection or environment validation in preview; --run is the sole write opt-in. */
export async function runSpike({ args = [], env = {}, connectImpl = connect } = {}) {
  const mode = parseMode(args);
  if (mode === 'help') return { usage: 'pnpm persistence:spike [--run]', checks: CHECKS };
  if (mode === 'preview') return { status: 'dry-run', databaseWrites: false, checks: CHECKS };
  const url = env.PERSISTENCE_DATABASE_URL;
  const schema = `evergreen_spike_${randomUUID().replaceAll('-', '')}`;
  const checks = [];
  let client,
    created = false,
    schemaAttempted = false,
    activeCheck = 'connect',
    cleanup = 'not-needed';
  const children = [];
  const ownerA = randomUUID(),
    ownerB = randomUUID();
  let serverVersion;
  try {
    client = await connectImpl(url);
    serverVersion = (await client.query('SHOW server_version')).rows[0].server_version;
    activeCheck = 'schema';
    schemaAttempted = true;
    await createSchema(client, schema);
    created = true;
    const table = schemaName(schema);
    const expire = async (key) =>
      client.query(
        `UPDATE ${table}.claims SET expires_at = clock_timestamp() - interval '1 second' WHERE entry_key = $1`,
        [key],
      );
    const checked = (name) => checks.push({ name, passed: true });

    activeCheck = CHECKS[0];
    const workers = [ownerA, ownerB].map((owner) => contender(url, schema, 'shared-key', owner));
    children.push(...workers);
    const pids = await Promise.all(workers.map((worker) => worker.ready));
    // Transaction poolers may reuse a backend between statements. The clients
    // must be separate OS processes; backend IDs are diagnostic only.
    assert.notEqual(workers[0].pid, workers[1].pid);
    workers.forEach((worker) => worker.start());
    const results = await Promise.all(workers.map((worker) => worker.result));
    assert.equal(results.filter((value) => value !== null).length, 1);
    checks.push({
      name: activeCheck,
      passed: true,
      processPids: workers.map((worker) => worker.pid),
      backendPids: pids,
      winners: 1,
    });

    activeCheck = CHECKS[1];
    assert.equal(await claim(client, schema, 'key-a', ownerA), 1);
    assert.equal(await claim(client, schema, 'key-b', ownerB), 1);
    checked(activeCheck);

    activeCheck = CHECKS[2];
    await expire('key-a');
    assert.equal(await prepare(client, schema, 'key-a', ownerA, 1, 'a'.repeat(64)), false);
    // Even reusing the owner ID must not revive its stale generation.
    const generation = await claim(client, schema, 'key-a', ownerA);
    assert.equal(generation, 2);
    assert.equal(await prepare(client, schema, 'key-a', ownerA, 1, 'a'.repeat(64)), false);
    assert.equal(await prepare(client, schema, 'key-a', ownerB, generation, 'a'.repeat(64)), false);
    assert.equal(await prepare(client, schema, 'key-a', ownerA, generation, 'a'.repeat(64)), true);
    checked(activeCheck);

    activeCheck = CHECKS[3];
    await expire('key-a');
    assert.equal(await claim(client, schema, 'key-a', ownerB), null);
    const pending = (
      await client.query(
        `SELECT phase, transaction_hash FROM ${table}.claims WHERE entry_key = 'key-a'`,
      )
    ).rows[0];
    assert.deepEqual(pending, { phase: 'pending', transaction_hash: 'a'.repeat(64) });
    checked(activeCheck);

    activeCheck = CHECKS[4];
    await assert.rejects(complete(client, schema, 'key-a', 'a'.repeat(64), { outcome: 'failed' }));
    assert.equal(
      (await client.query(`SELECT phase FROM ${table}.claims WHERE entry_key = 'key-a'`)).rows[0]
        .phase,
      'pending',
    );
    assert.equal(
      (await client.query(`SELECT count(*)::integer AS count FROM ${table}.history`)).rows[0].count,
      0,
    );
    checked(activeCheck);

    activeCheck = CHECKS[5];
    const records = ['a', 'b'].map((letter) => ({
      entryKey: `key-${letter}`,
      contracts: [`synthetic-contract-${letter}`],
      reason: 'Synthetic confirmation for the database spike; not a chain transaction',
      payer: `payer-${letter}`,
      extendToLedgers: 100,
      recordedAt: '2026-09-08T00:00:00.000Z',
      before: { observedAtLedger: 100, endsAtLedger: 101 },
      outcome: 'succeeded',
      mode: 'live',
      signer: { kind: 'ed25519', account: `synthetic-account-${letter}` },
      transactionHash: letter.repeat(64),
      after: { observedAtLedger: 101, endsAtLedger: 201 },
      paidFeeStroops: '9007199254740993',
    }));
    assert.equal(await complete(client, schema, 'key-a', 'b'.repeat(64), records[0]), false);
    assert.equal(await complete(client, schema, 'key-a', 'a'.repeat(64), records[0]), true);
    assert.equal(await complete(client, schema, 'key-a', 'a'.repeat(64), records[0]), false);
    assert.equal(await prepare(client, schema, 'key-b', ownerB, 1, 'b'.repeat(64)), true);
    assert.equal(await complete(client, schema, 'key-b', 'b'.repeat(64), records[1]), true);
    checked(activeCheck);

    activeCheck = CHECKS[6];
    await client.end();
    const reader = contender(url, schema, 'unused', ownerA, 'read');
    children.push(reader);
    await reader.ready;
    reader.start();
    assert.deepEqual(
      (await reader.result).map((row) => row.record),
      records,
    );
    checked(activeCheck);

    activeCheck = CHECKS[7];
    await assert.rejects(claim(client, schema, 'must-not-run', ownerA));
    checked(activeCheck);
  } catch {
    // Never expose pg error text: connection strings, hosts and query values can be sensitive.
    checks.push({ name: activeCheck, passed: false });
  } finally {
    children.forEach((child) => child.stop());
    if (client) await client.end().catch(() => {});
    if (schemaAttempted) {
      try {
        const cleaner = await connectImpl(url);
        try {
          await cleaner.query(`DROP SCHEMA IF EXISTS ${schemaName(schema)} CASCADE`);
          cleanup = 'complete';
        } finally {
          await cleaner.end();
        }
      } catch {
        cleanup = 'failed';
      }
    }
  }
  return {
    task: 'W1-D6-04',
    recordedAt: new Date().toISOString(),
    serverVersion,
    status:
      checks.length === CHECKS.length &&
      checks.every((check) => check.passed) &&
      cleanup === 'complete'
        ? 'passed'
        : 'failed',
    databaseWrites: created ? true : schemaAttempted ? 'unknown' : false,
    schema,
    cleanup,
    checks,
    proofBoundary:
      'Real PostgreSQL coordination with synthetic transaction data; no Stellar RPC, signing or send. Not a production exactly-once guarantee.',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await runSpike({ args: process.argv.slice(2), env: process.env });
    console.log(JSON.stringify(result, null, 2));
    if (result.status === 'failed') process.exitCode = 1;
  } catch {
    console.error(
      'Persistence probe refused configuration. Use --help and check the dedicated database URL.',
    );
    process.exitCode = 1;
  }
}
