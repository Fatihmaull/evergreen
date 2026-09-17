import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { checkEvidenceBundles } from './check-evidence-integrity.mjs';

test('a later README annotation breaks the inventory until original bytes are restored', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-inventory-'));
  try {
    const bundle = join(root, 'nested', 'capture');
    await mkdir(bundle, { recursive: true });
    const original = 'Recorded evidence description\n';
    await writeFile(join(bundle, 'README.md'), original);
    await writeFile(
      join(bundle, 'SHA256SUMS'),
      createHash('sha256').update(original).digest('hex') + '  README.md\n',
    );
    assert.deepEqual(await checkEvidenceBundles(root), { bundles: 1, files: 1, failures: [] });
    await writeFile(join(bundle, 'README.md'), original + 'Later acceptance annotation\n');
    const bad = await checkEvidenceBundles(root);
    assert.equal(bad.failures.length, 1);
    assert.match(bad.failures[0], /checksum mismatch: README.md/);
    await writeFile(join(bundle, 'README.md'), original);
    assert.equal((await checkEvidenceBundles(root)).failures.length, 0);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
test('no manifests cannot silently count as a passing inventory', async () => {
  const root = await mkdtemp(join(tmpdir(), 'evidence-empty-'));
  try {
    assert.deepEqual((await checkEvidenceBundles(root)).failures, ['No evidence manifests found']);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
