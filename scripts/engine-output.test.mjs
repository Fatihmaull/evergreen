import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { formatEngineRun } from './engine-output.mjs';

function run(
  health = 'warning',
  needsAction = false,
  action = 'skip',
  reason = 'Above action threshold; warning only, no bump needed.',
) {
  return {
    mode: 'dry-run',
    scan: { network: 'testnet', contracts: [{ id: 'A' }], entries: {}, issues: [] },
    decisions: [
      {
        action,
        entryKey: 'key',
        contracts: ['A'],
        reason,
        ...(action === 'extend' ? { payer: 'payer', extendToLedgers: 518400 } : {}),
      },
    ],
    liveness: { isAlarm: needsAction, findings: [] },
    health: {
      byEntry: {
        key: {
          health,
          needsAction,
          isExpired: false,
          observedContractCount: 1,
          blastRadiusAtLeast: 1,
          sharingStatus: 'exclusive',
          reason,
        },
      },
      thresholdsByEntry: { key: { warnBelowLedgers: 120960, criticalBelowLedgers: 17280 } },
    },
  };
}
describe('engine output — visible early warning and actual decisions', () => {
  it('shows warning and effective horizons without claiming a bump', () => {
    const output = formatEngineRun(run());
    assert.match(output, /would-extend=0/);
    assert.match(output, /WARNING/);
    assert.match(output, /warning=120960.*action=17280/);
    assert.match(output, /action-needed=no/);
    assert.match(output, /SKIP/);
  });
  it('does not turn high impact into an action', () => {
    const output = formatEngineRun(run('critical', false));
    assert.match(output, /CRITICAL/);
    assert.match(output, /action-needed=no/);
    assert.match(output, /would-extend=0/);
  });
  it('retains a guard refusal even when the entry needs action', () => {
    const output = formatEngineRun(run('critical', true, 'skip', 'REFUSED BY WRITE GUARD'));
    assert.match(output, /action-needed=yes/);
    assert.match(output, /REFUSED BY WRITE GUARD/);
    assert.match(output, /would-extend=0/);
  });
  it('reports a candidate without implying that it was executed', () => {
    const output = formatEngineRun(run('critical', true, 'extend'));
    assert.match(output, /mode=dry-run/);
    assert.match(output, /would-extend=1/);
    assert.match(output, /EXTEND/);
    assert.doesNotMatch(output, /succeeded|submitted/i);
  });
});
