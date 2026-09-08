import { readFileSync } from 'node:fs';
import type { LedgerKey } from '@evergreen/shared-types';
import type { LedgerEntryReader, RawLedgerEntry } from '../src/rpc.js';

/**
 * Offline `LedgerEntryReader` for unit tests. Unit tests never touch the
 * network (`AGENTS.md` hard rule 9).
 *
 * It replays *recorded* responses rather than invented ones, and it can be told
 * to fail. A mock that only ever returns well-formed happy-path data tests
 * nothing — the same both-directions point as the testnet guard that refused
 * everything and looked fine. Absence, missing TTL, and transport failure are
 * the cases that actually matter, so they are first-class here.
 */

export interface MockOptions {
  /** Reject on read, to exercise the rpc-error path. */
  readonly failWith?: Error;
  /** Keys to silently omit from the response, to exercise entry-not-found. */
  readonly omit?: readonly LedgerKey[];
}

export function createMockReader(
  latestLedger: number,
  entries: readonly RawLedgerEntry[],
  options: MockOptions = {},
): LedgerEntryReader {
  return {
    read(keys) {
      if (options.failWith) return Promise.reject(options.failWith);
      const omit = new Set(options.omit ?? []);
      const wanted = new Set(keys);
      return Promise.resolve({
        latestLedger,
        // Only ever return what was asked for, minus what the test omits — a
        // mock that returns unrequested entries would hide a real bug.
        entries: entries.filter((e) => wanted.has(e.key) && !omit.has(e.key)),
      });
    },
  };
}

/**
 * Load the unedited `getLedgerEntries` response recorded from guinea-pig A on
 * 2026-09-05. Kept byte-for-byte — a reformatted recording is no longer a
 * recording — so this parses the real shape, including `liveUntilLedgerSeq`
 * being optional.
 */
export function readerFromFixture(path: string, options: MockOptions = {}): LedgerEntryReader {
  const parsed: unknown = JSON.parse(readFileSync(path, 'utf8'));
  const result = (parsed as { result: { latestLedger: number; entries: unknown[] } }).result;
  const entries: RawLedgerEntry[] = result.entries.map((e) => {
    const entry = e as { key: string; liveUntilLedgerSeq?: number };
    return { key: entry.key, liveUntilLedgerSeq: entry.liveUntilLedgerSeq };
  });
  return createMockReader(result.latestLedger, entries, options);
}
