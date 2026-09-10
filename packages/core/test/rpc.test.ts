import { readFileSync } from 'node:fs';
import { Networks, rpc, xdr } from '@stellar/stellar-sdk';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { connectTestnet, createRpcReader, NotTestnetError } from '../src/rpc.js';

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url), 'utf8'),
) as {
  result: {
    latestLedger: number;
    entries: { key: string; xdr: string; liveUntilLedgerSeq: number }[];
  };
};

afterEach(() => vi.restoreAllMocks());

describe('SDK reader boundary (offline)', () => {
  it('retains payload XDR and optional TTL while serializing the SDK response', async () => {
    const server = new rpc.Server('https://rpc.invalid');
    const rows = fixture.result.entries.map((row, index) => ({
      key: xdr.LedgerKey.fromXDR(row.key, 'base64'),
      val: xdr.LedgerEntryData.fromXDR(row.xdr, 'base64'),
      ...(index === 0 ? {} : { liveUntilLedgerSeq: row.liveUntilLedgerSeq }),
    }));
    const get = vi.spyOn(server, 'getLedgerEntries').mockResolvedValue({
      latestLedger: fixture.result.latestLedger,
      entries: rows,
    });
    const keys = fixture.result.entries.map((row) => row.key);
    const result = await createRpcReader(server).read(keys);
    expect(get.mock.calls[0]?.map((key) => key.toXDR('base64'))).toEqual(keys);
    expect(result.latestLedger).toBe(fixture.result.latestLedger);
    expect(result.entries.map((row) => row.entryXdr)).toEqual(
      fixture.result.entries.map((row) => row.xdr),
    );
    expect(result.entries[0]?.liveUntilLedgerSeq).toBeUndefined();
    expect(result.entries[3]?.liveUntilLedgerSeq).toBe(
      fixture.result.entries[3]?.liveUntilLedgerSeq,
    );
  });

  it('refuses a non-Testnet passphrase before any entry read', async () => {
    vi.spyOn(rpc.Server.prototype, 'getNetwork').mockResolvedValue({ passphrase: Networks.PUBLIC });
    const read = vi
      .spyOn(rpc.Server.prototype, 'getLedgerEntries')
      .mockRejectedValue(new Error('must not read'));
    await expect(connectTestnet('https://rpc.invalid')).rejects.toBeInstanceOf(NotTestnetError);
    expect(read).not.toHaveBeenCalled();
  });
});
