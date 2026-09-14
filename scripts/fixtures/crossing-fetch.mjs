import { readFileSync } from 'node:fs';
import {
  instanceKey,
  SHARED_CODE_ENTRY_KEY,
  STATE_ARCHIVAL_CONFIG_KEY,
} from '../../packages/core/dist/index.js';
export const subjects = {
  B: 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ',
  C: 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL',
};
const read = (file) =>
  JSON.parse(
    readFileSync(
      new globalThis.URL('../../packages/core/test/fixtures/' + file, import.meta.url),
      'utf8',
    ),
  ).result;
export function fixtureFetch({
  subject = 'B',
  remaining = 17280,
  fail = false,
  missingControl = false,
} = {}) {
  const raw = read('getLedgerEntries-bc-controls-2026-09-14.json');
  const target = raw.entries.find((e) => e.key === instanceKey(subjects[subject]));
  const ledger = target.liveUntilLedgerSeq - remaining;
  const a = read('getLedgerEntries-guinea-pig-a.json').entries[0];
  const setting = read('state-archival-settings-2026-09-05.json').entries[0];
  const rows = [{ ...a, liveUntilLedgerSeq: 6370261 }, ...raw.entries, setting]
    .filter((e) => e.liveUntilLedgerSeq === undefined || e.liveUntilLedgerSeq >= ledger)
    .filter((e) => !missingControl || e.key !== SHARED_CODE_ENTRY_KEY);
  const calls = [];
  const fetch = async (_url, opts) => {
    const req = JSON.parse(opts.body);
    calls.push(req.method);
    if (fail) throw Error('fixture network failure');
    let result;
    if (req.method === 'getNetwork')
      result = { passphrase: 'Test SDF Network ; September 2015', protocolVersion: 23 };
    else if (req.method === 'getLedgerEntries')
      result = {
        latestLedger: ledger,
        entries: rows.filter((e) => req.params.keys.includes(e.key)),
      };
    else throw Error('Unexpected method ' + req.method);
    return new globalThis.Response(JSON.stringify({ jsonrpc: '2.0', id: req.id, result }));
  };
  return {
    fetch,
    calls,
    ledger,
    endsAt: target.liveUntilLedgerSeq,
    settingKey: STATE_ARCHIVAL_CONFIG_KEY,
  };
}

export const fixtureProvenance = { sourceCommit: 'a'.repeat(40), freshBuild: true };
