import { describe, expect, it, vi } from 'vitest';
import { Networks, rpc } from '@stellar/stellar-sdk';
import { createSimulatingQuoter } from '../src/rent-quoter.js';

/** Guinea-pig A's real instance key. A hand-made one fails XDR decode. */
const KEY = 'AAAABgAAAAEblswW+PDBZ8QGOhf7+j8AvTtHrEL+O4eNCZiCZ4RiuwAAABQAAAAB';
const SOURCE = 'GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE';

/**
 * A server that answers `getAccount` and returns scripted `minResourceFee`
 * values in order. Nothing here touches the network.
 */
function server(fees: string[]): { server: rpc.Server; calls: number[] } {
  const calls: number[] = [];
  let index = 0;
  const fake = {
    getAccount: () => Promise.resolve({ accountId: () => SOURCE, sequenceNumber: () => '1' }),
    simulateTransaction: () => {
      const fee = fees[index] ?? fees[fees.length - 1]!;
      index += 1;
      return Promise.resolve({ minResourceFee: fee, transactionData: {}, events: [] });
    },
  } as unknown as rpc.Server;
  return { server: fake, calls };
}

const options = { sourceAccountId: SOURCE, networkPassphrase: Networks.TESTNET };

describe('createSimulatingQuoter — rent is the DIFFERENCE between two simulations', () => {
  it('subtracts the no-op baseline, so no fitted constant is needed', () => {
    // The whole reason this exists: the first implementation subtracted a
    // measured non-refundable constant and reported 9,349 stroops of "rent"
    // for an extend that needed none.
    const { server: s } = server(['11708', '91309']);
    return createSimulatingQuoter(s, options)
      .quoteDetailed({ entryKeys: [KEY], extendToLedgers: 2_000_000 })
      .then(([q]) => {
        expect(q?.baselineFeeStroops).toBe('11708');
        expect(q?.minResourceFeeStroops).toBe('91309');
        expect(q?.estimatedRentStroops).toBe('79601'); // 91309 - 11708
      });
  });

  it('🔴 reports ZERO rent when the target needs no extension', () => {
    // Baseline and target price identically because `extendTo` is a target and
    // the entry already satisfies it. Reporting the fixed cost as rent here was
    // the exact defect the differential approach removed.
    const { server: s } = server(['11708', '11708']);
    return createSimulatingQuoter(s, options)
      .quoteDetailed({ entryKeys: [KEY], extendToLedgers: 1 })
      .then(([q]) => {
        expect(q?.estimatedRentStroops).toBe('0');
      });
  });

  it('never reports negative rent if the target somehow prices below baseline', () => {
    const { server: s } = server(['91309', '11708']);
    return createSimulatingQuoter(s, options)
      .quoteDetailed({ entryKeys: [KEY], extendToLedgers: 1 })
      .then(([q]) => {
        expect(q?.estimatedRentStroops).toBe('0');
      });
  });

  it('prices each key against its own footprint, never as one blended fee', () => {
    // A batched simulation returns a single fee that cannot be attributed back
    // to individual entries — which is what the per-unique-key sum needs.
    const simulate = vi.fn(() =>
      Promise.resolve({ minResourceFee: '11708', transactionData: {}, events: [] }),
    );
    const s = {
      getAccount: () => Promise.resolve({ accountId: () => SOURCE, sequenceNumber: () => '1' }),
      simulateTransaction: simulate,
    } as unknown as rpc.Server;
    return createSimulatingQuoter(s, options)
      .quoteDetailed({ entryKeys: [KEY, KEY], extendToLedgers: 2_000_000 })
      .then((quotes) => {
        expect(quotes).toHaveLength(2);
        // Two entries x (baseline + target) = four simulations.
        expect(simulate).toHaveBeenCalledTimes(4);
      });
  });

  it('surfaces a simulation refusal as a readable error, not a raw payload', () => {
    const s = {
      getAccount: () => Promise.resolve({ accountId: () => SOURCE, sequenceNumber: () => '1' }),
      simulateTransaction: () => Promise.resolve({ error: 'entry not found' }),
    } as unknown as rpc.Server;
    return expect(
      createSimulatingQuoter(s, options).quoteDetailed({
        entryKeys: [KEY],
        extendToLedgers: 2_000_000,
      }),
    ).rejects.toThrow(/Simulation refused/);
  });

  it('exposes the same result through the plain quote() seam', () => {
    const { server: s } = server(['11708', '91309']);
    return createSimulatingQuoter(s, options)
      .quote({ entryKeys: [KEY], extendToLedgers: 2_000_000 })
      .then(([q]) => {
        expect(q?.estimatedRentStroops).toBe('79601');
      });
  });
});

describe('createSimulatingQuoter — the default synthetic identity', () => {
  it('🔴 works with NO sourceAccountId — the path that removed the hardcoded key', () => {
    // Found by the per-file coverage floor on its first run: every existing
    // test passed an explicit account, so the default — the whole point of
    // removing our own key from the published bundle — was never exercised.
    const { server: s } = server(['11708', '91309']);
    return createSimulatingQuoter(s, { networkPassphrase: Networks.TESTNET })
      .quoteDetailed({ entryKeys: [KEY], extendToLedgers: 2_000_000 })
      .then(([q]) => {
        expect(q?.estimatedRentStroops).toBe('79601');
      });
  });

  it('generates a DIFFERENT identity per quoter, never a shared constant', () => {
    // A fixed fallback would be the hardcoded account again, wearing a
    // generated-looking name.
    const seen = new Set<string>();
    const capture = {
      getAccount: () => Promise.reject(new Error('must not be called')),
      simulateTransaction: (tx: { source: string }) => {
        seen.add(tx.source);
        return Promise.resolve({ minResourceFee: '11708', transactionData: {}, events: [] });
      },
    } as unknown as rpc.Server;
    const opts = { networkPassphrase: Networks.TESTNET };
    return Promise.all([
      createSimulatingQuoter(capture, opts).quoteDetailed({
        entryKeys: [KEY],
        extendToLedgers: 2_000_000,
      }),
      createSimulatingQuoter(capture, opts).quoteDetailed({
        entryKeys: [KEY],
        extendToLedgers: 2_000_000,
      }),
    ]).then(() => {
      expect(seen.size).toBeGreaterThan(1);
    });
  });

  it('treats an absent minResourceFee as zero rather than crashing', () => {
    // A malformed simulation response must not take the scan down with it.
    const s = {
      getAccount: () => Promise.reject(new Error('must not be called')),
      simulateTransaction: () => Promise.resolve({ transactionData: {}, events: [] }),
    } as unknown as rpc.Server;
    return createSimulatingQuoter(s, { networkPassphrase: Networks.TESTNET })
      .quoteDetailed({ entryKeys: [KEY], extendToLedgers: 2_000_000 })
      .then(([q]) => {
        expect(q?.estimatedRentStroops).toBe('0');
        expect(q?.minResourceFeeStroops).toBe('0');
      });
  });
});
