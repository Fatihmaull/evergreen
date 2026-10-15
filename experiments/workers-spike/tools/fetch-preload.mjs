// Node preload for the REAL CLI binary (packages/cli/dist/bin.js). It wraps globalThis.fetch so the
// exact RPC bytes the CLI saw can be recorded, then replayed to both the CLI and the Worker.
// That pins both runtimes to identical chain data, which RPC cannot do itself
// (getLedgerEntries has no ledger parameter: it always answers at the latest ledger).
//   EG_MODE=record EG_FILE=rec.json   node --import ./tools/fetch-preload.mjs packages/cli/dist/bin.js ...
//   EG_MODE=replay EG_FILE=rec.json EG_NOW=<ISO>   (EG_NOW also freezes `new Date()` so human output is stable)
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
const mode = process.env.EG_MODE;
const file = process.env.EG_FILE;
const realFetch = globalThis.fetch.bind(globalThis);
let count = 0;
const rec = mode === 'replay' ? JSON.parse(readFileSync(file, 'utf8')) : existsSync(file ?? '') ? [] : [];
const keyOf = (url, body) => {
  let j = {};
  try { j = JSON.parse(body ?? '{}'); } catch {}
  return `${url}|${j.method}|${JSON.stringify(j.params ?? null)}`;
};
if (process.env.EG_NOW) {
  const fixed = new Date(process.env.EG_NOW).getTime();
  const RealDate = Date;
  globalThis.Date = class extends RealDate {
    constructor(...a) { super(...(a.length ? a : [fixed])); }
    static now() { return fixed; }
  };
}
globalThis.fetch = async (input, init) => {
  count++;
  const url = typeof input === 'string' ? input : input.url;
  const body = init?.body ?? (typeof input === 'object' && input.body ? await input.text() : undefined);
  if (mode === 'replay') {
    const hit = rec.find((r) => r.key === keyOf(url, body));
    if (!hit) throw new Error('replay miss: ' + keyOf(url, body).slice(0, 120));
    const id = JSON.parse(body).id;
    const out = JSON.parse(hit.res);
    out.id = id;
    return new Response(JSON.stringify(out), { status: hit.status, headers: { 'content-type': 'application/json' } });
  }
  const res = await realFetch(input, init);
  if (mode === 'record') {
    const text = await res.clone().text();
    rec.push({ key: keyOf(url, body), req: body, status: res.status, res: text });
  }
  return res;
};
process.on('exit', () => {
  if (mode === 'record') writeFileSync(file, JSON.stringify(rec, null, 1));
  if (process.env.EG_COUNT_FILE) writeFileSync(process.env.EG_COUNT_FILE, String(count));
});
