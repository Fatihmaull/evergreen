import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseStateArchivalSettings, resolveExtendTarget } from '../src/network-config.js';

const recorded = JSON.parse(
  readFileSync(
    new URL('./fixtures/state-archival-settings-2026-09-05.json', import.meta.url),
    'utf8',
  ),
) as { result: { entries: { xdr: string }[]; latestLedger: number } };

const settings = parseStateArchivalSettings(
  recorded.result.entries[0]!.xdr,
  recorded.result.latestLedger,
);

describe('parseStateArchivalSettings — read from the chain, not hardcoded', () => {
  it('decodes the protocol ceiling', () => {
    expect(settings.maxEntryTtl).toBe(3_110_400);
  });

  it('decodes the TTL floors the primer records', () => {
    expect(settings.minTemporaryTtl).toBe(720);
    expect(settings.minPersistentTtl).toBe(120_960);
  });

  it('confirms the durability ratio the fee fixture MEASURED', () => {
    // The fixture measured persistent rent at 1.952x temporary on byte-identical
    // entries and called durability a first-order term. The protocol says the
    // same thing outright: the rate denominators are exactly 2:1, so the
    // residual in the measurement is the flat components, not noise.
    expect(Number(settings.temporaryRentRateDenominator)).toBe(
      Number(settings.persistentRentRateDenominator) * 2,
    );
  });

  it('rejects an entry that is not a state-archival setting', () => {
    // 'AAAAAA==' decodes to a different LedgerEntryData arm.
    expect(() => parseStateArchivalSettings('AAAAAA==', 1)).toThrow();
  });
});

describe('resolveExtendTarget — the CLI absorbs delta-to-target', () => {
  const max = settings.maxEntryTtl;

  it('turns "N more ledgers" into an absolute target', () => {
    const r = resolveExtendTarget({
      currentRemainingLedgers: 100_000,
      additionalLedgers: 50_000,
      maxEntryTtl: max,
    });
    expect(r.extendToLedgers).toBe(150_000);
    expect(r.wasCapped).toBe(false);
  });

  it('🔴 caps at the protocol ceiling and SAYS it capped', () => {
    // Silently handing back a smaller extension than requested while reporting
    // success is the same shortfall shape as passing a delta where a target
    // belongs. Worse here: simulation does not clamp, so an uncapped request
    // gets quoted for an extension that cannot happen.
    const r = resolveExtendTarget({
      currentRemainingLedgers: 3_000_000,
      additionalLedgers: 1_000_000,
      maxEntryTtl: max,
    });
    expect(r.extendToLedgers).toBe(max);
    expect(r.wasCapped).toBe(true);
    expect(r.requestedLedgers).toBe(4_000_000);
  });

  it('does not report capping when the request lands exactly on the ceiling', () => {
    const r = resolveExtendTarget({
      currentRemainingLedgers: max - 1,
      additionalLedgers: 1,
      maxEntryTtl: max,
    });
    expect(r.extendToLedgers).toBe(max);
    expect(r.wasCapped).toBe(false);
  });

  it('treats an already-expired entry as zero remaining, not as a subtraction', () => {
    const r = resolveExtendTarget({
      currentRemainingLedgers: -5_000,
      additionalLedgers: 100_000,
      maxEntryTtl: max,
    });
    expect(r.extendToLedgers).toBe(100_000);
  });

  it('refuses a non-positive request and a hardcoded-looking ceiling', () => {
    expect(() =>
      resolveExtendTarget({ currentRemainingLedgers: 1, additionalLedgers: 0, maxEntryTtl: max }),
    ).toThrow(/positive integer/);
    expect(() =>
      resolveExtendTarget({ currentRemainingLedgers: 1, additionalLedgers: 1, maxEntryTtl: 0 }),
    ).toThrow(/from the network/);
  });
});

describe('readStateArchivalSettings — the network path', () => {
  it('reads and decodes the config entry the chain returns', async () => {
    const { readStateArchivalSettings } = await import('../src/network-config.js');
    const { xdr } = await import('@stellar/stellar-sdk');
    const fake = {
      getLedgerEntries: () =>
        Promise.resolve({
          latestLedger: 4_600_000,
          entries: [
            { val: xdr.LedgerEntryData.fromXDR(recorded.result.entries[0]!.xdr, 'base64') },
          ],
        }),
    } as unknown as Parameters<typeof readStateArchivalSettings>[0];
    const s = await readStateArchivalSettings(fake);
    expect(s.maxEntryTtl).toBe(3_110_400);
    expect(s.observedAtLedger).toBe(4_600_000);
  });

  it('🔴 refuses an empty response rather than defaulting the ceiling', async () => {
    // Defaulting max_entry_ttl would be a hardcoded constant sneaking back in
    // through an error path — and the primer says it is network configuration.
    const { readStateArchivalSettings } = await import('../src/network-config.js');
    const empty = {
      getLedgerEntries: () => Promise.resolve({ latestLedger: 1, entries: [] }),
    } as unknown as Parameters<typeof readStateArchivalSettings>[0];
    await expect(readStateArchivalSettings(empty)).rejects.toThrow(/no state-archival config/);
  });
});
