import assert from 'node:assert/strict';
import { test } from 'node:test';
import { xdr } from '@stellar/stellar-sdk';
import {
  FUTURENET_PASSPHRASE,
  MAINNET_PASSPHRASE,
  TESTNET_PASSPHRASE,
  TESTNET_RPC_URL,
  assertNoSecret,
  assertTestnetOnly,
  inclusionFeeCharged,
  ledgerCloseDeltas,
  parseArgs,
  recommendRetryMargin,
  redact,
  summarize,
  toCsv,
  txResultCode,
} from './retry-margin.mjs';
import { runMeasurement } from './measure-retry-margin.mjs';

const allowed = {
  network: 'testnet',
  rpcUrl: TESTNET_RPC_URL,
  passphrase: TESTNET_PASSPHRASE,
};

test('mainnet guard mutation proof', () => {
  assert.doesNotThrow(() => assertTestnetOnly(allowed));
  const mutations = [
    ['network', 'mainnet'],
    ['network', 'public'],
    ['network', 'futurenet'],
    ['network', 'Testnet'],
    ['network', undefined],
    ['passphrase', MAINNET_PASSPHRASE],
    ['passphrase', FUTURENET_PASSPHRASE],
    ['passphrase', `${TESTNET_PASSPHRASE} `],
    ['passphrase', ''],
    ['rpcUrl', 'https://mainnet.sorobanrpc.com'],
    ['rpcUrl', 'https://soroban-rpc.mainnet.stellar.gateway.fm'],
    ['rpcUrl', 'https://horizon.stellar.org'],
    ['rpcUrl', 'https://horizon-futurenet.stellar.org'],
    ['rpcUrl', 'https://soroban-futurenet.stellar.org'],
    ['rpcUrl', 'http://soroban-testnet.stellar.org'],
    ['rpcUrl', 'https://soroban-testnet.stellar.org.evil.example'],
    ['rpcUrl', 'https://user:secret@soroban-testnet.stellar.org'],
    ['rpcUrl', 'not a url'],
  ];
  for (const [key, value] of mutations) {
    assert.throws(
      () => assertTestnetOnly({ ...allowed, [key]: value }),
      (error) => error.code === 'REFUSED_NETWORK' && /Refusing to run/.test(error.message),
      `mutation ${key}=${String(value)} must be refused`,
    );
  }
});

test('the guard refuses before any rpc client is constructed', async () => {
  const calls = { server: 0, friendbot: 0, write: 0 };
  const boom = (name) => () => {
    calls[name] += 1;
    throw new Error(`must not ${name}`);
  };
  const argvSets = [
    ['--network', 'mainnet', '--submit'],
    ['--network', 'futurenet', '--submit'],
    ['--submit'],
    ['--network', 'testnet', '--submit', '--rpc-url', 'https://mainnet.sorobanrpc.com'],
    [
      '--network',
      'testnet',
      '--submit',
      '--passphrase',
      'Public Global Stellar Network ; September 2015',
    ],
  ];
  for (const argv of argvSets) {
    await assert.rejects(
      runMeasurement({
        argv,
        createServer: boom('server'),
        friendbot: boom('friendbot'),
        writeFile: boom('write'),
      }),
    );
  }
  assert.deepEqual(calls, { server: 0, friendbot: 0, write: 0 });
});

test('a live getNetwork passphrase mutation stops before friendbot', async () => {
  let friendbotCalls = 0;
  let sends = 0;
  await assert.rejects(
    runMeasurement({
      argv: ['--network', 'testnet', '--submit', '--runs', '1'],
      createServer: () => ({
        getNetwork: async () => ({
          passphrase: MAINNET_PASSPHRASE,
          friendbotUrl: 'https://friendbot.stellar.org/',
        }),
        sendTransaction: async () => {
          sends += 1;
          return { status: 'ERROR' };
        },
      }),
      friendbot: async () => {
        friendbotCalls += 1;
        return { ok: true };
      },
      writeFile: () => {
        throw new Error('must not write');
      },
    }),
    /not the Stellar testnet passphrase/,
  );
  assert.equal(friendbotCalls, 0);
  assert.equal(sends, 0);
});

test('dry-run is the default and does not touch the network or the disk', async () => {
  const result = await runMeasurement({
    argv: [],
    createServer() {
      throw new Error('network');
    },
    friendbot() {
      throw new Error('friendbot');
    },
    writeFile() {
      throw new Error('write');
    },
  });
  assert.equal(result.status, 'dry-run');
  assert.equal(result.writes, false);
  assert.equal(result.network, null);
});

