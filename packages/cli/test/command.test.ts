import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { runCli } from '../src/command.js';
import { readerFromFixture } from '../../core/test/mock-rpc.js';

const FIXTURE = new URL(
  '../../core/test/fixtures/getLedgerEntries-guinea-pig-a.json',
  import.meta.url,
).pathname;
const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  result: { entries: { key: string }[] };
};
const DATA_KEYS = recorded.result.entries.slice(2).map((r) => r.key);
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
function dependencies(file = JSON.stringify({ dataKeys: DATA_KEYS })) {
  return {
    connect: vi.fn(async () => readerFromFixture(FIXTURE)),
    readKeysFile: vi.fn(async () => file),
    now: () => new Date('2026-09-05T00:00:00Z'),
  };
}

describe('scan CLI', () => {
  it('emits four entry kinds and coverage as valid JSON without human text', async () => {
    const deps = dependencies();
    const result = await runCli(['scan', A, '--keys-file', 'keys.json', '--json'], deps);
    const parsed = JSON.parse(result.stdout) as {
      entries: Record<string, { kind: string }>;
      coverage: { mode: string };
    };
    expect(
      Object.values(parsed.entries)
        .map((e) => e.kind)
        .sort(),
    ).toEqual(['code', 'instance', 'persistent', 'temporary']);
    expect(parsed.coverage.mode).toBe('known-keys');
    expect(result.stderr).toBe('');
    expect(result.exitCode).toBe(1); // The recorded temporary entry is below threshold.
    expect(deps.readKeysFile).toHaveBeenCalledWith('keys.json');
  });

  it('keeps no-file scans visibly limited and nonzero even with healthy instance/code', async () => {
    const deps = dependencies();
    const result = await runCli(['scan', A], deps);
    expect(deps.readKeysFile).not.toHaveBeenCalled();
    expect(result.exitCode).toBe(1);
    expect(result.stdout).toContain('NOT been fully enumerated');
    expect(result.stdout).toContain('0 explicit data key(s)');
  });

  it('returns zero only for healthy supplied keys, while still explaining coverage', async () => {
    const result = await runCli(
      ['scan', A, '--keys-file', 'keys.json'],
      dependencies(JSON.stringify({ dataKeys: [DATA_KEYS[0]] })),
    );
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('known keys only');
  });

  it.each([['--help'], ['scan', '--help']])('help performs no I/O: %j', async (...args) => {
    const deps = dependencies();
    const result = await runCli(args, deps);
    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('--keys-file');
    expect(deps.connect).not.toHaveBeenCalled();
  });

  it.each([
    [],
    ['scan'],
    ['scan', A, '--keys-file'],
    ['scan', A, '--keys-file', '--json'],
    ['scan', A, '--wrong'],
    ['scan', A, '--json', '--json'],
    ['scan', A, 'extra'],
  ])('rejects bad arguments without connection: %j', async (...args) => {
    const deps = dependencies();
    const result = await runCli(args, deps);
    expect(result.exitCode).toBe(2);
    expect(deps.connect).not.toHaveBeenCalled();
  });

  it.each([
    'SECRET not JSON',
    '{}',
    '[]',
    '{"dataKeys":null}',
    '{"dataKeys":[1]}',
    '{"dataKeys":[],"network":"mainnet"}',
  ])('rejects malformed keys file without echoing it', async (file) => {
    const deps = dependencies(file);
    const result = await runCli(['scan', A, '--keys-file', 'keys.json'], deps);
    expect(result.exitCode).toBe(2);
    expect(result.stderr).not.toContain('SECRET');
    expect(deps.connect).not.toHaveBeenCalled();
  });

  it('sanitizes file and connection failures', async () => {
    const deps = dependencies();
    deps.readKeysFile.mockRejectedValue(new Error('SECRET'));
    const missing = await runCli(['scan', A, '--keys-file', 'keys.json'], deps);
    expect(missing.exitCode).toBe(2);
    expect(missing.stderr).not.toContain('SECRET');
    deps.connect.mockRejectedValue(new Error('https://user:SECRET@rpc/'));
    const failed = await runCli(['scan', A], deps);
    expect(failed.exitCode).toBe(2);
    expect(failed.stderr).not.toContain('SECRET');
  });
});
