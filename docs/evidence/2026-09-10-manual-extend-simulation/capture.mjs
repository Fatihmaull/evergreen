import { URL } from 'node:url';
import { writeFileSync, mkdirSync } from 'node:fs';
const output = new URL('.', import.meta.url).pathname;
mkdirSync(output, { recursive: true });
const originalFetch = globalThis.fetch;
let count = 0;
globalThis.fetch = async (input, init) => {
  const address = String(input instanceof globalThis.Request ? input.url : input);
  if (address !== 'https://soroban-testnet.stellar.org/') throw new Error('Capture is Testnet-only');
  const body = typeof init?.body === 'string' ? init.body : input instanceof globalThis.Request ? await input.clone().text() : '';
  const request = JSON.parse(body);
  if (!['getNetwork','getLedgerEntries','simulateTransaction'].includes(request.method)) throw new Error('Capture refuses writes');
  const prefix = `${String(++count).padStart(2,'0')}-${request.method}`;
  writeFileSync(`${output}/${prefix}-request.json`, body);
  const response = await originalFetch(input, init);
  writeFileSync(`${output}/${prefix}-response.json`, await response.clone().text());
  return response;
};