test('parseArgs requires an explicit testnet flag before submit', () => {
  assert.equal(parseArgs([]).mode, 'dry-run');
  assert.equal(parseArgs(['--network', 'testnet']).mode, 'dry-run');
  assert.equal(parseArgs(['--network', 'testnet', '--submit']).mode, 'submit');
  assert.throws(() => parseArgs(['--submit']));
  assert.throws(() => parseArgs(['--network', 'mainnet', '--submit']));
});

test('summarize reports min median p95 and max and invents nothing for an empty sample', () => {
  const summary = summarize([
    5, 1, 4, 2, 3, 9, 8, 7, 6, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  ]);
  assert.equal(summary.n, 20);
  assert.equal(summary.min, 1);
  assert.equal(summary.median, 10.5);
  assert.equal(summary.p95, 19);
  assert.equal(summary.max, 20);
  assert.equal(summarize([]), null);
  assert.equal(summarize(['nope', Number.NaN]), null);
});

test('the recommendation is the sum of the measured p95s plus one ledger, or undetermined', () => {
  const one = { n: 20, min: 1, median: 2, p95: 4, max: 9 };
  const close = { n: 20, min: 4, median: 5, p95: 6, max: 7 };
  const inclusionLedgers = { n: 20, min: 1, median: 1, p95: 2, max: 3 };
  const detectionLedgers = { n: 20, min: 0, median: 1, p95: 1, max: 2 };
  const recommended = recommendRetryMargin({
    detectionSeconds: one,
    inclusionSeconds: one,
    closeSeconds: close,
    detectionLedgers,
    inclusionLedgers,
    detectionScenario: 'extend-underdeclared',
  });
  assert.equal(recommended.status, 'measured');
  assert.equal(recommended.seconds, 4 + 4 + 6);
  assert.equal(recommended.ledgers, 1 + 2 + 1);
  assert.equal(recommended.safetyLedgers, 1);
  assert.equal(recommended.safetySeconds, 6);
  const missing = recommendRetryMargin({
    detectionSeconds: one,
    inclusionSeconds: null,
    closeSeconds: close,
    detectionLedgers,
    inclusionLedgers,
  });
  assert.equal(missing.status, 'undetermined');
  assert.deepEqual(missing.missing, ['inclusionSeconds']);
  assert.equal(missing.seconds, null);
  assert.equal(missing.ledgers, null);
});

test('ledger close deltas use the recorded close times and skip a non-numeric one', () => {
  const deltas = ledgerCloseDeltas([
    { sequence: 12, ledgerCloseTime: '200' },
    { sequence: 10, ledgerCloseTime: '190' },
    { sequence: 11, ledgerCloseTime: '195' },
    { sequence: 13, ledgerCloseTime: 'later' },
  ]);
  assert.deepEqual(deltas, [
    { seconds: 5, ledgers: 1, sequenceFrom: 10, sequenceTo: 11 },
    { seconds: 5, ledgers: 1, sequenceFrom: 11, sequenceTo: 12 },
  ]);
});

test('the documented sendTransaction error XDR decodes as txBadSeq and feeCharged 100', () => {
  const result = xdr.TransactionResult.fromXDR('AAAAAAAAAGT////7AAAAAA==', 'base64');
  assert.equal(txResultCode(result), 'txBadSeq');
  assert.equal(result.feeCharged, 100n);
});

test('inclusion fee is feeCharged minus the two resource components, never a negative stand-in', () => {
  const parts = { nonRefundable: 1215n, refundable: 34084n, rent: 34074n };
  assert.equal(inclusionFeeCharged(35400n, parts), 101n);
  assert.equal(inclusionFeeCharged(1000n, parts), null);
  assert.equal(inclusionFeeCharged(35400n, null), null);
});

test('csv output redacts and then refuses a secret seed', () => {
  const seed = `S${'A'.repeat(55)}`;
  assert.equal(redact(`key ${seed} end`).includes(seed), false);
  assert.throws(() => assertNoSecret(seed));
  assert.throws(() =>
    toCsv([
      {
        scenario: 'bad-seq',
        note: seed,
      },
    ]),
  );
  const csv = toCsv([
    {
      scenario: 'ledger-close',
      run: 1,
      seconds: 5,
      note: 'comma, and "quote"',
    },
  ]);
  assert.match(csv, /ledger-close/);
  assert.equal(csv.includes('SAAAA'), false);
  assert.match(csv, /"comma, and ""quote"""/);
});
