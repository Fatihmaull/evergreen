import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { xdr, Address } from '@stellar/stellar-sdk';
export const RPC_URL = 'https://soroban-testnet.stellar.org';
export const sha = (value) => createHash('sha256').update(value).digest('hex');
export async function runtimeHashes() {
  const files = [
    'scripts/b-crossing-probe.mjs',
    'scripts/capture-crossing-probe.mjs',
    'scripts/verify-crossing-capture.mjs',
    'scripts/crossing-capture-common.mjs',
    'scripts/verify-evidence-integrity.mjs',
    'packages/core/package.json',
    'pnpm-lock.yaml',
    ...['B', 'C'].map(
      (s) => 'docs/evidence/2026-09-14-bc-control-verification/data-keys-' + s + '.json',
    ),
  ];
  for (const f of await readdir(new globalThis.URL('../packages/core/dist/', import.meta.url)))
    if (f.endsWith('.js')) files.push('packages/core/dist/' + f);
  const hashes = {};
  for (const f of files)
    hashes[f] = sha(await readFile(new globalThis.URL('../' + f, import.meta.url)));
  return hashes;
}
export async function controlKeys(label) {
  const { A, protectedSubject } = await import('./b-crossing-probe.mjs');
  const { instanceKey, SHARED_CODE_ENTRY_KEY } = await import('../packages/core/dist/index.js');
  const data = JSON.parse(
    await readFile(
      new globalThis.URL(
        '../docs/evidence/2026-09-14-bc-control-verification/data-keys-' + label + '.json',
        import.meta.url,
      ),
      'utf8',
    ),
  ).dataKeys;
  const address = new Address(protectedSubject(label).contractId).toScAddress().toXDR('base64');
  if (
    data.length !== 2 ||
    data.some((k) => {
      const decoded = xdr.LedgerKey.fromXDR(k, 'base64');
      return (
        decoded.type !== 'contractData' || decoded.contractData.contract.toXDR('base64') !== address
      );
    })
  )
    throw Error('Declared control owner mismatch');
  const persistent = data.find(
    (k) => xdr.LedgerKey.fromXDR(k, 'base64').contractData.durability.name === 'persistent',
  );
  const temporary = data.find(
    (k) => xdr.LedgerKey.fromXDR(k, 'base64').contractData.durability.name === 'temporary',
  );
  if (!persistent || !temporary) throw Error('Expected declared data keys');
  return {
    a: instanceKey(A),
    instance: instanceKey(protectedSubject(label).contractId),
    persistent,
    temporary,
    shared: SHARED_CODE_ENTRY_KEY,
  };
}
export async function collectObservation({ subject, threshold, rehearsal, server, now }) {
  const { runCrossingProbe } = await import('./b-crossing-probe.mjs');
  const probe = await runCrossingProbe({ subject, below: threshold, rehearsal, server, now });
  const keys = await controlKeys(subject);
  let controls = null;
  try {
    const r = await server.getLedgerEntries(
      ...Object.values(keys).map((k) => xdr.LedgerKey.fromXDR(k, 'base64')),
    );
    const returned = r.entries.map((e) => e.key.toXDR('base64'));
    if (
      new Set(returned).size !== returned.length ||
      returned.some((k) => !Object.values(keys).includes(k))
    )
      throw Error('Invalid control scope');
    for (const { key, val } of r.entries) {
      if (key.type !== val.type) throw Error('Control type mismatch');
      if (key.type === 'contractData') {
        if (
          key.contractData.contract.toXDR('base64') !== val.contractData.contract.toXDR('base64') ||
          key.contractData.key.toXDR('base64') !== val.contractData.key.toXDR('base64') ||
          key.contractData.durability.name !== val.contractData.durability.name
        )
          throw Error('Control data owner mismatch');
      } else if (key.type === 'contractCode') {
        if (!isDeepStrictEqual(key.contractCode.hash, val.contractCode.hash))
          throw Error('Control code hash mismatch');
      } else throw Error('Unexpected control type');
    }
    controls = {
      ledger: r.latestLedger,
      entries: r.entries.map((e) => ({
        key: e.key.toXDR('base64'),
        xdr: e.val.toXDR('base64'),
        endsAt: e.liveUntilLedgerSeq ?? null,
      })),
    };
  } catch {
    /* The successful producer output remains useful evidence of the attempted observation. */
  }
  return { probe, controls };
}
export async function classifyObservation(observation, manifest, baseline = null) {
  const { hasExpired, needsAction } = await import('../packages/core/dist/index.js');
  const { protectedSubject, ACTION_THRESHOLD } = await import('./b-crossing-probe.mjs');
  const bad = (reason) => ({ phase: 'unverified', qualifiesCrossing: false, reason });
  if (!observation) return bad('PROBE_FAILED');
  if (
    !manifest.provenance?.freshBuild ||
    !/^[a-f0-9]{40}$/.test(manifest.provenance?.sourceCommit ?? '')
  )
    return bad('UNPINNED_RUNTIME');
  const { probe, controls } = observation,
    keys = await controlKeys(manifest.subject);
  if (!controls) return bad('CONTROL_READ_FAILED');
  if (!Number.isSafeInteger(controls.ledger) || controls.ledger < 1) return bad('INVALID_LEDGER');
  const row = (k, c = controls) => c.entries.find((e) => e.key === k);
  const live = (e) =>
    e && Number.isSafeInteger(e.endsAt) && !hasExpired(e.endsAt - controls.ledger);
  if (!live(row(keys.a)) || !live(row(keys.shared))) return bad('CONTROL_UNAVAILABLE');
  if (
    probe.run.mode !== 'dry-run' ||
    probe.subject !== manifest.subject ||
    probe.below !== manifest.threshold ||
    probe.rehearsal !== manifest.rehearsal
  )
    return bad('PROBE_SCOPE_MISMATCH');
  if (!probe.run.decisions.some((d) => d.entryKey === keys.a)) return bad('A_DECISION_MISSING');
  const entry = probe.run.scan.entries[keys.instance];
  let phase;
  if (entry?.ttl.status === 'known') {
    const { observedAtLedger, ttl } = entry;
    if (
      controls.ledger < observedAtLedger ||
      ttl.endsAtLedger - observedAtLedger !== ttl.remainingLedgers ||
      hasExpired(ttl.remainingLedgers)
    )
      return bad('INVALID_SUBJECT_TTL');
    for (const key of [keys.instance, keys.persistent])
      if (!live(row(key))) return bad('SUBJECT_CONTROL_UNAVAILABLE');
    if (row(keys.instance).endsAt !== ttl.endsAtLedger) return bad('SUBJECT_EXPIRY_CHANGED');
    const d = probe.run.decisions.find((d) => d.entryKey === keys.instance);
    if (!d?.contracts.includes(probe.contractId)) return bad('SUBJECT_DECISION_MISSING');
    if (needsAction(ttl.remainingLedgers, manifest.threshold)) {
      if (d.action !== 'skip' || !d.reason.includes('REFUSED BY WRITE GUARD'))
        return bad('REFUSAL_MISSING');
      phase = 'crossing-refused';
    } else phase = 'before-action';
  } else {
    if (!baseline || baseline.manifest.subject !== manifest.subject)
      return bad('BASELINE_REQUIRED');
    for (const key of [keys.instance, keys.persistent]) {
      const previous = row(key, baseline.result.observation.controls);
      if (
        row(key) ||
        !previous ||
        !Number.isSafeInteger(previous.endsAt) ||
        !hasExpired(previous.endsAt - controls.ledger)
      )
        return bad('EXPIRY_NOT_PROVEN');
    }
    if (
      controls.ledger <= baseline.result.observation.controls.ledger ||
      row(keys.shared).endsAt !== row(keys.shared, baseline.result.observation.controls)?.endsAt
    )
      return bad('BASELINE_OR_CONTROL_CHANGED');
    phase = 'expiry-observed';
  }
  if (manifest.rehearsal) phase = 'rehearsal';
  return {
    phase,
    qualifiesCrossing:
      phase === 'crossing-refused' &&
      manifest.threshold === ACTION_THRESHOLD &&
      probe.observedAt.slice(0, 10) >= protectedSubject(manifest.subject).alertThresholdOn,
    reason: null,
  };
}

let transportHeld = false;
export function acquireCaptureTransport() {
  if (transportHeld) throw Error('Another capture/replay is active');
  transportHeld = true;
  return () => {
    transportHeld = false;
  };
}

export function captureStderr(probeExitCode, observation) {
  if (probeExitCode)
    return 'Crossing read failed; inspect retained RPC artifacts. No write was permitted.\n';
  if (observation && !observation.controls)
    return 'Control read failed; producer output is retained but does not qualify.\n';
  return '';
}
