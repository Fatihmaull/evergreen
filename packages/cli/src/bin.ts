#!/usr/bin/env node
import process from 'node:process';
import console from 'node:console';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { rpc } from '@stellar/stellar-sdk';
import {
  connectNetwork,
  resolveNetwork,
  NETWORKS,
  readStateArchivalSettings,
  planExtension,
  executeExtensions,
  prepareExtension,
  submitExtension,
  confirmExtension,
  createEd25519Signer,
  scanContract,
  createRpcReader,
  priceExtend,
} from '@evergreen-stellar/core';
import type { PreparedExtension } from '@evergreen-stellar/core';
import { extensionPreview } from './extend.js';
import type { ExtendReport, ExtendRequest } from './extend.js';
import { runCli } from './command.js';
import { takeNetworkFlag } from './network-args.js';
import type { NetworkChoice } from '@evergreen-stellar/core';
import { EXIT_ERROR } from './scan.js';
import {
  dismissSupportTip,
  parseSupportTipState,
  supportTip,
  type SupportTipState,
} from './support-tip.js';

// PH2-E1-08: where the "Support Evergreen" tip remembers the month it last showed.
const SUPPORT_TIP_STATE = join(
  process.env.XDG_CONFIG_HOME ?? join(homedir(), '.config'),
  'evergreen',
  'support-tip.json',
);

async function writeTipState(state: SupportTipState): Promise<void> {
  await mkdir(dirname(SUPPORT_TIP_STATE), { recursive: true });
  await writeFile(SUPPORT_TIP_STATE, `${JSON.stringify(state)}\n`, 'utf8');
}

/** Best effort: a tip must never change a command's output or exit code. */
async function maybeShowSupportTip(args: readonly string[]): Promise<void> {
  try {
    const raw = await readFile(SUPPORT_TIP_STATE, 'utf8').catch(() => undefined);
    const decision = supportTip({
      args,
      stderrIsTTY: process.stderr.isTTY === true,
      env: process.env,
      now: new Date(),
      state: parseSupportTipState(raw),
    });
    if (decision.text === undefined) return;
    console.error(decision.text);
    if (decision.nextState !== undefined) await writeTipState(decision.nextState);
  } catch {
    // Ignored on purpose.
  }
}

async function main(): Promise<number> {
  // `--network` is global, so it is lifted out before a command parses argv.
  const {
    network: networkFlag,
    rest: args,
    error: networkFlagError,
  } = takeNetworkFlag(process.argv.slice(2));
  if (networkFlagError !== undefined) {
    console.error(networkFlagError);
    return EXIT_ERROR;
  }
  // Resolved lazily, on first use: `--help` must not need an RPC URL, and a
  // NetworkConfigError (unknown name, mainnet with no RPC) surfaces through the
  // command's own error reporting rather than as a crash.
  let chosen: NetworkChoice | undefined;
  const network = (): NetworkChoice =>
    (chosen ??= resolveNetwork({
      flag: networkFlag,
      env: process.env.EVERGREEN_NETWORK,
      rpcUrl: process.env.SOROBAN_RPC_URL,
    }));
  // Colour only for a human at a terminal. Piped output, CI logs and captured
  // evidence stay clean, and NO_COLOR is honoured (no-color.org). The health
  // WORD prints either way — colour is never the only carrier of the state.
  const color = process.stdout.isTTY === true && process.env.NO_COLOR === undefined;
  if (args[0] === 'tip') {
    if (args.length === 2 && args[1] === '--dismiss') {
      await writeTipState(dismissSupportTip(new Date()));
      console.error('The Support Evergreen tip is hidden until next month.');
      return 0;
    }
    console.error('usage: evergreen tip --dismiss');
    return EXIT_ERROR;
  }
  const output = await runCli(args, {
    extend: {
      ...(process.env.EVERGREEN_SOURCE_ACCOUNT
        ? { sourceAccount: process.env.EVERGREEN_SOURCE_ACCOUNT }
        : {}),
      readKeysFile: (path) => readFile(path, 'utf8'),
      preview: (text) => console.error(text),
      // Writes stay testnet-only whatever --network says (hard rule 1):
      // runExtension compares the RPC against testnet and refuses anything else.
      run: (request, preview) => runExtension(network().rpcUrl, request, preview),
    },
    connect: () => connectNetwork(network()),
    readStorageSettings: () =>
      readStateArchivalSettings(new rpc.Server(network().rpcUrl, { timeout: 10_000 })),
    readKeysFile: (path) => readFile(path, 'utf8'),
    now: () => new Date(),
    color,
    // Public key only; simulation never signs. Falls back to the well-known
    // testnet identity so `--cost` works without configuration.
    // No account is passed: simulation neither signs nor needs one to exist.
    // EVERGREEN_SOURCE_ACCOUNT stays available for anyone who wants a specific
    // identity in their own RPC logs.
    priceExtend: (scanArgs) =>
      priceExtend(network(), process.env.EVERGREEN_SOURCE_ACCOUNT, scanArgs),
  });
  if (output.stdout) console.log(output.stdout);
  if (output.stderr) console.error(output.stderr);
  await maybeShowSupportTip(args);
  return output.exitCode;
}

