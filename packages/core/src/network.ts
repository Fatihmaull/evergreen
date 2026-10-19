import { rpc } from '@stellar/stellar-sdk';
import type { NetworkName } from '@evergreen-stellar/shared-types';
import { createRpcReader } from './rpc.js';
import type { LedgerEntryReader } from './rpc.js';
import { NETWORKS, RPC_PROVIDERS_URL } from './networks.js';

export { NETWORKS, RPC_PROVIDERS_URL } from './networks.js';

export interface NetworkChoice {
  readonly name: NetworkName;
  readonly passphrase: string;
  readonly rpcUrl: string;
}

/** The chosen network cannot be used as asked: unknown name, or mainnet with no RPC. */
export class NetworkConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkConfigError';
  }
}

/** The RPC answered for a different network than the one chosen. */
export class NetworkMismatchError extends Error {
  constructor(
    readonly chosen: NetworkName,
    readonly reported: string,
  ) {
    super(
      `Refusing to read: the chosen network is ${chosen} (--network or EVERGREEN_NETWORK), but the RPC reports "${reported}". ` +
        `Point SOROBAN_RPC_URL at a ${chosen} endpoint, or choose the network it serves.`,
    );
    this.name = 'NetworkMismatchError';
  }
}

function isNetworkName(value: string): value is NetworkName {
  return Object.hasOwn(NETWORKS, value);
}

/**
 * Choose the network. A flag beats the environment, the environment beats the
 * default, and the default is testnet. An empty string counts as unset, so an
 * exported-but-empty `EVERGREEN_NETWORK` does not become an error.
 */
export function resolveNetwork(input: {
  readonly flag?: string | undefined;
  readonly env?: string | undefined;
  readonly rpcUrl?: string | undefined;
}): NetworkChoice {
  const raw = input.flag || input.env || 'testnet';
  if (!isNetworkName(raw)) {
    throw new NetworkConfigError(`Unknown network "${raw}". Use testnet or mainnet.`);
  }
  const network = NETWORKS[raw];
  const rpcUrl = input.rpcUrl || network.defaultRpcUrl;
  if (!rpcUrl) {
    throw new NetworkConfigError(
      `${raw} has no default RPC endpoint. Set SOROBAN_RPC_URL to a ${raw} RPC; ` +
        `providers are listed at ${RPC_PROVIDERS_URL}.`,
    );
  }
  return { name: raw, passphrase: network.passphrase, rpcUrl };
}

/**
 * A reader for the chosen network, refusing an RPC that serves another one.
 * Compares the live passphrase, never a label: a URL that says "testnet" proves
 * nothing about what it serves.
 */
export async function connectNetwork(
  choice: NetworkChoice,
  server: Pick<rpc.Server, 'getNetwork' | 'getLedgerEntries'> = new rpc.Server(choice.rpcUrl),
): Promise<LedgerEntryReader> {
  const { passphrase } = await server.getNetwork();
  if (passphrase !== NETWORKS[choice.name].passphrase) {
    throw new NetworkMismatchError(choice.name, passphrase);
  }
  return { ...createRpcReader(server as rpc.Server), network: choice.name };
}
