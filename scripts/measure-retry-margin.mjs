#!/usr/bin/env node
/**
 * Measure how long a testnet renewal retry needs.
 *
 * Dry-run is the default: it prints the plan and does not connect.
 * A live run requires both flags:
 *
 *   node scripts/measure-retry-margin.mjs --network testnet --submit
 *
 * Any mainnet or futurenet passphrase or URL is refused before a client
 * is constructed. Keypairs are created in memory, funded by the testnet
 * friendbot URL returned by getNetwork, and never written or logged.
 *
 * RPC methods, each named in the Stellar RPC reference or the primer:
 * getNetwork, getLatestLedger, getLedgers, getFeeStats, getLedgerEntries,
 * simulateTransaction, sendTransaction, getTransaction.
 */

import { Buffer } from 'node:buffer';
import { createHash, randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import process from 'node:process';
import { setTimeout as delay } from 'node:timers/promises';
import { pathToFileURL } from 'node:url';
import {
  Account,
  Address,
  Asset,
  Contract,
  Keypair,
  Operation,
  SorobanDataBuilder,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import {
  TESTNET_PASSPHRASE,
  assertFriendbotUrl,
  assertTestnetOnly,
  inclusionFeeCharged,
  ledgerCloseDeltas,
  parseArgs,
  recommendRetryMargin,
  redact,
  sorobanFeeParts,
  summarizeRows,
  toCsv,
  txResultCode,
} from './retry-margin.mjs';

/** Guinea-pig Wasm hash recorded in docs/SETUP.md. A new instance only; A/B/C are not used. */
const GUINEA_PIG_WASM_HASH = 'c7e55f0ad89efb0600bc15048b155099fa4d97cee16466fa1244b3dcbce98bfb';
const LOCAL_WASM = 'target/wasm32v1-none/release/guinea_pig.wasm';
const EXTEND_BY_LEDGERS = 50;
const POLL_MS = 500;
const INCLUSION_DEADLINE_MS = 45_000;

const sleep = (ms) => delay(ms);

/**
 * JSON-RPC for methods whose ledger-header XDR the pinned SDK 17.0.1 cannot
 * decode on protocol 30 (`LedgerHeader.scpValue.ext` enum 3). The method names
 * are the documented ones. Only sequence and close-time fields are read.
 */
export async function callRpc(rpcUrl, method, params) {
  const response = await globalThis.fetch(rpcUrl, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  if (!response.ok) throw new Error(`${method} http ${response.status}`);
  const body = await response.json();
  if (body.error) throw new Error(`${method} ${body.error.message ?? 'rpc error'}`);
  return body.result;
}

function jsonReplacer(_key, value) {
  if (typeof value === 'bigint') return value.toString();
  if (value instanceof Uint8Array) return Buffer.from(value).toString('hex');
  return value;
}

function blankRow(scenario, run) {
  return {
    scenario,
    run,
    started_at: new Date().toISOString(),
  };
}

function finish(row) {
  row.finished_at = new Date().toISOString();
  return row;
}

export function createDefaultServer(rpcUrl) {
  return new rpc.Server(rpcUrl, { allowHttp: false });
}

export async function defaultFriendbot(url) {
  return globalThis.fetch(url);
}

async function defaultWrite(path, text) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, text);
}

function payment(account, keypair, options) {
  const builder = new TransactionBuilder(account, {
    fee: options.fee,
    networkPassphrase: TESTNET_PASSPHRASE,
  }).addOperation(
    Operation.payment({
      destination: keypair.publicKey(),
      asset: Asset.native(),
      amount: '0.0000001',
    }),
  );
  if (options.timebounds) builder.setTimebounds(options.timebounds[0], options.timebounds[1]);
  else builder.setTimeout(60);
  if (options.ledgerbounds)
    builder.setLedgerbounds(options.ledgerbounds[0], options.ledgerbounds[1]);
  return builder.build();
}

async function loadAccount(server, publicKey) {
  return server.getAccount(publicKey);
}

async function sendAndTime(server, tx, keypair) {
  tx.sign(keypair);
  const started = Date.now();
  let response = await server.sendTransaction(tx);
  let attempts = 1;
  while (response.status === 'TRY_AGAIN_LATER' && attempts < 4) {
    await sleep(500);
    response = await server.sendTransaction(tx);
    attempts += 1;
  }
  return { response, seconds: (Date.now() - started) / 1000, attempts };
}

async function pollTransaction(server, hash, deadlineMs, done) {
  const started = Date.now();
  let polls = 0;
  let response = null;
  while (Date.now() - started <= deadlineMs) {
    polls += 1;
    response = await server.getTransaction(hash);
    if (response.status === 'SUCCESS' || response.status === 'FAILED' || done?.(response)) {
      return { response, polls, seconds: (Date.now() - started) / 1000, capped: false };
    }
    await sleep(POLL_MS);
  }
  return { response, polls, seconds: (Date.now() - started) / 1000, capped: true };
}

function applyFee(response, row) {
  if (!response?.resultXdr) return;
  const charged = response.resultXdr.feeCharged;
  if (typeof charged === 'bigint') row.fee_charged_stroops = charged.toString();
  const parts = sorobanFeeParts(response.resultMetaXdr);
  if (!parts) {
    row.note = [row.note, 'resource fee split undetermined'].filter(Boolean).join('; ');
    return;
  }
  row.non_refundable_stroops = parts.nonRefundable.toString();
  row.refundable_stroops = parts.refundable.toString();
  row.rent_stroops = parts.rent.toString();
  const inclusion = inclusionFeeCharged(charged, parts);
  if (inclusion === null) {
    row.note = [row.note, 'inclusion fee split undetermined'].filter(Boolean).join('; ');
    return;
  }
  row.inclusion_fee_charged_stroops = inclusion.toString();
}

async function immediateFailure(server, keypair, scenario, run, build, expectedCode) {
  const row = blankRow(scenario, run);
  row.source_public = keypair.publicKey();
  const account = await loadAccount(server, keypair.publicKey());
  const tx = build(account);
  const sent = await sendAndTime(server, tx, keypair);
  row.send_status = sent.response.status;
  row.send_ledger = sent.response.latestLedger;
  row.tx_hash = sent.response.hash;
  row.result_code = txResultCode(sent.response.errorResult);
  if (sent.response.status === 'ERROR') {
    row.final_status = 'ERROR';
    let followStatus;
    try {
      followStatus = (await server.getTransaction(sent.response.hash)).status;
    } catch (error) {
      followStatus = `error ${redact(error.message).slice(0, 120)}`;
    }
    row.polls = 1;
    row.note = `getTransaction after ERROR: ${followStatus}`;
    if (expectedCode && row.result_code !== expectedCode) {
      row.note = `${row.note}; expected ${expectedCode}; seconds not used`;
      return finish(row);
    }
    row.seconds = sent.seconds;
    row.ledgers = 0;
    return finish(row);
  }
  if (sent.response.status !== 'PENDING' && sent.response.status !== 'DUPLICATE') {
    row.note = `send status ${sent.response.status}; detection seconds left blank`;
    return finish(row);
  }
  const polled = await pollTransaction(server, sent.response.hash, INCLUSION_DEADLINE_MS);
  row.polls = polled.polls;
  row.final_status = polled.response?.status ?? '';
  row.inclusion_ledger = polled.response?.ledger;
  if (polled.capped) {
    row.note = `poll limit ${INCLUSION_DEADLINE_MS}ms reached; seconds not used`;
    return finish(row);
  }
  row.seconds = sent.seconds + polled.seconds;
  if (Number.isFinite(polled.response?.ledger) && Number.isFinite(sent.response.latestLedger)) {
    row.ledgers = polled.response.ledger - sent.response.latestLedger;
  }
  applyFee(polled.response, row);
  return finish(row);
}

async function unincludeable(server, keypair, run, raw) {
  const row = blankRow('unincludeable', run);
  row.source_public = keypair.publicKey();
  const latest = await raw('getLatestLedger');
  const maxTime = Math.floor(Date.now() / 1000) + 8;
  const account = await loadAccount(server, keypair.publicKey());
  const tx = payment(account, keypair, {
    fee: '100',
    timebounds: [0, maxTime],
    ledgerbounds: [latest.sequence + 40, latest.sequence + 40_000],
  });
  const sent = await sendAndTime(server, tx, keypair);
  row.send_status = sent.response.status;
  row.send_ledger = sent.response.latestLedger;
  row.tx_hash = sent.response.hash;
  row.result_code = txResultCode(sent.response.errorResult);
  if (sent.response.status === 'ERROR') {
    row.seconds = sent.seconds;
    row.ledgers = 0;
    row.final_status = 'ERROR';
    row.note = 'rejected at sendTransaction; no pending expiry to poll';
    return finish(row);
  }
  const polled = await pollTransaction(server, sent.response.hash, 20_000, (response) => {
    return response.status === 'NOT_FOUND' && Number(response.latestLedgerCloseTime) > maxTime;
  });
  row.polls = polled.polls;
  row.final_status = polled.response?.status ?? '';
  if (polled.response?.status === 'SUCCESS' || polled.response?.status === 'FAILED') {
    row.note = 'transaction was included; expiry was not observed';
    applyFee(polled.response, row);
    return finish(row);
  }
  if (polled.capped) {
    row.note = 'poll limit reached before expiry was observed; seconds not used';
    return finish(row);
  }
  row.seconds = sent.seconds + polled.seconds;
  if (
    Number.isFinite(polled.response?.latestLedger) &&
    Number.isFinite(sent.response.latestLedger)
  ) {
    row.ledgers = polled.response.latestLedger - sent.response.latestLedger;
  }
  row.note = 'NOT_FOUND after the time bound';
  return finish(row);
}

function persistentDataKey(keys) {
  return keys.find((key) => {
    const text = JSON.stringify(key, jsonReplacer);
    return (
      text.includes('Persistent') &&
      !text.includes('contractCode') &&
      !text.includes('contractInstance')
    );
  });
}

async function simulateExtend(server, keypair, key, extendTo) {
  const account = await loadAccount(server, keypair.publicKey());
  const tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(Operation.extendFootprintTtl({ extendTo }))
    .setSorobanData(new SorobanDataBuilder().setReadOnly([key]).build())
    .setTimeout(60)
    .build();
  const started = Date.now();
  const simulated = await server.simulateTransaction(tx);
  return { tx, simulated, simulatedAt: Date.now(), simulateMs: Date.now() - started };
}

function withResourceFee(tx, simulated, resourceFee) {
  return TransactionBuilder.cloneFrom(rpc.assembleTransaction(tx, simulated).build(), {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
    sorobanData: simulated.transactionData.setResourceFee(resourceFee).build(),
  }).build();
}

async function runExtend(server, keypair, key, extendTo, scenario, run, resourceFeeOf, raw) {
  const row = blankRow(scenario, run);
  row.source_public = keypair.publicKey();
  const prepared = await simulateExtend(server, keypair, key, extendTo);
  if (rpc.Api.isSimulationError(prepared.simulated)) {
    row.note = redact(prepared.simulated.error).slice(0, 300);
    row.final_status = 'SIMULATION_ERROR';
    return finish(row);
  }
  const simulatedFee = BigInt(prepared.simulated.minResourceFee);
  const declared = resourceFeeOf(simulatedFee);
  row.sim_ledger = prepared.simulated.latestLedger;
  row.sim_resource_fee_stroops = simulatedFee.toString();
  row.declared_resource_fee_stroops = declared.toString();
  let transaction;
  if (scenario === 'extend-delayed') {
    const target = prepared.simulated.latestLedger + 1;
    const waitStarted = Date.now();
    let sequence = prepared.simulated.latestLedger;
    while (sequence < target && Date.now() - waitStarted < 30_000) {
      await sleep(POLL_MS);
      sequence = (await raw('getLatestLedger')).sequence;
    }
    if (sequence < target) {
      row.note = 'ledger did not advance during the wait; seconds not used';
      return finish(row);
    }
    const refreshed = await loadAccount(server, keypair.publicKey());
    transaction = new TransactionBuilder(refreshed, {
      fee: '100',
      networkPassphrase: TESTNET_PASSPHRASE,
    })
      .addOperation(Operation.extendFootprintTtl({ extendTo }))
      .setSorobanData(prepared.simulated.transactionData.setResourceFee(declared).build())
      .setTimeout(60)
      .build();
  } else {
    transaction = withResourceFee(prepared.tx, prepared.simulated, declared);
  }
  const sendStarted = Date.now();
  const sent = await sendAndTime(server, transaction, keypair);
  row.drift_seconds = (sendStarted - prepared.simulatedAt) / 1000;
  row.drift_ledgers = sent.response.latestLedger - prepared.simulated.latestLedger;
  row.send_status = sent.response.status;
  row.send_ledger = sent.response.latestLedger;
  row.tx_hash = sent.response.hash;
  row.result_code = txResultCode(sent.response.errorResult);
  if (sent.response.status === 'ERROR') {
    row.final_status = 'ERROR';
    row.seconds = sent.seconds;
    row.ledgers = 0;
    return finish(row);
  }
  const polled = await pollTransaction(server, sent.response.hash, INCLUSION_DEADLINE_MS);
  row.polls = polled.polls;
  row.final_status = polled.response?.status ?? '';
  row.inclusion_ledger = polled.response?.ledger;
  if (polled.capped || (row.final_status !== 'SUCCESS' && row.final_status !== 'FAILED')) {
    row.note = 'inclusion not observed before the poll limit; seconds not used';
    return finish(row);
  }
  row.seconds = sent.seconds + polled.seconds;
  row.ledgers = polled.response.ledger - sent.response.latestLedger;
  applyFee(polled.response, row);
  if (scenario === 'extend-underdeclared' && row.final_status !== 'FAILED') {
    row.note = 'under-declared resource fee was not a failure; seconds not used as detection';
    delete row.seconds;
    delete row.ledgers;
  }
  if (scenario !== 'extend-underdeclared' && row.final_status !== 'SUCCESS') {
    row.note = 'extend was not included successfully; seconds not used as inclusion';
    delete row.seconds;
    delete row.ledgers;
  }
  return finish(row);
}

async function submitHost(server, keypair, operation) {
  const account = await loadAccount(server, keypair.publicKey());
  let tx = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(operation)
    .setTimeout(180)
    .build();
  const simulated = await server.simulateTransaction(tx);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(redact(simulated.error).slice(0, 300));
  }
  tx = rpc.assembleTransaction(tx, simulated).build();
  tx.sign(keypair);
  const sent = await server.sendTransaction(tx);
  if (sent.status === 'ERROR') {
    throw new Error(`setup send ${sent.status} ${txResultCode(sent.errorResult) ?? ''}`.trim());
  }
  const polled = await pollTransaction(server, sent.hash, 90_000);
  if (polled.response?.status !== 'SUCCESS') {
    throw new Error(`setup transaction ${polled.response?.status ?? 'unobserved'}`);
  }
  return { hash: sent.hash, response: polled.response };
}