main()
  .then((code) => process.exit(code))
  .catch(() => {
    // Never let a raw stack trace reach a user (docs/CONVENTIONS.md).
    console.error('\n✖ Unexpected command failure.');
    process.exit(EXIT_ERROR);
  });

/** Network/secret wiring only. The command and execution state machine test offline. */
async function runExtension(
  rpcUrl: string,
  request: ExtendRequest,
  preview: (text: string) => void,
): Promise<ExtendReport> {
  const server = new rpc.Server(rpcUrl, { timeout: 10_000 });
  if ((await server.getNetwork()).passphrase !== NETWORKS.testnet.passphrase)
    throw new Error('RPC is not Testnet');
  const reader = createRpcReader(server);
  const scan = await scanContract(reader, { id: request.contractId }, request.dataKeys);
  const settings = await readStateArchivalSettings(server);
  const plan = planExtension(scan, {
    contractId: request.contractId,
    additionalLedgers: request.additionalLedgers,
    maxEntryTtl: settings.maxEntryTtl,
    dataKeys: request.dataKeys,
    includeCode: request.includeCode,
  });
  const previews: PreparedExtension[] = [];
  const result = await executeExtensions(
    plan,
    {
      payer: request.sourceAccount,
      submit: request.submit,
      ...(request.maxFeeStroops === undefined ? {} : { maxFeeStroops: request.maxFeeStroops }),
    },
    {
      prepare: (entry) => prepareExtension(server, entry, request.sourceAccount),
      signer: (prepared, remainingFeeStroops) =>
        createEd25519Signer({
          payer: request.sourceAccount,
          sourceAccount: request.sourceAccount,
          entryKey: prepared.entry.entryKey,
          extendToLedgers: prepared.entry.extendToLedgers,
          expectedHash: prepared.transactionHash,
          maxFeeStroops: remainingFeeStroops,
          readSecret: () => {
            // This callback is unreachable in simulation. Environment NAME is public; VALUE is never reported.
            const secret = request.secretEnv ? process.env[request.secretEnv] : undefined;
            if (!secret) throw new Error('Signing key is unavailable');
            return secret;
          },
        }),
      submit: (prepared, signed) => submitExtension(server, prepared, signed),
      confirm: (hash) => confirmExtension(server, hash),
      readAfter: async (entryKey) => {
        const after = await scanContract(reader, { id: request.contractId }, request.dataKeys);
        const entry = after.entries[entryKey];
        if (
          !entry ||
          entry.ttl.status !== 'known' ||
          after.issues.some((i) => i.entryKey === entryKey)
        )
          throw new Error('Post-read incomplete');
        return { observedAtLedger: entry.observedAtLedger, endsAtLedger: entry.ttl.endsAtLedger };
      },
      preview: async (prepared) => {
        previews.push(prepared);
        preview(
          `Mode: ${request.submit ? 'live (explicit submit)' : 'dry-run'}; requested increment: ${request.additionalLedgers}; aggregate budget: ${request.maxFeeStroops ?? 'not supplied (simulation only)'}\n${extensionPreview(prepared)}`,
        );
      },
      now: () => new Date(),
    },
  );
  return { plan, result, previews };
}
