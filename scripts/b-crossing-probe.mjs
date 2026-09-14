#!/usr/bin/env node
/**
 * The Sep 20 / Sep 25 crossing probe — produces the ONE record that
 * `check-crossing-evidence.mjs` demands and the scheduled cron cannot.
 *
 * Why this exists
 * ---------------
 * `docs/SEP-20-PREFLIGHT.md` said, until 2026-09-14, that leaving B in
 * `_doNotWatch` was enough because "the engine still scans and decides, the
 * guard still refuses". **It does not.** `_doNotWatch` is documentation —
 * `config.ts` says so in as many words — and `runEngine` iterates `contracts`.
 * Measured against the real dogfood config on 2026-09-14: 2 decisions, A's
 * instance and the shared code entry, B absent, no refusal anywhere.
 *
 * That left Saturday impossible to satisfy: the pre-flight required a
 * `REFUSED BY WRITE GUARD` line for B in the run record, the cron could never
 * emit one, and `check-crossing-evidence.mjs` fails `pnpm check` from the alert
 * threshold onward until that line is committed. A wall, on the one date in the
 * sprint that cannot be repeated.
 *
 * The fix is NOT to move B into the watched list. `_doNotWatch` and
 * `write-guard.ts` are deliberately two independent layers — "a misconfiguration
 * and a code path have to fail together" — and moving B into `contracts` spends
 * one of them for a log line. This probe builds its config IN MEMORY instead, so
 * there is no file on disk the cron could ever be pointed at, following the
 * 2026-09-12 first-run probe that established the pattern.
 *
 * Safety
 * ------
 * Read-only by construction: no payer is resolvable, no secret is read, and the
 * engine is decide-only — `runEngine` never signs or submits. The write guard
 * refuses B regardless. Running this against B is exactly as safe as scanning it.
 *
 * Usage
 * -----
 *   node scripts/b-crossing-probe.mjs                 # B, default 17,280 threshold
 *   SUBJECT=C node scripts/b-crossing-probe.mjs       # C, for the Sep 25 spare
 *   BELOW=1500000 node scripts/b-crossing-probe.mjs   # force candidacy before the crossing,
 *                                                     # to prove the refusal path off-date
 *
 * On the day, run it with NO `BELOW` — the point is that B is genuinely below
 * the real threshold. `BELOW` exists so the refusal can be rehearsed beforehand,
 * which is the only way to know this works before it has to.
 */

import { rpc, Networks } from '@stellar/stellar-sdk';
import console from 'node:console';
import process from 'node:process';
import { createRpcReader, runEngine, PROTECTED_ENTRIES } from '../packages/core/dist/index.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const label = (process.env.SUBJECT ?? 'B').toUpperCase();
const subject = PROTECTED_ENTRIES.find((p) => p.label.endsWith(label));
if (!subject) throw new Error(`No protected subject "${label}". Use B or C.`);

const below = Number(process.env.BELOW ?? 17_280);
if (!Number.isSafeInteger(below) || below <= 0) throw new Error('BELOW must be a positive integer');

const server = new rpc.Server('https://soroban-testnet.stellar.org', { timeout: 15_000 });
if ((await server.getNetwork()).passphrase !== Networks.TESTNET)
  throw new Error('Refusing to run: not Testnet.');

// A rides along deliberately. A run containing only a refusal cannot show that
// the engine was working — "refused everything" and "decided nothing" look alike.
const config = {
  network: { rpcUrl: 'in-memory', networkPassphrase: Networks.TESTNET },
  defaults: { bumpWhenRemainingLedgersBelow: below, extendToLedgers: 518_400 },
  contracts: [
    { id: A, label: 'guinea-pig-A', payer: 'none' },
    { id: subject.contractId, label: subject.label, payer: 'none' },
  ],
  payers: {},
  mode: 'dry-run',
};

const run = await runEngine(createRpcReader(server), config);

console.log(`# ${subject.label} crossing probe`);
console.log(`observed:   ${new Date().toISOString()}`);
console.log(`subject:    ${subject.contractId}`);
console.log(`expires:    ${subject.expiresOn} (alert threshold ${subject.alertThresholdOn})`);
console.log(
  `threshold:  ${below.toLocaleString()} ledgers${process.env.BELOW ? '  ⚠ RAISED — rehearsal, not the real crossing' : ''}`,
);
console.log(`mode:       ${run.mode}   decisions: ${run.decisions.length}\n`);

for (const d of run.decisions) {
  console.log(`${d.action.toUpperCase().padEnd(6)} ${d.entryKey}`);
  console.log(`       ${d.reason}`);
}

const refusal = run.decisions.find(
  (d) => d.reason.includes('REFUSED BY WRITE GUARD') && d.contracts?.includes(subject.contractId),
);

console.log('');
if (refusal) {
  console.log(`✓ ${subject.label} was REFUSED BY WRITE GUARD, and the refusal is in this record.`);
  console.log(
    '  Commit this output under docs/evidence/ — an artifact is a log, a commit is evidence.',
  );
} else {
  const seen = run.decisions.some((d) => d.contracts?.includes(subject.contractId));
  console.log(
    seen
      ? `ℹ ${subject.label} was seen but is still above the threshold, so nothing was attempted and\n` +
          '  the guard was never consulted. Before the crossing this is correct. ON THE DAY it means\n' +
          '  the crossing has not happened yet — re-run later, do not lower the threshold to force it.'
      : `✖ ${subject.label} did not appear in the run at all. That is the defect this probe exists for;\n` +
          '  do not proceed until it does.',
  );
}
console.log('\nNothing was signed and nothing was submitted.');
