/** Small published evidence snapshot, included in the package, never loaded from test files. */
export const STORAGE_ADVICE_EVIDENCE = {
  rent: {
    id: 'guinea-pig-a-2026-09-09',
    recordedAt: '2026-09-09T10:58:52Z',
    source:
      'https://github.com/Fatihmaull/evergreen/blob/main/packages/core/test/fixtures/extendTTL-fees-guinea-pig-a.json',
    persistent: {
      rentStroops: '103849',
      totalFeeStroops: '106308',
      dataBytes: 88,
      keyBytes: 76,
      ledgersExtended: 1312937,
    },
    temporary: {
      rentStroops: '53196',
      totalFeeStroops: '55655',
      dataBytes: 88,
      keyBytes: 76,
      ledgersExtended: 1312939,
    },
    qualification:
      'Historical measured rent at equal encoded sizes over durations differing by two ledgers; not a quote or savings forecast for this entry.',
  },
  settings: {
    recordedOn: '2026-09-05',
    observedAtLedger: 4519665,
    minTemporaryTtl: 720,
    minPersistentTtl: 120960,
    source:
      'https://github.com/Fatihmaull/evergreen/blob/main/docs/evidence/2026-09-05-ttl-boundary/state-archival-settings.json',
  },
  deletion: {
    recordedOn: '2026-09-06',
    subject: 'isolated temporary-entry experiment',
    lastLiveLedger: 4529810,
    firstAbsentLedger: 4529811,
    source:
      'https://github.com/Fatihmaull/evergreen/blob/main/docs/evidence/2026-09-06-ttl-boundary/README.md',
  },
} as const;
