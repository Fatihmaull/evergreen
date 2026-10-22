#!/usr/bin/env node
import process from 'node:process';
import console from 'node:console';
import { rpc } from '@stellar/stellar-sdk';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { connectNetwork, priceExtend, resolveNetwork } from '@evergreen-stellar/core';
import { createEvergreenMcpServer } from './server.js';
import { networkFromArgs } from './args.js';

/**
 * Process glue only. The network is fixed here, once, at start; the RPC URL is
 * read from `SOROBAN_RPC_URL` and never accepted from a tool call.
 */
async function main(): Promise<void> {
  const parsed = networkFromArgs(process.argv.slice(2));
  if (parsed.error !== undefined) throw new Error(parsed.error);
  const network = resolveNetwork({
    flag: parsed.network,
    env: process.env.EVERGREEN_NETWORK,
    rpcUrl: process.env.SOROBAN_RPC_URL,
  });
  const server = createEvergreenMcpServer({
    network: network.name,
    connect: () => connectNetwork(network, new rpc.Server(network.rpcUrl, { timeout: 10_000 })),
    priceExtend: (args) => priceExtend(network, process.env.EVERGREEN_SOURCE_ACCOUNT, args),
  });
  // stdout is the protocol channel; diagnostics go to stderr only.
  await server.connect(new StdioServerTransport());
  console.error(`evergreen-mcp: read-only, network ${network.name}`);
}

main().catch((error: unknown) => {
  console.error(`evergreen-mcp: ${error instanceof Error ? error.message : 'failed to start'}`);
  process.exit(2);
});
