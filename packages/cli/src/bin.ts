#!/usr/bin/env node
import process from 'node:process';
import console from 'node:console';
import { readFile } from 'node:fs/promises';
import { connectTestnet } from '@evergreen-stellar/core';
import { runCli } from './command.js';
import { EXIT_ERROR } from './scan.js';

const DEFAULT_RPC = 'https://soroban-testnet.stellar.org';

async function main(): Promise<number> {
  const rpcUrl = process.env.SOROBAN_RPC_URL ?? DEFAULT_RPC;
  // Colour only for a human at a terminal. Piped output, CI logs and captured
  // evidence stay clean, and NO_COLOR is honoured (no-color.org). The health
  // WORD prints either way — colour is never the only carrier of the state.
  const color = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
  const output = await runCli(process.argv.slice(2), {
    connect: () => connectTestnet(rpcUrl),
    readKeysFile: (path) => readFile(path, 'utf8'),
    now: () => new Date(),
    color,
  });
  if (output.stdout) console.log(output.stdout);
  if (output.stderr) console.error(output.stderr);
  return output.exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch(() => {
    // Never let a raw stack trace reach a user (docs/CONVENTIONS.md).
    console.error('\n✖ Unexpected scan failure.');
    process.exit(EXIT_ERROR);
  });
