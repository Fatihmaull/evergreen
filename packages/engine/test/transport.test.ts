import {
  Account,
  Keypair,
  Networks,
  Operation,
  TransactionBuilder,
  rpc,
} from '@stellar/stellar-sdk';
import { describe, expect, it, vi } from 'vitest';
import { executionTransport } from '../src/transport.js';

// Exercise the installed SDK's HTTP error shapes, not a fabricated Axios error.
function transport() {
  const sleep = vi.fn(async () => {});
  const server = new rpc.Server('https://offline.invalid', { timeout: 15000 });
  return {
    sleep,
    rpc: executionTransport(
      server,
      {
        read: async () => {
          throw new Error('Unexpected reader');
        },
      },
      () => new Date(),
      sleep,
    ).rpc,
  };
}
function response(status: number, result = {}) {
  return new Response(JSON.stringify({ jsonrpc: '2.0', id: 1, result }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('execution transport through the installed SDK, offline fetch', () => {
  it.each([429, 503])(
    'retries a real SDK HTTP %s read with the documented backoff',
    async (status) => {
      const fetch = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValueOnce(response(status))
        .mockResolvedValueOnce(response(status))
        .mockResolvedValue(response(200, { passphrase: Networks.TESTNET }));
      try {
        const t = transport();
        expect(await t.rpc.getNetwork()).toMatchObject({ passphrase: Networks.TESTNET });
        expect(fetch).toHaveBeenCalledTimes(3);
        expect(t.sleep.mock.calls).toEqual([[1000], [2000]]);
      } finally {
        fetch.mockRestore();
      }
    },
  );
  it('does not retry an HTTP 400 read', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(400));
    try {
      const t = transport();
      await expect(t.rpc.getNetwork()).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(t.sleep).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
  it('does not retry send even for an SDK HTTP 503 failure', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(response(503));
    try {
      const t = transport();
      const tx = new TransactionBuilder(new Account(Keypair.random().publicKey(), '1'), {
        fee: '100',
        networkPassphrase: Networks.TESTNET,
      })
        .addOperation(Operation.extendFootprintTtl({ extendTo: 1000 }))
        .setTimeout(60)
        .build();
      await expect(t.rpc.sendTransaction(tx)).rejects.toThrow();
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(t.sleep).not.toHaveBeenCalled();
    } finally {
      fetch.mockRestore();
    }
  });
});
