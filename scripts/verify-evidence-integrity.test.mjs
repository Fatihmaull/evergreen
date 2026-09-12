import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  cpSync,
  mkdtempSync,
  readFileSync,
  writeFileSync,
  appendFileSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const bundles = [
  {
    name: 'manual',
    dir: '2026-09-12-manual-extend-proof',
    entry: 'verify-proof.mjs',
    unused: 'after/03-getLedgerEntries-response.json',
  },
  {
    name: 'storage',
    dir: '2026-09-11-storage-advice-validation',
    entry: 'verify.mjs',
    unused: 'bc/human.txt',
  },
];
const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(t, bundle) {
  const dir = mkdtempSync(join(tmpdir(), 'evergreen-integrity-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  cpSync(resolve('docs/evidence', bundle.dir), dir, { recursive: true });
  return dir;
}
function run(bundle, dir) {
  return spawnSync(process.execPath, [resolve('docs/evidence', bundle.dir, bundle.entry), dir], {
    encoding: 'utf8',
  });
}
for (const bundle of bundles) {
  test(`${bundle.name}: original bundle passes without rewriting its recorded result`, (t) => {
    const dir = fixture(t, bundle);
    const recorded = bundle.name === 'manual' ? 'verification.json' : 'offline-verification.json';
    const before = readFileSync(join(dir, recorded));
    const result = run(bundle, dir);
    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(readFileSync(join(dir, recorded)), before);
    assert.match(result.stderr, /Evidence integrity verified: \d+ files/);
  });
  for (const mutation of [
    'changed file',
    'missing file',
    'missing manifest',
    'empty manifest',
    'bad hash',
    'duplicate path',
    'parent path',
    'absolute path',
  ]) {
    test(`${bundle.name}: rejects ${mutation} before semantic verification`, (t) => {
      const dir = fixture(t, bundle);
      const manifest = join(dir, 'SHA256SUMS');
      const text = readFileSync(manifest, 'utf8');
      if (mutation === 'changed file') appendFileSync(join(dir, bundle.unused), ' ');
      if (mutation === 'missing file') rmSync(join(dir, bundle.unused));
      if (mutation === 'missing manifest') rmSync(manifest);
      if (mutation === 'empty manifest') writeFileSync(manifest, '');
      if (mutation === 'bad hash') writeFileSync(manifest, 'not-a-hash  input.json\n');
      if (mutation === 'duplicate path') appendFileSync(manifest, text.split('\n')[0] + '\n');
      if (mutation === 'parent path')
        writeFileSync(manifest, '0'.repeat(64) + '  ../outside.json\n');
      if (mutation === 'absolute path')
        writeFileSync(manifest, '0'.repeat(64) + '  /outside.json\n');
      const result = run(bundle, dir);
      assert.notEqual(result.status, 0, 'corrupt bundle must not pass');
      assert.match(result.stderr, /Evidence integrity:/);
      assert.equal(result.stdout, '', 'must fail before printing semantic success');
    });
  }
  test(`${bundle.name}: semantic checks still reject a false claim with matching checksums`, (t) => {
    const dir = fixture(t, bundle);
    const name = bundle.name === 'manual' ? 'live-result.json' : 'verification.json';
    const file = join(dir, name);
    const value = JSON.parse(readFileSync(file));
    if (bundle.name === 'manual') value.result.records[0].after.endsAtLedger += 1;
    else value.bc.exitCode = 0;
    writeFileSync(file, JSON.stringify(value));
    const manifest = join(dir, 'SHA256SUMS');
    writeFileSync(
      manifest,
      readFileSync(manifest, 'utf8')
        .split('\n')
        .map((line) =>
          line.endsWith('  ' + name) ? digest(readFileSync(file)) + '  ' + name : line,
        )
        .join('\n'),
    );
    const result = run(bundle, dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Evidence integrity verified:/);
    assert.match(result.stderr, /AssertionError/);
  });
  test(`${bundle.name}: refuses a manifest entry symlink escaping the bundle`, (t) => {
    const dir = fixture(t, bundle);
    const outside = mkdtempSync(join(tmpdir(), 'evergreen-outside-'));
    t.after(() => rmSync(outside, { recursive: true, force: true }));
    writeFileSync(join(outside, 'data.txt'), 'outside data');
    symlinkSync(join(outside, 'data.txt'), join(dir, 'link.txt'));
    appendFileSync(join(dir, 'SHA256SUMS'), digest('outside data') + '  link.txt\n');
    const result = run(bundle, dir);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Evidence integrity:.*unsafe file: link.txt/);
  });
}
