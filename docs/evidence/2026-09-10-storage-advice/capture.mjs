import { mkdirSync, writeFileSync } from 'node:fs';
import { URL } from 'node:url';
import process from 'node:process';

const output = new URL(process.argv.includes('--json') ? './json-run/' : './human-run/', import.meta.url).pathname;
mkdirSync(output, { recursive: true });
const originalFetch = globalThis.fetch;
let sequence = 0;
globalThis.fetch = async (input, init) => {
  const address = String(input instanceof globalThis.Request ? input.url : input);
  if (address !== 'https://soroban-testnet.stellar.org/') throw new Error('Capture only permits the public Testnet endpoint');
  const body = typeof init?.body === 'string' ? init.body : input instanceof globalThis.Request ? await input.clone().text() : '';
  const request = JSON.parse(body);
  if (!['getNetwork', 'getLedgerEntries'].includes(request.method)) throw new Error('Capture refuses simulation and writes');
  const prefix = `${String(++sequence).padStart(2, '0')}-${request.method}`;
  writeFileSync(`${output}/${prefix}-request.json`, body);
  const response = await originalFetch(input, init);
  writeFileSync(`${output}/${prefix}-response.json`, await response.clone().text());
  return response;
};
