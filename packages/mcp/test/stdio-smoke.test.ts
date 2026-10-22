import { spawn } from 'node:child_process';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { build } from 'esbuild';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Smoke test of the SHIPPED shape (Fatih's decision 2a, 2026-10-22): bundle
 * `evergreen-mcp` exactly as the `bundle` script does, spawn it, and speak MCP
 * to it over stdio as a client would. `server.test.ts` covers behaviour through
 * an in-memory transport; this covers what that cannot see — the bundle loads,
 * the bin wires the stdio transport, and stdout carries only protocol.
 *
 * Offline: initialize, tools/list and a schema-rejected tools/call never reach
 * `connect()`, so no RPC is contacted. `SOROBAN_RPC_URL` points at a closed
 * local port anyway, so an accidental read would fail fast instead of going out.
 */

const PKG = new URL('..', import.meta.url).pathname;
const OUT = `${PKG}dist/smoke/evergreen-mcp.mjs`;
const SRC = (pkg: string) => new URL(`../../${pkg}/src/index.ts`, import.meta.url).pathname;
const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';

type Message = { id?: number; result?: Record<string, unknown>; error?: { message: string } };

let child: ChildProcessWithoutNullStreams;
const pending = new Map<number, (m: Message) => void>();
let stray = '';
let nextId = 1;

function request(method: string, params: Record<string, unknown> = {}): Promise<Message> {
  const id = nextId++;
  const reply = new Promise<Message>((resolve, reject) => {
    pending.set(id, resolve);
    setTimeout(() => reject(new Error(`no reply to ${method}`)), 10_000).unref();
  });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', id, method, params })}\n`);
  return reply;
}

beforeAll(async () => {
  mkdirSync(`${PKG}dist/smoke`, { recursive: true });
  // Same flags as `pnpm --filter @evergreen-stellar/mcp bundle`; workspace
  // packages are read from source so the smoke test never runs a stale dist.
  await build({
    entryPoints: [`${PKG}src/bin.ts`],
    bundle: true,
    platform: 'node',
    format: 'esm',
    external: ['@stellar/stellar-sdk', '@modelcontextprotocol/sdk', 'zod'],
    alias: {
      '@evergreen-stellar/core': SRC('core'),
      '@evergreen-stellar/shared-types': SRC('shared-types'),
    },
    outfile: OUT,
    logLevel: 'silent',
  });
  child = spawn(process.execPath, [OUT, '--network', 'testnet'], {
    env: { PATH: process.env.PATH ?? '', SOROBAN_RPC_URL: 'http://127.0.0.1:9/' },
  });
  let buffer = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (chunk: string) => {
    buffer += chunk;
    let nl: number;
    while ((nl = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, nl);
      buffer = buffer.slice(nl + 1);
      try {
        const msg = JSON.parse(line) as Message;
        if (msg.id !== undefined) pending.get(msg.id)?.(msg);
      } catch {
        stray += line;
      }
    }
  });
  const init = await request('initialize', {
    protocolVersion: '2025-06-18',
    capabilities: {},
    clientInfo: { name: 'stdio-smoke', version: '0' },
  });
  expect(init.error).toBeUndefined();
  expect(init.result?.serverInfo).toMatchObject({ name: 'evergreen' });
  child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' })}\n`);
}, 60_000);

afterAll(() => {
  child?.kill();
});

describe('evergreen-mcp over stdio (built bundle)', () => {
  it('lists exactly the read-only tools scan and cost', async () => {
    const { result } = await request('tools/list');
    const tools = (result?.tools ?? []) as {
      name: string;
      annotations?: { readOnlyHint?: boolean };
    }[];
    expect(tools.map((t) => t.name).sort()).toEqual(['cost', 'scan']);
    for (const tool of tools) expect(tool.annotations?.readOnlyHint).toBe(true);
  });

  for (const [tool, extra] of [
    ['scan', { rpcUrl: 'https://rpc.example.invalid' }],
    ['scan', { network: 'mainnet' }],
    ['cost', { rpcUrl: 'https://rpc.example.invalid' }],
    ['cost', { network: 'mainnet' }],
  ] as const) {
    it(`rejects ${tool} with a ${Object.keys(extra)[0]} argument (strict schema)`, async () => {
      const args = tool === 'scan' ? { contractIds: [A], ...extra } : { contractId: A, ...extra };
      const reply = await request('tools/call', { name: tool, arguments: args });
      const text = JSON.stringify(reply);
      // Refused as invalid input, either as a protocol error or an isError result —
      // never a scan. The URL must not be echoed back.
      const refused =
        reply.error !== undefined || (reply.result as { isError?: boolean } | undefined)?.isError;
      expect(refused).toBe(true);
      expect(text).toMatch(/unrecognized|invalid/i);
      expect(text).not.toContain('"network":"testnet"');
      expect(text).not.toContain('rpc.example.invalid');
    });
  }

  it('writes nothing but protocol to stdout', () => {
    expect(stray).toBe('');
  });
});
