import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { STORAGE_ADVICE_EVIDENCE } from '../src/optimizer-evidence.js';
import { parseStateArchivalSettings } from '../src/network-config.js';

describe('bundled optimizer evidence', () => {
  it('keeps recorded rent distinct from total transaction fees', () => {
    const raw = JSON.parse(
      readFileSync(new URL('./fixtures/extendTTL-fees-guinea-pig-a.json', import.meta.url), 'utf8'),
    ) as {
      recordedAt: string;
      extends: {
        kind: string;
        rentFeeCharged: number;
        feeCharged: number;
        entryDataBytes: number;
        ledgerKeyBytes: number;
        ledgersExtended: number;
      }[];
    };
    for (const kind of ['persistent', 'temporary'] as const) {
      const row = raw.extends.find((e) => e.kind === kind)!;
      const value = STORAGE_ADVICE_EVIDENCE.rent[kind];
      expect(value.rentStroops).toBe(String(row.rentFeeCharged));
      expect(value.totalFeeStroops).toBe(String(row.feeCharged));
      expect(value.dataBytes).toBe(row.entryDataBytes);
      expect(value.keyBytes).toBe(row.ledgerKeyBytes);
      expect(value.ledgersExtended).toBe(row.ledgersExtended);
    }
    expect(STORAGE_ADVICE_EVIDENCE.rent.recordedAt).toBe(raw.recordedAt);
    expect(STORAGE_ADVICE_EVIDENCE.rent.persistent.rentStroops).toBe('103849');
    expect(STORAGE_ADVICE_EVIDENCE.rent.temporary.rentStroops).toBe('53196');
  });
  it('bundles historical configured lifetimes rather than remaining samples', () => {
    const raw = JSON.parse(
      readFileSync(
        new URL('./fixtures/state-archival-settings-2026-09-05.json', import.meta.url),
        'utf8',
      ),
    );
    const actual = parseStateArchivalSettings(raw.result.entries[0].xdr, raw.result.latestLedger);
    expect(STORAGE_ADVICE_EVIDENCE.settings.minTemporaryTtl).toBe(actual.minTemporaryTtl);
    expect(STORAGE_ADVICE_EVIDENCE.settings.minPersistentTtl).toBe(actual.minPersistentTtl);
    expect(STORAGE_ADVICE_EVIDENCE.settings.observedAtLedger).toBe(actual.observedAtLedger);
    expect(STORAGE_ADVICE_EVIDENCE.settings.minTemporaryTtl).toBe(720);
  });
  it('attributes the adjacent-ledger disappearance to the isolated experiment', () => {
    const raw = JSON.parse(
      readFileSync(
        new URL(
          '../../../docs/evidence/2026-09-06-ttl-boundary/boundary-result.json',
          import.meta.url,
        ),
        'utf8',
      ),
    );
    expect(raw.status).toBe('confirmed');
    expect(raw.presentAtBoundary).toBe(true);
    expect(raw.presentAtNextLedger).toBe(false);
    expect(STORAGE_ADVICE_EVIDENCE.deletion.lastLiveLedger).toBe(raw.liveUntilLedgerSeq);
    expect(STORAGE_ADVICE_EVIDENCE.deletion.firstAbsentLedger).toBe(raw.liveUntilLedgerSeq + 1);
    expect(STORAGE_ADVICE_EVIDENCE.deletion.subject).toBe('isolated temporary-entry experiment');
  });
});
