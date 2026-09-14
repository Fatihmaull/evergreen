import { SHARED_CODE_ENTRY_KEY } from '@evergreen-stellar/core';
import { describe, expect, it, vi } from 'vitest';
import { runEmailCommand } from '../src/email-command.js';
import { parseNotificationRecord } from '../src/notification-record.js';
import { success, submitted, failed, simulated, emailId } from './email-fixtures.js';

const config = JSON.stringify({
  network: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  defaults: { bumpWhenRemainingLedgersBelow: 100, extendToLedgers: 1000 },
  contracts: [],
  payers: { test: { signer: 'ed25519', secretEnvVar: 'UNREAD' } },
  notifications: { channel: 'email', toEnvVar: 'CUSTOM_ALERT' },
});
function setup(record: unknown = success) {
  const readFile = vi.fn(async (path: string) =>
    path === 'record.json' ? JSON.stringify(record) : config,
  );
  const env = vi.fn(
    (name: string) =>
      ({
        CUSTOM_ALERT: 'recipient@example.com',
        EMAIL_FROM: 'sender@example.com',
        EMAIL_API_KEY: 'test-only-placeholder',
      })[name],
  );
  const fetchImpl = vi.fn<typeof fetch>(async () => new Response(JSON.stringify({ id: emailId })));
  return { readFile, env, fetchImpl };
}
describe('notification record input', () => {
  const B = 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ';
  it.each([[B], [success.contracts[0]!, B]])(
    'refuses consumers that contradict the ContractData owner %#',
    (...contracts) => {
      expect(() => parseNotificationRecord(JSON.stringify({ ...success, contracts }))).toThrow(
        /record/i,
      );
    },
  );
  it('preserves multiple consumers for ContractCode', () => {
    const record = {
      ...success,
      entryKey: SHARED_CODE_ENTRY_KEY,
      contracts: [success.contracts[0]!, B],
    };
    expect(parseNotificationRecord(JSON.stringify(record))).toEqual(record);
  });
  it.each([success, submitted, failed, simulated])(
    'preserves $outcome with independent validated fields',
    (record) => {
      expect(parseNotificationRecord(JSON.stringify(record))).toEqual(record);
    },
  );
  it.each([
    [],
    {},
    { ...success, mode: 'dry-run' },
    { ...simulated, transactionHash: 'a'.repeat(64) },
    { ...failed, after: success.after },
    { ...success, signer: undefined },
    { ...success, transactionHash: 'invalid' },
    { ...success, entryKey: 'invalid' },
    { ...success, contracts: [] },
    { ...success, contracts: ['bad'] },
    { ...success, recordedAt: 'bad' },
    { ...success, extendToLedgers: -1 },
    { ...success, after: { observedAtLedger: 999, endsAtLedger: 1050 } },
    { ...success, extraSecret: 'must not get echoed' },
    { ...failed, error: { code: '', message: 'bad' } },
  ])('rejects malformed or contradictory record %#', (record) => {
    expect(() => parseNotificationRecord(JSON.stringify(record))).toThrow(/record/i);
  });
});
describe('email rehearsal command', () => {
  it('help accesses no files, configuration or network', async () => {
    const d = setup();
    expect((await runEmailCommand(['--help'], d)).exitCode).toBe(0);
    expect(d.readFile).not.toHaveBeenCalled();
    expect(d.env).not.toHaveBeenCalled();
  });
  it('previews actual templates, labels source unverified, reads configured recipient only', async () => {
    const d = setup();
    const r = await runEmailCommand(['--record', 'record.json'], d);
    expect(r.exitCode).toBe(0);
    const body = JSON.parse(r.stdout);
    expect(body).toMatchObject({ status: 'preview', submitted: false, chainVerified: false });
    expect(body.notification.body).toContain('CONFIRMED');
    expect(d.env).toHaveBeenCalledWith('CUSTOM_ALERT');
    expect(d.env).not.toHaveBeenCalledWith('EMAIL_API_KEY');
    expect(d.env).not.toHaveBeenCalledWith('EMAIL_TO');
    expect(r.stdout).not.toContain('recipient@example.com');
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
  it('sends only with explicit flag and reports provider acceptance', async () => {
    const d = setup();
    const r = await runEmailCommand(['--record', 'record.json', '--send'], d);
    expect(r.exitCode).toBe(0);
    expect(JSON.parse(r.stdout)).toMatchObject({
      status: 'accepted',
      emailId,
      receivedInInbox: 'unverified',
    });
    expect(d.fetchImpl).toHaveBeenCalledTimes(1);
  });
  it('skips simulated records even when send is specified', async () => {
    const d = setup(simulated);
    const r = await runEmailCommand(['--record', 'record.json', '--send'], d);
    expect(JSON.parse(r.stdout).status).toBe('skipped');
    expect(d.fetchImpl).not.toHaveBeenCalled();
    expect(d.env).not.toHaveBeenCalledWith('EMAIL_API_KEY');
  });
  it.each([
    [],
    ['--send'],
    ['--record'],
    ['--record', 'a', '--record', 'b'],
    ['--record', 'a', '--send', '--send'],
    ['--record', 'a', '--submit'],
  ])('rejects unsafe args %#', async (...args) => {
    const d = setup();
    expect((await runEmailCommand(args, d)).exitCode).toBe(2);
    expect(d.readFile).not.toHaveBeenCalled();
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
  it('refuses sends from CI before reading record or API key', async () => {
    const d = setup();
    d.env.mockImplementation((name) => (name === 'CI' ? 'true' : undefined));
    const r = await runEmailCommand(['--record', 'record.json', '--send'], d);
    expect(r.exitCode).toBe(2);
    expect(d.readFile).not.toHaveBeenCalled();
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
  it('rejects malformed records before private configuration access', async () => {
    const d = setup({ outcome: 'succeeded' });
    expect((await runEmailCommand(['--record', 'record.json'], d)).exitCode).toBe(2);
    expect(d.env).not.toHaveBeenCalled();
  });
  it('surfaces delivery failure as nonzero without printing a private error', async () => {
    const d = setup();
    d.fetchImpl.mockRejectedValue(new Error('private recipient@example.com'));
    const r = await runEmailCommand(['--record', 'record.json', '--send'], d);
    expect(r.exitCode).toBe(2);
    expect(JSON.parse(r.stdout).error.classification).toBe('unknown');
    expect(r.stdout + r.stderr).not.toContain('recipient@example.com');
  });
  it('does not fall back to W1 recipient when the engine destination is missing', async () => {
    const d = setup();
    d.env.mockImplementation((name) => (name === 'EMAIL_TO' ? 'legacy@example.com' : undefined));
    expect((await runEmailCommand(['--record', 'record.json'], d)).exitCode).toBe(2);
    expect(d.fetchImpl).not.toHaveBeenCalled();
  });
});
