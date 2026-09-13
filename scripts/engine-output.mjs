/** Format the real decision pass without deriving action policy from its display severity. */
export function formatEngineRun(run) {
  const candidates = run.decisions.filter((d) => d.action === 'extend').length;
  const lines = [`mode=${run.mode} decisions=${run.decisions.length} would-extend=${candidates}`];
  for (const decision of run.decisions) {
    const assessment = run.health.byEntry[decision.entryKey];
    const thresholds = run.health.thresholdsByEntry[decision.entryKey];
    lines.push(`  ${decision.action.toUpperCase().padEnd(6)} ${decision.entryKey}`);
    lines.push(
      `         ${assessment.health.toUpperCase()} · warning=${thresholds.warnBelowLedgers} action=${thresholds.criticalBelowLedgers} ledgers · action-needed=${assessment.needsAction ? 'yes' : 'no'}`,
    );
    lines.push(`         ${decision.reason}`);
  }
  return lines.join('\n');
}
