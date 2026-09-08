import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { readerFromFixture } from './mock-rpc.js';
import { observeTTL } from '../src/ttl.js';

const FIXTURE = new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url).pathname;

/** The mock only returns keys it was asked for, so read them from the recording. */
function recordedKeys(): string[] {
  const parsed = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
    result: { entries: { key: string }[] };
  };
  return parsed.result.entries.map((e) => e.key);
}

/**
 * W1-D7-02. Runs against the unedited response recorded from guinea-pig A on
 * 2026-09-05 — real observed shapes, not invented ones. If the recorded shape
 * ever stops matching what we parse, this fails rather than the CLI failing in
 * front of a user.
 */
describe('recorded guinea-pig A fixture', () => {
  it('replays offline with the real latestLedger and every recorded entry', async () => {
    const res = await readerFromFixture(FIXTURE).read(recordedKeys());
    expect(res.latestLedger).toBe(4_512_641);
    expect(res.entries).toHaveLength(4);
  });

  it('returns nothing for keys it was not asked for', async () => {
    // The mock must not invent entries — a mock that returns unrequested data
    // would hide a real bug in the caller.
    const res = await readerFromFixture(FIXTURE).read([]);
    expect(res.entries).toHaveLength(0);
  });

  it('computes TTL from the real recorded values', async () => {
    const { entries } = await readerFromFixture(FIXTURE).read(recordedKeys());

    // The instance entry recorded at 4,633,568 against latestLedger 4,512,641.
    const instance = entries.find((e) => e.liveUntilLedgerSeq === 4_633_568);
    expect(instance).toBeDefined();
    expect(
      observeTTL({ liveUntilLedgerSeq: instance!.liveUntilLedgerSeq, observedAtLedger: 4_512_641 }),
    ).toMatchObject({ remainingLedgers: 120_927 });
  });

  it('preserves the optional liveUntilLedgerSeq rather than coercing it', async () => {
    const { entries } = await readerFromFixture(FIXTURE).read(recordedKeys());
    // Every recorded entry either has a number or genuinely lacks the field —
    // it must never arrive as 0, null or NaN.
    for (const e of entries) {
      expect(e.liveUntilLedgerSeq === undefined || Number.isInteger(e.liveUntilLedgerSeq)).toBe(
        true,
      );
    }
  });
});
