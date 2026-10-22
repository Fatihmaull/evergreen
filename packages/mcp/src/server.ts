import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import {
  coverageIssues,
  isValidContractId,
  NetworkConfigError,
  NetworkMismatchError,
} from '@evergreen-stellar/core';
import type { ExtendPrice, LedgerEntryReader } from '@evergreen-stellar/core';
import { scanContracts } from '@evergreen-stellar/core';
import type { NetworkName, ScanResult } from '@evergreen-stellar/shared-types';

/**
 * Evergreen's MCP server (`PH2-E1-07`), in the shape Fatih decided:
 * - **read-only tools only: `scan` and `cost`.** Nothing here signs, submits or
 *   holds a key. There is no extend tool, and the dependencies below give the
 *   server no way to build one;
 * - **the network is chosen at server start**, never per call;
 * - **the RPC URL comes from the environment only**, never a tool argument,
 *   because tool arguments are visible in chat and a URL can carry a provider key.
 *   The input schemas are strict, so an unknown argument such as `rpcUrl` is
 *   refused rather than ignored.
 */
export const SERVER_NAME = 'evergreen';
export const SERVER_VERSION = '0.0.0';

/** Ceiling on contracts per call, so one tool call cannot fan out into an unbounded read. */
export const MAX_CONTRACTS_PER_CALL = 10;
/** The CLI's default for `--cost --ledgers`: about 30 days at ~5 s a ledger. */
export const DEFAULT_ADDITIONAL_LEDGERS = 518_400;

export interface McpDependencies {
  /** Fixed at start (`--network` or `EVERGREEN_NETWORK`), reported with every result. */
  readonly network: NetworkName;
  /** A reader verified against the chosen network. */
  connect(): Promise<LedgerEntryReader>;
  /** Simulation-only pricing: core's `priceExtend`. */
  priceExtend(args: {
    readonly scan: ScanResult;
    readonly additionalLedgers: number;
  }): Promise<ExtendPrice>;
}

const contractId = z
  .string()
  .refine(isValidContractId, { message: 'Not a valid Soroban contract ID (C…, 56 characters).' });

const dataKeys = z
  .array(z.string().min(1))
  .max(200)
  .optional()
  .describe('Optional base64 XDR LedgerKeys for persistent data entries, as in a CLI keys file.');

export const scanInput = z
  .object({
    contractIds: z.array(contractId).min(1).max(MAX_CONTRACTS_PER_CALL),
    dataKeys,
  })
  .strict();

export const costInput = z
  .object({
    contractId,
    dataKeys,
    additionalLedgers: z.number().int().positive().max(10_000_000).optional(),
  })
  .strict();

const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

function json(value: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(value, null, 2) }] };
}

function refusal(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: message }] };
}

/** Never echo the RPC URL: it is server configuration and may carry a key. */
function connectFailure(error: unknown): CallToolResult {
  if (error instanceof NetworkConfigError || error instanceof NetworkMismatchError) {
    return refusal(error.message);
  }
  return refusal(
    'Could not reach the Stellar RPC endpoint configured for this server. Nothing was read.',
  );
}

async function scan(
  deps: McpDependencies,
  ids: readonly string[],
  keys: readonly string[] | undefined,
): Promise<ScanResult | CallToolResult> {
  let reader: LedgerEntryReader;
  try {
    reader = await deps.connect();
  } catch (error) {
    return connectFailure(error);
  }
  const scanned = await scanContracts(
    reader,
    ids.map((id) =>
      keys === undefined ? { contract: { id } } : { contract: { id }, dataKeys: keys },
    ),
  );
  // As the CLI does: a scan that is incomplete must not hand a machine an empty issues array.
  return { ...scanned, issues: [...scanned.issues, ...coverageIssues(scanned)] };
}

function isToolResult(value: ScanResult | CallToolResult): value is CallToolResult {
  return 'content' in value;
}

export function createEvergreenMcpServer(deps: McpDependencies): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

  server.registerTool(
    'scan',
    {
      title: 'Scan contract TTL',
      description:
        `Read the TTL of Soroban contracts on ${deps.network} (instance, code, and any data keys given). ` +
        'Returns the same ScanResult shape as `evergreen scan --json`. Read-only: never signs or submits.',
      inputSchema: scanInput,
      annotations: READ_ONLY,
    },
    async ({ contractIds, dataKeys: keys }) => {
      const result = await scan(deps, contractIds, keys);
      return isToolResult(result) ? result : json(result);
    },
  );

  server.registerTool(
    'cost',
    {
      title: 'Price an extend',
      description:
        `Estimate what extending one contract's entries on ${deps.network} would cost, by simulation. ` +
        'An estimate to budget against, not a quoted price. Read-only: never signs or submits.',
      inputSchema: costInput,
      annotations: READ_ONLY,
    },
    async ({ contractId: id, dataKeys: keys, additionalLedgers }) => {
      const result = await scan(deps, [id], keys);
      if (isToolResult(result)) return result;
      try {
        const price = await deps.priceExtend({
          scan: result,
          additionalLedgers: additionalLedgers ?? DEFAULT_ADDITIONAL_LEDGERS,
        });
        return json({ network: result.network, contractId: id, estimate: price });
      } catch {
        return refusal('Could not price the extend by simulation. Nothing was submitted.');
      }
    },
  );

  return server;
}
