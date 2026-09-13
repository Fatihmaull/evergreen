import { describe, expect, it, vi } from 'vitest';
import { runEngineCommand } from '../src/command.js';
import type { EngineExecutionOptions, EngineExecutionResult } from '../src/execution.js';
import type { EvergreenConfig } from '@evergreen-stellar/shared-types';
const config = JSON.stringify({
  network: {
    rpcUrl: 'https://soroban-testnet.stellar.org',
    networkPassphrase: 'Test SDF Network ; September 2015',
  },
  defaults: { bumpWhenRemainingLedgersBelow: 100, extendToLedgers: 1000 },
  contracts: [],
  payers: { payer: { signer: 'ed25519', secretEnvVar: 'UNREAD' } },
});
function deps() {
  const scan = { network: 'testnet' as const, contracts: [], entries: {}, issues: [] };
  const liveness = { isAlarm: false, findings: [] };
  const result: EngineExecutionResult = {
    preview: {
      scan,
      decisions: [],
      liveness,
      mode: 'dry-run',
      health: { byEntry: {}, thresholdsByEntry: {} },
    },
    mode: 'dry-run',
    records: [],
    decisions: [],
    previews: [],
    refreshes: [],
    liveness,
    feesByPayer: {},
    warnings: [],
    diagnostics: [{ code: 'FIXTURE_FAILURE', message: 'Fixture execution failure' }],
    unattempted: [],
    ok: false,
    exitCode: 2,
  };
  return {
    readConfig: vi.fn<(path: string) => Promise<string>>(async () => config),
    execute: vi.fn<
      (
        config: EvergreenConfig,
        options: EngineExecutionOptions,
        attemptFile?: string,
      ) => Promise<EngineExecutionResult>
    >(async () => result),
  };
}
describe('engine execution command', () => {
  it('help never reads config or executes', async () => {
    const d = deps();
    expect((await runEngineCommand(['--help'], d)).exitCode).toBe(0);
    expect(d.readConfig).not.toHaveBeenCalled();
    expect(d.execute).not.toHaveBeenCalled();
  });
  it('defaults to simulation and returns the actual run exit code and JSON', async () => {
    const d = deps();
    const r = await runEngineCommand(['--config', 'test.json'], d);
    expect(r.exitCode).toBe(2);
    expect(d.readConfig).toHaveBeenCalledWith('test.json');
    expect(d.execute.mock.calls[0]?.[1]).toEqual({});
    expect(JSON.parse(r.stdout).mode).toBe('dry-run');
  });
  it.each([
    ['--submit'],
    ['--submit', '--dry-run'],
    ['--attempt-file', 'state.jsonl'],
    ['--unknown'],
    ['--config'],
    ['--config', 'a', '--config', 'b'],
  ])('rejects unsafe/conflicting args %j', async (...args) => {
    const d = deps();
    expect((await runEngineCommand(args, d)).exitCode).toBe(2);
    expect(d.execute).not.toHaveBeenCalled();
  });
  it('passes a recorder path only with explicit submit', async () => {
    const d = deps();
    await runEngineCommand(['--submit', '--attempt-file', '.evergreen/attempt.jsonl'], d);
    expect(d.execute.mock.calls[0]?.[1]).toEqual({ submit: true });
    expect(d.execute.mock.calls[0]?.[2]).toBe('.evergreen/attempt.jsonl');
  });
  it('sanitizes unexpected provider errors', async () => {
    const d = deps();
    d.execute.mockRejectedValue(new Error('credential-bearing URL'));
    const r = await runEngineCommand([], d);
    expect(r.exitCode).toBe(2);
    expect(r.stdout + r.stderr).not.toContain('credential-bearing');
  });
});