async function wasmOnChain(server, hash) {
  const key = xdr.LedgerKey.contractCode(new xdr.LedgerKeyContractCode({ hash }));
  try {
    const found = await server.getLedgerEntries(key);
    return (found.entries?.length ?? 0) > 0;
  } catch {
    return false;
  }
}

async function buildWasm() {
  const compiled = await new Promise((resolve) => {
    const child = spawn(
      'cargo',
      [
        'build',
        '--release',
        '--target',
        'wasm32v1-none',
        '--manifest-path',
        'contracts/guinea-pig/Cargo.toml',
      ],
      { stdio: 'inherit' },
    );
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
  if (!compiled) return null;
  return readFile(LOCAL_WASM);
}

async function deployInstance(server, keypair, rows) {
  const known = Buffer.from(GUINEA_PIG_WASM_HASH, 'hex');
  let wasmHash = known;
  if (!(await wasmOnChain(server, known))) {
    let wasm;
    try {
      wasm = await readFile(LOCAL_WASM);
    } catch {
      wasm = await buildWasm();
    }
    if (!wasm) {
      throw new Error('guinea-pig wasm is not on testnet and could not be built');
    }
    wasmHash = createHash('sha256').update(wasm).digest();
    const uploaded = await submitHost(server, keypair, Operation.uploadContractWasm({ wasm }));
    rows.push(
      finish({
        ...blankRow('setup', rows.length + 1),
        tx_hash: uploaded.hash,
        source_public: keypair.publicKey(),
        final_status: 'SUCCESS',
        note: 'upload wasm',
      }),
    );
  }
  const created = await submitHost(
    server,
    keypair,
    Operation.createCustomContract({
      address: Address.fromString(keypair.publicKey()),
      wasmHash,
      salt: randomBytes(32),
    }),
  );
  const contractId = Address.fromScVal(created.response.returnValue).toString();
  rows.push(
    finish({
      ...blankRow('setup', rows.length + 1),
      tx_hash: created.hash,
      source_public: keypair.publicKey(),
      contract_id: contractId,
      final_status: 'SUCCESS',
      note: 'create contract',
    }),
  );
  const seeded = await submitHost(
    server,
    keypair,
    new Contract(contractId).call('seed', nativeToScVal(1, { type: 'u32' })),
  );
  rows.push(
    finish({
      ...blankRow('setup', rows.length + 1),
      tx_hash: seeded.hash,
      source_public: keypair.publicKey(),
      contract_id: contractId,
      final_status: 'SUCCESS',
      note: 'seed',
    }),
  );
  const account = await loadAccount(server, keypair.publicKey());
  const read = new TransactionBuilder(account, {
    fee: '100',
    networkPassphrase: TESTNET_PASSPHRASE,
  })
    .addOperation(new Contract(contractId).call('get_persistent'))
    .setTimeout(60)
    .build();
  const simulated = await server.simulateTransaction(read);
  if (rpc.Api.isSimulationError(simulated)) {
    throw new Error(redact(simulated.error).slice(0, 300));
  }
  const key = persistentDataKey(simulated.transactionData.getReadOnly());
  if (!key) throw new Error('persistent contract data key was not in the get_persistent footprint');
  const entries = await server.getLedgerEntries(key);
  const liveUntil = entries.entries?.[0]?.liveUntilLedgerSeq;
  const latest = entries.latestLedger;
  if (!Number.isInteger(liveUntil) || !Number.isInteger(latest)) {
    throw new Error('liveUntilLedgerSeq was absent; extend target undetermined');
  }
  return { contractId, key, extendTo: liveUntil - latest + EXTEND_BY_LEDGERS, liveUntil, latest };
}

function detectionChoice(byScenario) {
  const names = [
    'extend-underdeclared',
    'unincludeable',
    'late-submit',
    'bad-seq',
    'insufficient-fee',
  ];
  const present = names.filter(
    (name) => byScenario[name]?.fields?.seconds && byScenario[name]?.fields?.ledgers,
  );
  if (
    !present.includes('extend-underdeclared') &&
    !present.includes('unincludeable') &&
    !present.includes('late-submit')
  ) {
    return null;
  }
  present.sort((a, b) => byScenario[b].fields.seconds.p95 - byScenario[a].fields.seconds.p95);
  return present[0];
}

export async function runMeasurement(options = {}) {
  const argv = options.argv ?? process.argv.slice(2);
  const parsed = parseArgs(argv);
  if (parsed.help || parsed.mode === 'dry-run') {
    return {
      status: 'dry-run',
      writes: false,
      network: parsed.network,
      plan: [
        'No RPC, no friendbot, no transaction, no file.',
        'Live measurement: --network testnet --submit',
        'Refuses mainnet and futurenet passphrases and URLs before constructing a client.',
        `Scenarios, ${parsed.runs} runs each when submitted: ledger-close, get-fee-stats, extend-immediate, extend-delayed, extend-underdeclared, bad-seq, insufficient-fee, late-submit, unincludeable.`,
        'Restore of an archived entry is not part of the default run: a fresh persistent entry cannot be archived in this process.',
      ],
    };
  }

  assertTestnetOnly({
    network: parsed.network,
    rpcUrl: parsed.rpcUrl,
    passphrase: parsed.passphrase,
  });
  const createServer = options.createServer ?? createDefaultServer;
  const server = createServer(parsed.rpcUrl);
  const network = await server.getNetwork();
  if (network.passphrase !== TESTNET_PASSPHRASE) {
    throw new Error('Refusing to run: getNetwork passphrase is not the Stellar testnet passphrase');
  }
  assertFriendbotUrl(network.friendbotUrl);

  const rows = [];
  const write = options.writeFile ?? defaultWrite;
  const persist = async () => write(parsed.out, toCsv(rows));

  const raw = (method, params) => (options.rpcCall ?? callRpc)(parsed.rpcUrl, method, params);
  const latest = await raw('getLatestLedger');
  const page = await raw('getLedgers', {
    startLedger: Math.max(1, latest.sequence - Math.max(parsed.runs, 20)),
    pagination: { limit: Math.max(parsed.runs, 20) + 1 },
  });
  ledgerCloseDeltas(page.ledgers).forEach((delta, index) => {
    rows.push(
      finish({
        ...blankRow('ledger-close', index + 1),
        seconds: delta.seconds,
        ledgers: delta.ledgers,
        sequence_from: delta.sequenceFrom,
        sequence_to: delta.sequenceTo,
      }),
    );
  });

  for (let run = 1; run <= parsed.runs; run += 1) {
    const stats = await server.getFeeStats();
    rows.push(
      finish({
        ...blankRow('get-fee-stats', run),
        network_soroban_inclusion_min_stroops: stats.sorobanInclusionFee.min,
        network_soroban_inclusion_p50_stroops: stats.sorobanInclusionFee.p50,
        network_soroban_inclusion_max_stroops: stats.sorobanInclusionFee.max,
        network_inclusion_min_stroops: stats.inclusionFee.min,
        network_inclusion_p50_stroops: stats.inclusionFee.p50,
        network_inclusion_max_stroops: stats.inclusionFee.max,
        send_ledger: stats.latestLedger,
      }),
    );
  }
  await persist();

  const keypair = Keypair.random();
  const friendbot = options.friendbot ?? defaultFriendbot;
  const fundUrl = new globalThis.URL(network.friendbotUrl);
  fundUrl.searchParams.set('addr', keypair.publicKey());
  const funded = await friendbot(fundUrl);
  if (!funded.ok) throw new Error(`friendbot status ${funded.status}`);
  let account = null;
  for (let attempt = 0; attempt < 20; attempt += 1) {
    try {
      account = await server.getAccount(keypair.publicKey());
      break;
    } catch {
      await sleep(500);
    }
  }
  if (!account) throw new Error('friendbot account was not readable');

  const capture = async (scenario, run, fn) => {
    try {
      return await fn();
    } catch (error) {
      return finish({
        ...blankRow(scenario, run),
        source_public: keypair.publicKey(),
        final_status: 'ERROR_LOCAL',
        note: redact(error.message).slice(0, 300),
      });
    }
  };

  const failures = [
    [
      'bad-seq',
      (source) =>
        payment(
          new Account(source.accountId(), (BigInt(source.sequenceNumber()) + 5n).toString()),
          keypair,
          {
            fee: '100',
          },
        ),
      'txBadSeq',
    ],
    ['insufficient-fee', (source) => payment(source, keypair, { fee: '1' }), 'txInsufficientFee'],
    [
      'late-submit',
      (source) =>
        payment(source, keypair, {
          fee: '100',
          timebounds: [0, Math.floor(Date.now() / 1000) - 30],
        }),
      'txTooLate',
    ],
  ];
  for (const [scenario, build, expectedCode] of failures) {
    for (let run = 1; run <= parsed.runs; run += 1) {
      rows.push(
        await capture(scenario, run, () =>
          immediateFailure(server, keypair, scenario, run, build, expectedCode),
        ),
      );
    }
    await persist();
  }
  for (let run = 1; run <= parsed.runs; run += 1) {
    rows.push(await capture('unincludeable', run, () => unincludeable(server, keypair, run, raw)));
  }
  await persist();

  let subject = null;
  try {
    subject = await deployInstance(server, keypair, rows);
    await persist();
  } catch (error) {
    rows.push(
      finish({
        ...blankRow('setup', rows.length + 1),
        source_public: keypair.publicKey(),
        final_status: 'FAILED',
        note: redact(error.message).slice(0, 300),
      }),
    );
    await persist();
  }

  if (subject) {
    for (let run = 1; run <= parsed.runs; run += 1) {
      rows.push(
        await capture('extend-immediate', run, () =>
          runExtend(
            server,
            keypair,
            subject.key,
            subject.extendTo,
            'extend-immediate',
            run,
            (fee) => fee,
            raw,
          ),
        ),
      );
      subject.extendTo += EXTEND_BY_LEDGERS;
    }
    await persist();
    for (let run = 1; run <= parsed.runs; run += 1) {
      rows.push(
        await capture('extend-delayed', run, () =>
          runExtend(
            server,
            keypair,
            subject.key,
            subject.extendTo,
            'extend-delayed',
            run,
            (fee) => fee,
            raw,
          ),
        ),
      );
      subject.extendTo += EXTEND_BY_LEDGERS;
    }
    await persist();
    for (let run = 1; run <= parsed.runs; run += 1) {
      rows.push(
        await capture('extend-underdeclared', run, () =>
          runExtend(
            server,
            keypair,
            subject.key,
            subject.extendTo,
            'extend-underdeclared',
            run,
            (fee) => fee / 2n,
            raw,
          ),
        ),
      );
    }
    await persist();
  }

  const byScenario = summarizeRows(rows);
  const detectionScenario = detectionChoice(byScenario);
  const detection = detectionScenario ? byScenario[detectionScenario].fields : {};
  const inclusion = byScenario['extend-immediate']?.fields ?? {};
  const close = byScenario['ledger-close']?.fields ?? {};
  const recommendation = recommendRetryMargin({
    detectionSeconds: detection.seconds ?? null,
    inclusionSeconds: inclusion.seconds ?? null,
    closeSeconds: close.seconds ?? null,
    detectionLedgers: detection.ledgers ?? null,
    inclusionLedgers: inclusion.ledgers ?? null,
    detectionScenario,
  });
  const summary = {
    status: 'submitted',
    writes: true,
    out: parsed.out,
    sourcePublic: keypair.publicKey(),
    contractId: subject?.contractId ?? null,
    protocolVersion: network.protocolVersion,
    recommendation,
    scenarios: byScenario,
    undetermined: undetermined(byScenario, subject, recommendation),
  };
  return summary;
}

function undetermined(byScenario, subject, recommendation) {
  const missing = [];
  if (!subject) missing.push('extend and restore: no ephemeral contract data entry was deployed');
  else
    missing.push(
      'restore of an archived contract data entry: the fresh persistent entry was still live',
    );
  for (const name of [
    'extend-immediate',
    'extend-delayed',
    'extend-underdeclared',
    'bad-seq',
    'insufficient-fee',
    'late-submit',
    'unincludeable',
    'ledger-close',
    'get-fee-stats',
  ]) {
    if (!byScenario[name] || byScenario[name].n < 1) missing.push(`${name}: no rows`);
  }
  if (recommendation.status !== 'measured')
    missing.push('retry margin: a required percentile was absent');
  return missing;
}

async function main() {
  const result = await runMeasurement();
  process.stdout.write(`${JSON.stringify(result, jsonReplacer, 2)}\n`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    process.stderr.write(`${redact(error?.stack || error)}\n`);
    process.exitCode = 1;
  });
}
