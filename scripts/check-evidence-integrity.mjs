import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import console from 'node:console';
import { verifyEvidenceIntegrity } from './verify-evidence-integrity.mjs';

export async function checkEvidenceBundles(root) {
  const result = { bundles: 0, files: 0, failures: [] };
  async function walk(dir) {
    const entries = await readdir(dir, { withFileTypes: true });
    if (entries.some((e) => e.name === 'SHA256SUMS')) {
      result.bundles++;
      try {
        result.files += verifyEvidenceIntegrity(dir);
      } catch (error) {
        result.failures.push(`${dir}: ${error.message}`);
      }
    }
    for (const entry of entries) {
      if (entry.isSymbolicLink())
        result.failures.push(`${join(dir, entry.name)}: evidence symlink refused`);
      else if (entry.isDirectory()) await walk(join(dir, entry.name));
    }
  }
  await walk(root);
  if (result.bundles === 0) result.failures.push('No evidence manifests found');
  return result;
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await checkEvidenceBundles('docs/evidence');
    if (result.failures.length) {
      console.error(result.failures.join('\n'));
      process.exitCode = 1;
    } else
      console.log(
        `✓ evidence integrity: ${result.bundles} bundles, ${result.files} manifest entries verified`,
      );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
