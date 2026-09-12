#!/usr/bin/env node
/**
 * The fallback runner (`W3-D18-00`) — the same engine code, on a GitHub Actions
 * cron.
 *
 * **The unattended claim does not require the production scheduler.** What
 * `W3-D18-02a/b` must show is "the decision logic ran unattended, detected the
 * crossing, and acted with no human involved" — nothing in that sentence names
 * a platform. Building this early decouples an unrecoverable date (B's crossing,
 * ~2026-09-20) from an open deployment decision (ADR-003), and it makes the
 * engine's platform-independence a TESTED property rather than an assumed one
 * while the Cloudflare option's Stellar SDK compatibility is still unresolved.
 *
 * 🔴 **DECIDE-ONLY. This never signs and never submits.** Execution is
 * `W3-D16-01`. Keeping the cron read-only until that lands means an unattended
 * schedule cannot spend anything while nobody is watching.
 */
import { readFileSync } from 'node:fs';
import process from 'node:process';
import console from 'node:console';
import { rpc, Networks } from '@stellar/stellar-sdk';
// Imported from the BUILT core by relative URL, not by package name: the repo
// root is not a workspace member and cannot resolve `@evergreen-stellar/core`.
// Adding it as a root dependency would put the bundled-only package back into
// someone's dependency graph, which is the thing `private: true` exists to stop.
const { createRpcReader, loadConfig, runEngine } = await import(
  new globalThis.URL('../packages/core/dist/index.js', import.meta.url).href
);

const path = process.env.EVERGREEN_CONFIG ?? 'evergreen.config.json';
const { config, warnings } = loadConfig(readFileSync(path, 'utf8'));
for (const w of warnings) console.warn(`⚠ ${w}`);

const server = new rpc.Server(config.network.rpcUrl, { timeout: 15_000 });
const passphrase = (await server.getNetwork()).passphrase;
// The testnet guard, on the unattended path too. A scheduled job pointed at the
// wrong network is a safety event, not a connectivity one.
if (passphrase !== Networks.TESTNET) {
  console.error(`Refusing to run: RPC reports "${passphrase}", not Testnet.`);
  process.exit(2);
}

const run = await runEngine(createRpcReader(server), config);
const acted = run.decisions.filter((d) => d.action === 'extend');
const refused = run.decisions.filter((d) => d.reason.includes('REFUSED BY WRITE GUARD'));

console.log(`mode=${run.mode} decisions=${run.decisions.length} would-extend=${acted.length}`);
for (const d of run.decisions) {
  console.log(`  ${d.action.toUpperCase().padEnd(6)} ${d.entryKey}\n         ${d.reason}`);
}

// A refusal is a non-event — no transaction, no hash, nothing in an explorer.
// On ~2026-09-20 this line is the evidence for W3-D18-02b, so it is printed
// loudly and counted, not left to be inferred from an absence.
if (refused.length > 0) {
  console.log(`\n🔴 ${refused.length} write(s) REFUSED by the guard. This is expected for`);
  console.log('   guinea-pigs B and C and the shared code entry, and it is EVIDENCE:');
  console.log('   capture this log. A refusal leaves no other trace anywhere.');
}

if (run.liveness.isAlarm) {
  console.error(`\n✖ liveness alarm (${run.liveness.severity ?? 'unknown'}):`);
  for (const f of run.liveness.findings) console.error(`  ${f.severity}: ${f.reason}`);
  process.exit(1);
}
console.log('\n✓ run complete. Nothing was signed and nothing was submitted.');
