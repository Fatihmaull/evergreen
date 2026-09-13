import { ConfigError, loadConfig } from '@evergreen-stellar/core';
import type { EvergreenConfig } from '@evergreen-stellar/shared-types';
import { EngineExecutionError } from './transport.js';
import type { EngineExecutionOptions, EngineExecutionResult } from './execution.js';

export interface EngineCommandDependencies {
  readConfig(path: string): Promise<string>;
  execute(
    config: EvergreenConfig,
    options: EngineExecutionOptions,
    attemptFile?: string,
  ): Promise<EngineExecutionResult>;
}
const HELP = `usage: pnpm engine:execute [--config path] [--dry-run]
       pnpm engine:execute --config path --submit --attempt-file .evergreen/attempt.jsonl

Default config: evergreen.config.json. Default mode: simulation, no secret access.
Execution scope: registered instance and persistent keys only; no implicit instance addition.
Simulation requires each selected payer's public sourceAccount. A cap is optional in simulation.
Live requires config mode=live, explicit --submit, sourceAccount and maxFeeStroops for each
selected Ed25519 payer, plus a new retained local attempt journal. No .env auto-loading.
An existing attempt file blocks live execution; do not change paths to bypass an unresolved hash.
This recorder is for a bounded local run, not cross-run scheduler recovery (D16-02).
Exit 0: no errors/alarm; 1: liveness alarm (including a successful low-TTL simulation);
2: invalid input or incomplete execution. Neither a preview nor exit status authorizes a write.`;

/** Parse locally; delegate actual execution and return its real exit status. */
export async function runEngineCommand(
  args: readonly string[],
  deps: EngineCommandDependencies,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const fail = (code: string, message: string) => ({
    stdout: JSON.stringify({ error: { code, message } }),
    stderr: message,
    exitCode: 2,
  });
  if (args.length === 1 && args[0] === '--help') return { stdout: HELP, stderr: '', exitCode: 0 };
  const values = new Map<string, string>(),
    flags = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (values.has(arg) || flags.has(arg)) return fail('ARGUMENTS', 'Repeated execution argument.');
    if (arg === '--config' || arg === '--attempt-file') {
      const value = args[++i];
      if (!value || value.startsWith('--'))
        return fail('ARGUMENTS', 'Missing execution argument value.');
      values.set(arg, value);
    } else if (arg === '--submit' || arg === '--dry-run') flags.add(arg);
    else return fail('ARGUMENTS', 'Unknown execution argument. Use --help.');
  }
  const submit = flags.has('--submit'),
    dryRun = flags.has('--dry-run'),
    attemptFile = values.get('--attempt-file');
  if ((submit && dryRun) || (submit && !attemptFile) || (!submit && attemptFile))
    return fail(
      'ARGUMENTS',
      'Live needs --submit and --attempt-file; --dry-run and --submit conflict.',
    );
  let raw: string;
  try {
    raw = await deps.readConfig(values.get('--config') ?? 'evergreen.config.json');
  } catch {
    return fail('CONFIG_READ_FAILED', 'Unable to read the engine execution config.');
  }
  try {
    const { config, warnings } = loadConfig(raw);
    const result = await deps.execute(
      config,
      { ...(submit ? { submit: true } : {}), ...(dryRun ? { dryRun: true } : {}) },
      attemptFile,
    );
    return {
      stdout: JSON.stringify({ configWarnings: warnings, ...result }, null, 2),
      stderr: '',
      exitCode: result.exitCode,
    };
  } catch (error) {
    if (error instanceof EngineExecutionError) return fail(error.code, error.message);
    if (error instanceof ConfigError) return fail('CONFIG_INVALID', error.message);
    return fail(
      'EXECUTION_ERROR',
      'Execution failed. Inspect public configuration and reconcile any recorded attempt before retrying. No provider details are printed.',
    );
  }
}
