import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, sep } from 'node:path';

/** Verify a trusted SHA256SUMS manifest before consuming any recorded claims. */
export function verifyEvidenceIntegrity(directory) {
  const fail = (message) => {
    throw new Error(`Evidence integrity: ${message}`);
  };
  const root = realpathSync(directory);
  const readInside = (name) => {
    try {
      const file = realpathSync(join(root, name));
      const rel = relative(root, file);
      if (isAbsolute(rel) || rel === '..' || rel.startsWith(`..${sep}`))
        fail(`path escapes bundle: ${name}`);
      return readFileSync(file);
    } catch {
      fail(`missing, unreadable or unsafe file: ${name}`);
    }
  };
  const text = readInside('SHA256SUMS').toString('utf8');
  const lines = text.trimEnd().split(/\r?\n/);
  if (!text.trim()) fail('empty SHA256SUMS');
  const names = new Set();
  const entries = lines.map((line, index) => {
    const match = /^([a-f\d]{64}) [ *](.+)$/i.exec(line);
    if (!match) fail(`invalid manifest line ${index + 1}`);
    const [, hash, name] = match;
    if (
      isAbsolute(name) ||
      /^[a-z]:/i.test(name) ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.split('/').some((part) => !part || part === '.' || part === '..') ||
      name === 'SHA256SUMS'
    ) {
      fail(`unsafe manifest path: ${name}`);
    }
    if (names.has(name)) fail(`duplicate manifest path: ${name}`);
    names.add(name);
    return { hash: hash.toLowerCase(), name };
  });
  for (const { hash, name } of entries) {
    if (createHash('sha256').update(readInside(name)).digest('hex') !== hash) {
      fail(`checksum mismatch: ${name}`);
    }
  }
  return entries.length;
}
