/** W3-D15-02 validation: public Testnet reads only, no transaction APIs. */
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { connectTestnet, loadConfig, runEngine } from '../../../packages/core/dist/index.js';
const output = fileURLToPath(new globalThis.URL('.', import.meta.url));
const original = JSON.parse(readFileSync(new globalThis.URL('../../../evergreen.config.dogfood.json', import.meta.url), 'utf8'));
const raw = { ...original, mode: 'dry-run', defaults: { ...original.defaults, warnBelowLedgers: 2000000 } };
const { config, warnings } = loadConfig(JSON.stringify(raw));
assert.equal(config.contracts.length, 1);
assert.equal(config.contracts[0].id, 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L');
writeFileSync(`${output}validation-config.json`, JSON.stringify(config, null, 2) + '\n', { flag: 'wx' });
const connection = await connectTestnet(config.network.rpcUrl);
let count = 0;
const reader = { async read(keys) {
  const response = await connection.read(keys);
  // Normalized reader snapshots, not raw RPC transaction receipts.
  writeFileSync(`${output}read-${++count}.json`, JSON.stringify({ keys, response }, null, 2) + '\n', { flag: 'wx' });
  return response;
} };
const result = await runEngine(reader, config);
writeFileSync(`${output}result.json`, JSON.stringify({ warnings, result }, null, 2) + '\n', { flag: 'wx' });
assert.equal(result.mode, 'dry-run');
assert.equal(result.liveness.isAlarm, false);
assert.equal(result.decisions.length, 2);
assert.ok(result.decisions.every(d => d.action === 'skip'));
for (const [key, assessment] of Object.entries(result.health.byEntry)) {
  assert.equal(assessment.health, 'warning');
  assert.equal(assessment.needsAction, false);
  assert.deepEqual(result.health.thresholdsByEntry[key], { warnBelowLedgers: 2000000, criticalBelowLedgers: 17280 });
}
writeFileSync(`${output}verified.txt`, 'A instance/code show warning; no action candidates or liveness alarm. No signing or submission.\n', { flag: 'wx' });
