// Evidence transport: Testnet reads, simulation, and at most one explicitly approved send.
import { writeFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import process from 'node:process';
import { URL } from 'node:url';
import { verifyEnvelope, key, Networks } from './verify-envelope.mjs';
const output = resolve(process.env.EVERGREEN_CAPTURE_DIR);
mkdirSync(output, { recursive: true });
const originalFetch = globalThis.fetch;
let count = 0;
let networkVerified = false;
let before;
let simulated;
let sentHash;
const live = process.env.EVERGREEN_PROOF_MODE === 'live' && process.argv.includes('--submit');
globalThis.fetch = async (input, init) => {
  const address = String(input instanceof globalThis.Request ? input.url : input);
  if (address !== 'https://soroban-testnet.stellar.org/') throw new Error('Testnet capture only');
  const body = typeof init?.body === 'string' ? init.body : input instanceof globalThis.Request ? await input.clone().text() : '';
  const request = JSON.parse(body);
  const allowed = ['getNetwork', 'getLedgerEntries', 'simulateTransaction'];
  if (live) allowed.push('sendTransaction', 'getTransaction');
  if (!allowed.includes(request.method)) throw new Error('Capture refuses method');
  if (request.method !== 'getNetwork' && !networkVerified) throw new Error('Network not verified');
  if (request.method === 'simulateTransaction') {
    simulated = verifyEnvelope(request.params.transaction, before);
  }
  if (request.method === 'sendTransaction') {
    if (!simulated || sentHash) throw new Error('No approved simulation or send already attempted');
    const decoded = verifyEnvelope(request.params.transaction, before, true);
    if (decoded.sequence !== simulated.sequence || decoded.target !== simulated.target) throw new Error('Simulation intent changed');
    // Exclusive creation survives process failure/restarts. Never automatically retry a send.
    writeFileSync(new URL('send-attempt.json', import.meta.url), JSON.stringify({ ...decoded, before, at:new Date().toISOString() }, null, 2)+'\n', { flag:'wx' });
    sentHash = decoded.hash;
  }
  if (request.method === 'getTransaction' && request.params.hash !== sentHash) throw new Error('Unexpected confirmation hash');
  const prefix = `${String(++count).padStart(2, '0')}-${request.method}`;
  writeFileSync(`${output}/${prefix}-request.json`, body, { flag: 'wx' });
  const response = await originalFetch(input, init);
  const raw = await response.clone().text();
  writeFileSync(`${output}/${prefix}-response.json`, raw, { flag: 'wx' });
  const result = JSON.parse(raw).result;
  if (request.method === 'getNetwork') {
    if (result?.passphrase !== Networks.TESTNET) throw new Error('Wrong network');
    networkVerified = true;
  }
  if (request.method === 'getLedgerEntries') {
    const entry = result?.entries?.find(e=>e.key === key);
    if (entry && !simulated) before = { ledger:result.latestLedger, endsAt:entry.liveUntilLedgerSeq };
  }
  return response;
};
