import type { NetworkName, TestnetPassphrase } from '@evergreen-stellar/shared-types';

/**
 * The one network table (PH2-E1-03). Every passphrase core compares against is
 * read from here, so "which network" has a single home instead of a literal per
 * call site.
 *
 * READS may target either network. WRITES stay testnet-only until the beta
 * exits (`AGENTS.md` hard rule 1, `PH2-E5-02`): `planExtension`,
 * `planEngineExecution`, the optimizer and the signer each refuse anything else,
 * whatever this table contains.
 *
 * Mainnet has NO default RPC, on purpose. SDF runs public RPC for Futurenet and
 * Testnet only (Stellar's RPC providers page, checked 2026-10-18); mainnet is
 * served by third-party providers, and choosing one would be choosing a vendor
 * for every user. So a mainnet read needs an explicit `SOROBAN_RPC_URL`.
 */
export const NETWORKS = {
  testnet: {
    passphrase: 'Test SDF Network ; September 2015' as TestnetPassphrase,
    defaultRpcUrl: 'https://soroban-testnet.stellar.org',
  },
  mainnet: {
    passphrase: 'Public Global Stellar Network ; September 2015',
    defaultRpcUrl: undefined,
  },
} as const satisfies Record<NetworkName, { passphrase: string; defaultRpcUrl: string | undefined }>;

/** Where to read the provider list from, for the mainnet message. Not a recommendation. */
export const RPC_PROVIDERS_URL = 'https://developers.stellar.org/docs/data/apis/rpc/providers';
