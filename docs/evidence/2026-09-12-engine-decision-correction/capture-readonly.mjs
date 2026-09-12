/** W3-D15-04: read-only verification. No signing or transaction API is used. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { connectTestnet, loadConfig, runEngine, instanceKey, SHARED_CODE_ENTRY_KEY } from '../../../packages/core/dist/index.js';

const out = fileURLToPath(new globalThis.URL('.', import.meta.url));
const { config: original } = loadConfig(readFileSync(new globalThis.URL('../../../evergreen.config.dogfood.json', import.meta.url), 'utf8'));
assert.equal(original.contracts.length, 1);
const config = {
  ...original,
  mode: 'dry-run',
  contracts: original.contracts.map(c => ({ ...c, thresholds: { bumpWhenRemainingLedgersBelow: 1500000, extendToLedgers: 2000000 } })),
};
writeFileSync(`${out}validation-config.json`, JSON.stringify(config, null, 2) + '\n', {flag: 'wx'});
const live = await connectTestnet(config.network.rpcUrl);
let count = 0;
const reader = {
  async read(keys) {
    const response = await live.read(keys);
    // These are normalized LedgerEntryReader snapshots, not raw JSON-RPC receipts.
    writeFileSync(`${out}read-${++count}.json`, JSON.stringify({keys, response}, null, 2) + '\n', {flag: 'wx'});
    return response;
  },
};
const run = await runEngine(reader, config);
writeFileSync(`${out}result.json`, JSON.stringify(run, null, 2) + '\n', {flag: 'wx'});
const instance = run.decisions.find(d => d.entryKey === instanceKey(config.contracts[0].id));
assert.equal(run.mode, 'dry-run');
assert.equal(instance.action, 'extend');
assert.equal(instance.extendToLedgers, 2000000);
assert.equal(run.decisions.find(d => d.entryKey === SHARED_CODE_ENTRY_KEY).action, 'skip');
assert.equal(run.liveness.isAlarm, true);
writeFileSync(`${out}verified.txt`, 'Read-only A override: target 2000000, shared code refused, liveness alarm true. No signature or submission.\n', {flag: 'wx'});
