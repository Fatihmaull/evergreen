/**
 * core must scan correctly where Node's global `Buffer` does not exist — a browser.
 *
 * #194 / W4-D22-11. `scanContract` validated every ledger key with the bare
 * global `Buffer`. In a real browser that is a `ReferenceError`, caught and
 * reported as "RPC returned a malformed ledger key", so a scan of guinea-pig A
 * returned ZERO entries and a rent of "0" — well-formed, wrong, and silent.
 * Measured in headless Chrome 152 on 2026-09-17.
 *
 * Every other test in this package runs on Node, where `Buffer` is always
 * present, so they passed while the bug shipped to the one surface a reviewer
 * with "minimal technical expertise" would actually open: the dashboard.
 *
 * This file removes the global for its duration, which is the browser's
 * condition. The Stellar SDK is unaffected — it carries its own `Buffer` — so
 * only code that leans on the Node global can fail here. That is the property
 * under test.
 */
import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scanContract } from '../src/scan-contract.js';
import type { RawLedgerEntry } from '../src/rpc.js';
import { createMockReader } from './mock-rpc.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url), 'utf8'),
) as {
  result: {
    latestLedger: number;
    entries: { key: string; xdr: string; liveUntilLedgerSeq: number }[];
  };
};
const recorded: RawLedgerEntry[] = fixture.result.entries.map((e) => ({
  key: e.key,
  entryXdr: e.xdr,
  liveUntilLedgerSeq: e.liveUntilLedgerSeq,
}));
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const DATA_KEYS = recorded.slice(2).map((e) => e.key);
const reader = () => createMockReader(fixture.result.latestLedger, recorded);

describe('scanContract without a global Buffer (the browser condition)', () => {
  const saved = globalThis.Buffer;
  beforeAll(() => {
    // @ts-expect-error — removing a Node global on purpose, to be a browser.
    delete globalThis.Buffer;
  });
  afterAll(() => {
    globalThis.Buffer = saved;
  });

  it('really has no global Buffer, so this file is testing what it claims to', () => {
    expect(typeof globalThis.Buffer).toBe('undefined');
  });

  it('finds the instance and code entries, as it does on Node', async () => {
    const result = await scanContract(reader(), { id: A });
    expect(
      Object.values(result.entries)
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['code', 'instance']);
    expect(result.issues.map((i) => i.kind)).not.toContain('invalid-response');
  });

  it('accepts the contract’s committed data keys and returns all four kinds', async () => {
    const result = await scanContract(reader(), { id: A }, DATA_KEYS);
    expect(
      Object.values(result.entries)
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['code', 'instance', 'persistent', 'temporary']);
  });

  // The strictness the Buffer round trip existed for must survive the fix: a
  // lenient decoder "repairs" bad input, and a repaired key is a different key.
  //
  // PARITY with Node, measured rather than assumed: on Node WITH Buffer, an
  // invalid key does not throw — the scan resolves and records it as
  // `invalid-response`. An earlier draft of this test asserted a rejection,
  // which is a behaviour that never existed; it would have failed after the
  // fix and invited "fixing" the code into throwing, silently changing its
  // contract. These cases pass before the fix too, by design: they are a
  // no-regression guard, not a detector of the bug.
  //
  // And they do NOT isolate the base64 check. Measured by mutation: replacing
  // `btoa(atob(text)) === text` with something that accepts anything leaves all
  // seven passing, because the XDR round trip on the next line
  // (`key.toXDR('base64') !== text`) is what actually refuses these inputs. The
  // base64 check is defence in depth, and an earlier version of this comment
  // claimed these cases would catch its removal. They would not.
  it.each([
    ['an invalid character', `${DATA_KEYS[0]!.slice(0, -4)}*AA=`],
    ['missing padding', DATA_KEYS[0]!.replace(/=+$/, '')],
    ['embedded whitespace', `${DATA_KEYS[0]!.slice(0, 8)} ${DATA_KEYS[0]!.slice(8)}`],
    ['empty', ''],
  ])('still refuses a key with %s, exactly as it does on Node', async (_label, bad) => {
    const result = await scanContract(reader(), { id: A }, [bad]);
    expect(result.issues.map((i) => i.kind)).toContain('invalid-response');
    expect(Object.keys(result.entries)).not.toContain(bad);
  });
});
