import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { success, simulated, emailId } from './email-fixtures.js';

const script = new URL('../../../scripts/email-notify.mjs', import.meta.url).pathname;
const preload = new URL('./fixtures/email-preload.mjs', import.meta.url).pathname;
function run(args: string[], env: Record<string, string> = {}) {
  try {
    return {
      status: 0,
      stdout: execFileSync(process.execPath, ['--import', preload, script, ...args], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 20000,
        env: {
          PATH: process.env.PATH,
          NO_COLOR: '1',
          EVERGREEN_ALERT_TO: 'recipient@example.com',
          EMAIL_API_KEY: 'test-only-placeholder',
          ...env,
        },
      }),
    };
  } catch (error) {
    const e = error as { status?: number; stdout?: string };
    return { status: e.status ?? -1, stdout: e.stdout ?? '' };
  }
}
function withInput(fn: (args: string[]) => void, record: unknown = success) {
  const dir = mkdtempSync(join(tmpdir(), 'evergreen-email-artifact-'));
  try {
    const path = join(dir, 'record.json'),
      config = join(dir, 'config.json');
    writeFileSync(path, JSON.stringify(record));
    writeFileSync(
      config,
      JSON.stringify({
        network: {
          rpcUrl: 'https://soroban-testnet.stellar.org',
          networkPassphrase: 'Test SDF Network ; September 2015',
        },
        defaults: { bumpWhenRemainingLedgersBelow: 100, extendToLedgers: 1000 },
        contracts: [],
        payers: { test: { signer: 'ed25519', secretEnvVar: 'UNREAD' } },
        notifications: { channel: 'email', toEnvVar: 'EVERGREEN_ALERT_TO' },
      }),
    );
    fn(['--record', path, '--config', config]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
describe('built email command with offline provider', () => {
  it('loads the real import graph and help', () => {
    const r = run(['--help'], { EMAIL_TEST_PREVIEW: '1' });
    expect(r.status).toBe(0);
    expect(r.stdout).toContain('email:notify');
  });
  it('previews a supplied record without API access or secret lookup', () =>
    withInput((args) => {
      const r = run(args, { EMAIL_TEST_PREVIEW: '1' });
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toMatchObject({
        status: 'preview',
        chainVerified: false,
        submitted: false,
      });
      expect(r.stdout).not.toContain('recipient@example.com');
    }));
  it('accepts an explicit send only at the mocked provider and does not claim inbox receipt', () =>
    withInput((args) => {
      const r = run([...args, '--send']);
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout)).toMatchObject({
        status: 'accepted',
        emailId,
        receivedInInbox: 'unverified',
      });
    }));
  it('exits nonzero on provider failure', () =>
    withInput((args) => {
      const r = run([...args, '--send'], { EMAIL_TEST_STATUS: '503' });
      expect(r.status).toBe(2);
      expect(JSON.parse(r.stdout).error.classification).toBe('unknown');
    }));
  it('never sends simulated input', () =>
    withInput((args) => {
      const r = run([...args, '--send'], { EMAIL_TEST_PREVIEW: '1' });
      expect(r.status).toBe(0);
      expect(JSON.parse(r.stdout).status).toBe('skipped');
    }, simulated));
  it('refuses malformed input before any network or API key access', () =>
    withInput(
      (args) => {
        const r = run(args, { EMAIL_TEST_PREVIEW: '1' });
        expect(r.status).toBe(2);
        expect(JSON.parse(r.stdout).error.code).toBe('RECORD_INVALID');
      },
      { outcome: 'succeeded' },
    ));
});
