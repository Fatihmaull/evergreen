import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { NetworkMismatchError } from '@evergreen-stellar/core';
import type { ExtendPrice } from '@evergreen-stellar/core';
import type { Stroops } from '@evergreen-stellar/shared-types';
import { createEvergreenMcpServer, DEFAULT_ADDITIONAL_LEDGERS } from '../src/server.js';
import type { McpDependencies } from '../src/server.js';
import { networkFromArgs } from '../src/args.js';
import { runCli } from '../../cli/src/command.js';
import { readerFromFixture } from '../../core/test/mock-rpc.js';

// Tests never touch the network: the reader replays a recorded RPC response.
const FIXTURE = new URL(
  '../../core/test/fixtures/getLedgerEntries-guinea-pig-a.json',
  import.meta.url,
).pathname;
const recorded = JSON.parse(readFileSync(FIXTURE, 'utf8')) as {
  result: { entries: { key: string }[] };
};
const DATA_KEYS = recorded.result.entries.slice(2).map((r) => r.key);
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';

const PRICE: ExtendPrice = {
  totalStroops: '1234' as Stroops,
  rentStroops: '1000' as Stroops,
  otherStroops: '234' as Stroops,
  entryCount: 2,
  additionalLedgers: DEFAULT_ADDITIONAL_LEDGERS,
  cappedEntryCount: 0,
  maxEntryTtl: 3_110_400,
  pricedAtLedger: 100,
  rentByEntry: {},
};

function deps(overrides: Partial<McpDependencies> = {}): McpDependencies {
  return {
    network: 'testnet',
    connect: vi.fn(async () => readerFromFixture(FIXTURE)),
    priceExtend: vi.fn(async () => PRICE),
    ...overrides,
  };
}

async function connected(d: McpDependencies) {
  const server = createEvergreenMcpServer(d);
  const client = new Client({ name: 'test', version: '0' });
  const [a, b] = InMemoryTransport.createLinkedPair();
  await Promise.all([server.connect(a), client.connect(b)]);
  return client;
}

function text(result: Awaited<ReturnType<Client['callTool']>>): string {
  const [first] = result.content as { type: string; text: string }[];
  return first!.text;
}

describe('MCP server — the decided shape (PH2-E1-07)', () => {
  it('exposes exactly two tools, scan and cost, both marked read-only', async () => {
    const client = await connected(deps());
    const { tools } = await client.listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(['cost', 'scan']);
    for (const tool of tools) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint).toBe(false);
    }
  });

  it('no tool accepts an RPC URL or a network: both are fixed at server start', async () => {
    const client = await connected(deps());
    const { tools } = await client.listTools();
    for (const tool of tools) {
      const props = Object.keys(tool.inputSchema.properties ?? {});
      expect(props.filter((p) => /rpc|url|network|secret|key$/i.test(p))).toEqual([]);
    }
  });

  // Guard: the schemas are strict. Removing `.strict()` makes these calls succeed
  // with the extra argument silently ignored, and this test fails.
  it('refuses an rpcUrl or network argument instead of ignoring it', async () => {
    const d = deps();
    const client = await connected(d);
    for (const [name, args] of [
      ['scan', { contractIds: [A], rpcUrl: 'https://example.invalid' }],
      ['cost', { contractId: A, network: 'mainnet' }],
    ] as const) {
      const result = await client.callTool({ name, arguments: args });
      expect(result.isError).toBe(true);
    }
    expect(d.connect).not.toHaveBeenCalled();
  });

  it('refuses a malformed contract ID before any read', async () => {
    const d = deps();
    const client = await connected(d);
    const result = await client.callTool({
      name: 'scan',
      arguments: { contractIds: ['--submit'] },
    });
    expect(result.isError).toBe(true);
    expect(d.connect).not.toHaveBeenCalled();
  });

  it('scan returns what `evergreen scan --json` returns for the same scope', async () => {
    const client = await connected(deps());
    const result = await client.callTool({
      name: 'scan',
      arguments: { contractIds: [A], dataKeys: DATA_KEYS },
    });
    expect(result.isError).toBeFalsy();
    const mcp = JSON.parse(text(result)) as Record<string, unknown>;

    const cli = await runCli(['scan', A, '--keys-file', 'k.json', '--json'], {
      connect: async () => readerFromFixture(FIXTURE),
      readKeysFile: async () => JSON.stringify({ dataKeys: DATA_KEYS }),
      now: () => new Date('2026-09-05T00:00:00Z'),
    });
    const parsed = JSON.parse(cli.stdout) as Record<string, unknown>;
    for (const field of ['network', 'contracts', 'entries', 'issues', 'coverage']) {
      expect(mcp[field], field).toEqual(parsed[field]);
    }
  });

  it('cost prices by simulation through the injected pricer, with the CLI default increment', async () => {
    const d = deps();
    const client = await connected(d);
    const result = await client.callTool({ name: 'cost', arguments: { contractId: A } });
    expect(result.isError).toBeFalsy();
    expect(JSON.parse(text(result))).toEqual({
      network: 'testnet',
      contractId: A,
      estimate: PRICE,
    });
    expect(d.priceExtend).toHaveBeenCalledWith(
      expect.objectContaining({ additionalLedgers: DEFAULT_ADDITIONAL_LEDGERS }),
    );
  });

  it('a wrong-network RPC is reported as such, and the URL is never echoed', async () => {
    const client = await connected(
      deps({
        connect: async () => {
          throw new NetworkMismatchError(
            'testnet',
            'Public Global Stellar Network ; September 2015',
          );
        },
      }),
    );
    const result = await client.callTool({ name: 'scan', arguments: { contractIds: [A] } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Refusing to read');
  });

  it('an unreachable RPC says nothing was read and leaks no URL', async () => {
    const client = await connected(
      deps({
        connect: async () => {
          throw new Error('fetch failed https://rpc.example/?key=SECRET');
        },
      }),
    );
    const result = await client.callTool({ name: 'cost', arguments: { contractId: A } });
    expect(result.isError).toBe(true);
    expect(text(result)).not.toContain('SECRET');
    expect(text(result)).toContain('Nothing was read');
  });

  it('a pricing failure is reported without submitting anything', async () => {
    const client = await connected(
      deps({
        priceExtend: async () => {
          throw new Error('simulation failed');
        },
      }),
    );
    const result = await client.callTool({ name: 'cost', arguments: { contractId: A } });
    expect(result.isError).toBe(true);
    expect(text(result)).toContain('Nothing was submitted');
  });
});

describe('networkFromArgs — the network is chosen once, at start', () => {
  it('accepts no option, or exactly --network <name>', () => {
    expect(networkFromArgs([])).toEqual({});
    expect(networkFromArgs(['--network', 'mainnet'])).toEqual({ network: 'mainnet' });
  });
  it('refuses anything else, including an RPC URL flag', () => {
    expect(networkFromArgs(['--rpc-url', 'https://x']).error).toMatch(/usage/);
    expect(networkFromArgs(['--network']).error).toMatch(/usage/);
    expect(networkFromArgs(['--network', '--x']).error).toMatch(/usage/);
  });
});
