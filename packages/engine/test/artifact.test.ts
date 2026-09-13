import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
const SCRIPT = new URL('../../../scripts/engine-execute.mjs', import.meta.url).pathname;
const PRELOAD = new URL('./fixtures/rpc-preload.mjs', import.meta.url).pathname;
const fixture = JSON.parse(
  readFileSync(
    new URL('../../core/test/fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url),
    'utf8',
  ),
).result as { entries: { key: string }[] };
// Public payer recorded in the captured account response used by the preload.
const source = 'GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB';
function run(args: string[]) {
  try {
    return {
      status: 0,
      stdout: execFileSync(process.execPath, ['--import', PRELOAD, SCRIPT, ...args], {
        encoding: 'utf8',
        env: { PATH: process.env.PATH, NO_COLOR: '1' },
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20000,
      }),
    };
  } catch (error) {
    const e = error as { status?: number; stdout?: string; stderr?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '', stderr: e.stderr ?? '' };
  }
}
function config(mode = 'dry-run') {
  return {
    network: {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    mode,
    defaults: { bumpWhenRemainingLedgersBelow: 100, extendToLedgers: 1000 },
    contracts: [
      {
        id: 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L',
        payer: 'payer',
        dataKeys: [fixture.entries[2]!.key],
      },
    ],
    payers: {
      payer: {
        signer: 'ed25519',
        secretEnvVar: 'ARTIFACT_SEED',
        sourceAccount: source,
        maxFeeStroops: '1200',
      },
    },
  };
}
describe('compiled engine execution command — fully offline transport', () => {
  it('loads the real import graph and help without network/config access', () => {
    const r = run(['--help']);
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('engine:execute');
  });
  it('rejects missing live arguments before any execution', () => {
    const r = run(['--submit']);
    expect(r.status).toBe(2);
    expect(JSON.parse(r.stdout).error.code).toBe('ARGUMENTS');
  });
  it('runs actual SDK preparation on fixtures, prints simulated records and exits with liveness', () => {
    const dir = mkdtempSync(join(tmpdir(), 'evergreen-artifact-'));
    try {
      const path = join(dir, 'config.json');
      writeFileSync(path, JSON.stringify(config()));
      const r = run(['--config', path]);
      expect(r.status).toBe(1);
      const value = JSON.parse(r.stdout);
      expect(value.records.map((x: { outcome: string }) => x.outcome)).toEqual([
        'simulated',
        'simulated',
      ]);
      expect(value.previews[0].sourceAccount).toBe(source);
      expect(value.feesByPayer.payer).toMatchObject({
        estimatedFeeStroops: '1200',
        reservedFeeStroops: '0',
      });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('requires config live mode before creating an attempt file', () => {
    const dir = mkdtempSync(join(tmpdir(), 'evergreen-artifact-'));
    try {
      const path = join(dir, 'config.json'),
        attempt = join(dir, 'attempt.jsonl');
      writeFileSync(path, JSON.stringify(config()));
      const r = run(['--config', path, '--submit', '--attempt-file', attempt]);
      expect(r.status).toBe(2);
      expect(JSON.parse(r.stdout).error.code).toBe('LIVE_CONFIG_REQUIRED');
      expect(existsSync(attempt)).toBe(false);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
  it('retains an existing intent and blocks another live run before secret access', () => {
    const dir = mkdtempSync(join(tmpdir(), 'evergreen-artifact-'));
    try {
      const path = join(dir, 'config.json'),
        attempt = join(dir, 'attempt.jsonl');
      writeFileSync(path, JSON.stringify(config('live')));
      writeFileSync(attempt, 'retained intent');
      const r = run(['--config', path, '--submit', '--attempt-file', attempt]);
      expect(r.status).toBe(2);
      expect(JSON.parse(r.stdout).error.code).toBe('RECORDER_UNAVAILABLE');
      expect(readFileSync(attempt, 'utf8')).toBe('retained intent');
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
