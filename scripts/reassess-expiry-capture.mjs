// Additive offline assessment: never replace the verdict inside a sealed v1 bundle.
import { readFile } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { isDeepStrictEqual } from 'node:util';
import { verifyEvidenceIntegrity } from './verify-evidence-integrity.mjs';
import { readVerifiedCapture } from './verify-crossing-capture.mjs';
import { controlKeys, runtimeHashes, sha } from './crossing-capture-common.mjs';
import { hasExpired } from '../packages/core/dist/index.js';

const CODES = new Set([
  'BASELINE_REQUIRED',
  'REHEARSAL_NOT_EVIDENCE',
  'UNSUPPORTED_RECORDED_VERDICT',
  'INVALID_OBSERVATION_ORDER',
  'CONTROL_UNAVAILABLE',
  'SHARED_CONTROL_CHANGED',
  'INVALID_LIVE_BASELINE',
  'EXPIRY_NOT_PROVEN',
  'NON_LIVE_REPRESENTATION_REQUIRED',
  'EXPIRED_PAYLOAD_CHANGED',
  'USE_DIRECTORY',
  'SOURCE_CHANGED',
]);
function requireCondition(condition, code) {
  if (!condition) throw new Error(code);
}

async function sourceFingerprint(root) {
  let baselineSha256 = null;
  try {
    baselineSha256 = sha(await readFile(join(root, 'baseline.json')));
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
  return {
    manifestSha256: sha(await readFile(join(root, 'manifest.json'))),
    checksumsSha256: sha(await readFile(join(root, 'SHA256SUMS'))),
    resultSha256: sha(await readFile(join(root, 'result.json'))),
    baselineSha256,
  };
}

export async function assessExpiryCapture(directory) {
  // Checksums, raw RPC replay, decoded key/owner bindings, stdout and original
  // summary are all verified BEFORE applying new semantics. Historical runtime
  // fingerprints are allowed, exactly as in the dated evidence gate; replay of
  // the recorded producer still has to match. No captured code is executed.
  const root = resolve(directory);
  const source = await sourceFingerprint(root);
  const parts = await readVerifiedCapture(root, { checkRuntime: false });
  const { manifest, result, baseline } = parts;
  requireCondition(baseline && baseline.manifest.subject === manifest.subject, 'BASELINE_REQUIRED');
  requireCondition(!manifest.rehearsal && !baseline.manifest.rehearsal, 'REHEARSAL_NOT_EVIDENCE');
  requireCondition(
    ['before-action', 'crossing-refused'].includes(baseline.result.phase),
    'INVALID_LIVE_BASELINE',
  );
  requireCondition(
    result.probeExitCode === 0 &&
      (result.phase === 'expiry-observed' ||
        (result.phase === 'unverified' &&
          ['INVALID_SUBJECT_TTL', 'EXPIRY_NOT_PROVEN'].includes(result.reason))),
    'UNSUPPORTED_RECORDED_VERDICT',
  );
  const controls = result.observation?.controls;
  const before = baseline.result.observation?.controls;
  requireCondition(
    controls &&
      before &&
      Number.isSafeInteger(controls.ledger) &&
      Number.isSafeInteger(before.ledger) &&
      controls.ledger > before.ledger,
    'INVALID_OBSERVATION_ORDER',
  );
  const keys = await controlKeys(manifest.subject);
  const row = (snapshot, key) => snapshot.entries.find((entry) => entry.key === key);
  const live = (entry, ledger) =>
    entry &&
    Number.isSafeInteger(entry.endsAt) &&
    entry.endsAt !== 0 &&
    !hasExpired(entry.endsAt - ledger);
  for (const key of [keys.a, keys.shared]) {
    requireCondition(
      live(row(controls, key), controls.ledger) && live(row(before, key), before.ledger),
      'CONTROL_UNAVAILABLE',
    );
  }
  requireCondition(
    row(controls, keys.shared).endsAt === row(before, keys.shared).endsAt,
    'SHARED_CONTROL_CHANGED',
  );
  const scanned = result.observation.probe.run.scan.entries[keys.instance];
  if (scanned?.ttl.status === 'known') {
    requireCondition(
      controls.ledger >= scanned.observedAtLedger &&
        scanned.ttl.endsAtLedger - scanned.observedAtLedger === scanned.ttl.remainingLedgers,
      'INVALID_OBSERVATION_ORDER',
    );
  }
  const entries = [];
  for (const kind of ['instance', 'persistent']) {
    const key = keys[kind];
    const previous = row(before, key);
    const current = row(controls, key);
    requireCondition(live(previous, before.ledger), 'INVALID_LIVE_BASELINE');
    requireCondition(hasExpired(previous.endsAt - controls.ledger), 'EXPIRY_NOT_PROVEN');
    if (current) {
      // Absolute RPC liveUntilLedgerSeq === 0 means non-live. This is NOT a
      // computed remaining TTL of zero, which is the final live ledger.
      requireCondition(current.endsAt === 0, 'NON_LIVE_REPRESENTATION_REQUIRED');
      requireCondition(current.xdr === previous.xdr, 'EXPIRED_PAYLOAD_CHANGED');
    }
    entries.push({
      kind,
      key,
      baselineEndsAtLedger: previous.endsAt,
      representation: current ? 'rpc-non-live-zero' : 'absent',
    });
  }
  requireCondition(isDeepStrictEqual(source, await sourceFingerprint(root)), 'SOURCE_CHANGED');
  verifyEvidenceIntegrity(root);
  return {
    assessmentFormat: 'evergreen-expiry-assessment-v1',
    subject: manifest.subject,
    phase: 'expiry-observed',
    observedAt: result.observation.probe.observedAt,
    ledger: controls.ledger,
    baselineObservedAt: baseline.result.observation.probe.observedAt,
    recordedVerdict: { phase: result.phase, reason: result.reason, exitCode: result.exitCode },
    entries,
    source,
    assessor: {
      scriptSha256: sha(await readFile(new globalThis.URL(import.meta.url))),
      runtimeHashes: await runtimeHashes(),
      historicalRuntimeAllowed: true,
    },
    semanticsSource:
      'https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries',
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    requireCondition(process.argv.length === 3, 'USE_DIRECTORY');
    console.log(JSON.stringify(await assessExpiryCapture(process.argv[2]), null, 2));
  } catch (error) {
    const reason = CODES.has(error?.message)
      ? error.message
      : 'ORIGINAL_CAPTURE_VERIFICATION_FAILED';
    console.error('Expiry assessment failed: ' + reason + '. Preserve original artifacts.');
    process.exitCode = 2;
  }
}
