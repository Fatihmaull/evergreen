import type { StorageAdviceReport } from '@evergreen-stellar/core';

/** Present provenance with the advice: benchmark amounts never look like this key's quote. */
export function formatStorageAdvice(report: StorageAdviceReport): string[] {
  const lines = ['Storage advice — observed keys only'];
  const settings = report.context.settings;
  if (settings) {
    lines.push(
      `Network minimum lifetimes at ledger ${settings.observedAtLedger}: temporary ${settings.minTemporaryTtl}, persistent ${settings.minPersistentTtl} ledgers.`,
    );
  } else {
    const old = report.evidence.settings;
    lines.push(
      `Historical minimum lifetimes (${old.recordedOn}, ledger ${old.observedAtLedger}; not current configuration): temporary ${old.minTemporaryTtl}, persistent ${old.minPersistentTtl} ledgers.`,
      `Source: ${old.source}`,
    );
  }
  lines.push(
    'Minimum lifetime includes the current ledger; it is not the expiry of an already-existing entry.',
  );
  for (const finding of report.findings) {
    lines.push(
      '',
      `${finding.code}: ${finding.entryKey}`,
      `Known consumers: ${finding.knownConsumers.join(', ')}`,
      `Action: ${finding.action}`,
      `Why: ${finding.rationale}`,
    );
    if (finding.ttl.status === 'known')
      lines.push(
        `Observed at ledger ${finding.observedAtLedger}: ${finding.ttl.remainingLedgers} remaining; last live ledger ${finding.ttl.endsAtLedger}.`,
      );
    if (finding.currentRent.status === 'quoted') {
      const quote = report.context.quote!;
      lines.push(
        `Current rent quote: ${finding.currentRent.stroops} stroops; pricing context ledger ${quote.pricedAtLedger}, requested increment ${quote.additionalLedgers}. Estimate, not a price guarantee; excludes other transaction fees.`,
      );
    } else lines.push('Current rent: unavailable (not zero).');
  }
  if (report.findings.some((f) => f.benchmarkId !== undefined)) {
    const benchmark = report.evidence.rent;
    lines.push(
      '',
      `Historical A benchmark (${benchmark.recordedAt}): persistent rent ${benchmark.persistent.rentStroops} versus temporary rent ${benchmark.temporary.rentStroops} stroops; about 1.95x.`,
      benchmark.qualification,
      `Source: ${benchmark.source}`,
    );
  }
  if (report.findings.some((f) => f.code === 'temporary-retention')) {
    const deletion = report.evidence.deletion;
    lines.push(
      `Observed deletion reference: ${deletion.subject} (${deletion.recordedOn}); present at ${deletion.lastLiveLedger}, absent at ${deletion.firstAbsentLedger}.`,
      `Source: ${deletion.source}`,
    );
  }
  lines.push('', ...report.limitations.map((note) => `Limit: ${note}`));
  return lines;
}
