import { readFile, access } from 'node:fs/promises';
import { resolve, join, isAbsolute } from 'node:path';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { loadConfig } from '../packages/core/dist/index.js';
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const PAYER = 'GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB';
export async function checkSaveProof(manifest, { now = Date.now(), live = false } = {}) {
  if (
    manifest.version !== 1 ||
    !isAbsolute(manifest.runtimeRoot) ||
    !isAbsolute(manifest.configPath) ||
    !isAbsolute(manifest.attemptFile) ||
    !isAbsolute(manifest.outputRoot) ||
    !/^(?:w3-save|paket-a)-[\w-]+$/.test(manifest.runId) ||
    !/^[0-9a-f]{40}$/.test(manifest.sourceCommit)
  )
    throw Error('Invalid campaign manifest');
  if (
    !Number.isFinite(manifest.notBefore) ||
    !Number.isFinite(manifest.notAfter) ||
    manifest.notAfter <= manifest.notBefore ||
    manifest.notAfter - manifest.notBefore > 3600000
  )
    throw Error('Invalid proof window');
  if (live && (now < manifest.notBefore || now >= manifest.notAfter))
    throw Error('Outside proof window');
  const snapshot = JSON.parse(
    await readFile(join(manifest.runtimeRoot, 'runtime-manifest.json'), 'utf8'),
  );
  if (
    snapshot.sourceCommit !== manifest.sourceCommit ||
    snapshot.runtimeRoot !== manifest.runtimeRoot ||
    !isDeepStrictEqual(snapshot.files, manifest.files)
  )
    throw Error('Campaign does not match the complete runtime manifest');
  for (const needed of [
    'scripts/engine-alert-run.mjs',
    'scripts/run-save-proof.mjs',
    'scripts/check-save-proof-readiness.mjs',
    'packages/engine/dist/index.js',
    'packages/core/dist/index.js',
  ])
    if (!manifest.files?.[needed]) throw Error('Incomplete runtime manifest');
  for (const [path, hash] of Object.entries(manifest.files)) {
    if (isAbsolute(path) || path.split('/').includes('..') || !/^[0-9a-f]{64}$/.test(hash))
      throw Error('Invalid runtime path/hash');
    if (
      createHash('sha256')
        .update(await readFile(join(manifest.runtimeRoot, path)))
        .digest('hex') !== hash
    )
      throw Error('Runtime changed');
  }
  const raw = await readFile(manifest.configPath, 'utf8');
  if (createHash('sha256').update(raw).digest('hex') !== manifest.configSha256)
    throw Error('Config changed');
  const { config } = loadConfig(raw);
  const c = config.contracts[0];
  const payer = c ? config.payers[c.payer] : undefined;
  if (
    config.mode !== 'live' ||
    config.contracts.length !== 1 ||
    c.id !== A ||
    c.dataKeys?.length ||
    !payer ||
    payer.signer !== 'ed25519' ||
    payer.sourceAccount !== PAYER ||
    !payer.maxFeeStroops ||
    BigInt(payer.maxFeeStroops) > 2000000n ||
    config.notifications?.toEnvVar !== 'EVERGREEN_ALERT_TO'
  )
    throw Error('Proof scope or payer/cap mismatch');
  const threshold =
    c.thresholds?.bumpWhenRemainingLedgersBelow ?? config.defaults.bumpWhenRemainingLedgersBelow;
  const target = c.thresholds?.extendToLedgers ?? config.defaults.extendToLedgers;
  if (target <= threshold) throw Error('Target must clear action threshold');
  if (live) {
    try {
      await access(manifest.attemptFile);
      throw Error('Existing attempt must be reconciled');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
    }
  }
  return { config, runtimeRoot: resolve(manifest.runtimeRoot) };
}
