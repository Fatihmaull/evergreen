import { readFileSync } from 'node:fs';
import {
  Account,
  Address,
  Keypair,
  Networks,
  SorobanDataBuilder,
  StrKey,
  xdr,
} from '@stellar/stellar-sdk';
import type { Transaction } from '@stellar/stellar-sdk';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { EvergreenConfig } from '@evergreen-stellar/shared-types';
import { instanceKey, PROTECTED_ENTRIES, SHARED_CODE_ENTRY_KEY } from '@evergreen-stellar/core';
import { runEngineExecution } from '../src/execution.js';

const A = 'CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L';
const D = StrKey.encodeContract(Buffer.alloc(32, 9));
const fixture = JSON.parse(
  readFileSync(
    new URL('../../core/test/fixtures/getLedgerEntries-guinea-pig-a.json', import.meta.url),
    'utf8',
  ),
).result as { latestLedger: number; entries: { key: string; xdr: string }[] };
const settings = JSON.parse(
  readFileSync(
    new URL('../../core/test/fixtures/state-archival-settings-2026-09-05.json', import.meta.url),
    'utf8',
  ),
).result.entries[0] as { key: string; xdr: string };
const persistent = fixture.entries[2]!.key;
const temporary = fixture.entries[3]!.key;
function setup(otherPayer = false) {
  const first = Keypair.random(),
    second = Keypair.random();
  let ledger = fixture.latestLedger;
  const rows = new Map(
    fixture.entries.map((e, i) => [
      e.key,
      { key: e.key, entryXdr: e.xdr, liveUntilLedgerSeq: ledger + (i === 1 ? 5000 : 50) },
    ]),
  );
  const value = xdr.LedgerEntryData.fromXDR(fixture.entries[0]!.xdr, 'base64');
  if (value.type !== 'contractData') throw new Error('fixture');
  const fields = { ...value.contractData, contract: new Address(D).toScAddress() };
  rows.set(instanceKey(D), {
    key: instanceKey(D),
    entryXdr: xdr.LedgerEntryData.contractData(new xdr.ContractDataEntry(fields)).toXDR('base64'),
    liveUntilLedgerSeq: ledger + 50,
  });
  const receipts = new Map<
    string,
    { status: string; txHash: string; ledger: number; envelopeXdr: xdr.TransactionEnvelope }
  >();
  const sequence = new Map<string, string>();
  const reader = {
    read: vi.fn(async (keys: readonly string[]) => ({
      latestLedger: ledger,
      entries: keys.flatMap((key) => {
        if (key === settings.key)
          return [{ key, entryXdr: settings.xdr, liveUntilLedgerSeq: undefined }];
        const row = rows.get(key);
        return row ? [row] : [];
      }),
    })),
  };
  const rpc = {
    getNetwork: vi.fn(async () => ({ passphrase: Networks.TESTNET })),
    getAccount: vi.fn(
      async (address: string) => new Account(address, sequence.get(address) ?? '12'),
    ),
    simulateTransaction: vi.fn(async (tx: Transaction) => {
      const envelope = tx.toEnvelope();
      if (envelope.type !== 'envelopeTypeTx' || envelope.value.tx.ext.type !== 'sorobanData')
        throw new Error('fixture');
      return {
        _parsed: true as const,
        id: '1',
        latestLedger: ledger,
        events: [],
        minResourceFee: '500',
        transactionData: new SorobanDataBuilder()
          .setReadOnly(envelope.value.tx.ext.value.resources.footprint.readOnly)
          .setResourceFee('500'),
      };
    }),
    sendTransaction: vi.fn(async (tx: Transaction) => {
      const envelope = tx.toEnvelope();
      if (envelope.type !== 'envelopeTypeTx' || envelope.value.tx.ext.type !== 'sorobanData')
        throw new Error('fixture');
      const key = envelope.value.tx.ext.value.resources.footprint.readOnly[0]!.toXDR('base64');
      const op = tx.operations[0]!;
      if (op.type !== 'extendFootprintTtl') throw new Error('unexpected operation');
      ledger++;
      rows.get(key)!.liveUntilLedgerSeq = ledger + op.extendTo;
      sequence.set(tx.source, tx.sequence);
      const hash = Buffer.from(tx.hash()).toString('hex');
      receipts.set(hash, { status: 'SUCCESS', txHash: hash, ledger, envelopeXdr: envelope });
      return { status: 'PENDING', hash };
    }),
    getTransaction: vi.fn(
      async (hash: string) => receipts.get(hash) ?? { status: 'NOT_FOUND', txHash: hash },
    ),
  };
  const config: EvergreenConfig = {
    network: {
      rpcUrl: 'https://soroban-testnet.stellar.org',
      networkPassphrase: 'Test SDF Network ; September 2015',
    },
    mode: 'dry-run',
    defaults: { bumpWhenRemainingLedgersBelow: 100, extendToLedgers: 1000 },
    contracts: [
      { id: A, payer: 'first', dataKeys: [persistent] },
      ...(otherPayer ? [{ id: D, payer: 'second' }] : []),
    ],
    payers: {
      first: {
        signer: 'ed25519',
        secretEnvVar: 'FIRST',
        sourceAccount: first.publicKey(),
        maxFeeStroops: '1200',
      },
      second: {
        signer: 'ed25519',
        secretEnvVar: 'SECOND',
        sourceAccount: second.publicKey(),
        maxFeeStroops: '600',
      },
    },
  };
  const recorder = { assertReady: vi.fn(async () => {}), record: vi.fn(async () => {}) };
  const readSecret = vi.fn((name: string) => (name === 'FIRST' ? first.secret() : second.secret()));
  let now = Date.now();
  const sleep = vi.fn(async (ms: number) => {
    now += ms;
  });
  const deps = { reader, rpc, recorder, readSecret, sleep, now: () => new Date(now) };
  return {
    config,
    deps,
    rows,
    recorder,
    rpc,
    reader,
    readSecret,
    first,
    setClock: (value: number) => {
      now = value;
    },
  };
}
// Every suite uses setup(): SDK envelopes and its injected clock must agree.
// Fake Date only, so transport sleeps and the real-delay regression still run.
beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
});
afterEach(() => {
  vi.useRealTimers();
});
describe('engine execution — real core primitives over fixture RPC', () => {
  it('simulates by default, without signer, secret or recorder access', async () => {
    const s = setup();
    const result = await runEngineExecution(s.config, s.deps);
    expect(result.mode).toBe('dry-run');
    expect(result.records.map((r) => r.outcome)).toEqual(['simulated', 'simulated']);
    expect(result.feesByPayer.first).toMatchObject({
      estimatedFeeStroops: '1200',
      reservedFeeStroops: '0',
    });
    expect(result.liveness.isAlarm).toBe(true);
    expect(result.exitCode).toBe(1);
    expect(s.readSecret).not.toHaveBeenCalled();
    expect(s.rpc.sendTransaction).not.toHaveBeenCalled();
    expect(s.recorder.assertReady).not.toHaveBeenCalled();
    expect(s.recorder.record).not.toHaveBeenCalled();
  });
  it('executes exactly a declared opted-in temporary key with verified post-state', async () => {
    const s = setup();
    const config = {
      ...s.config,
      mode: 'live' as const,
      payers: { ...s.config.payers, first: { ...s.config.payers.first!, maxFeeStroops: '1800' } },
      contracts: s.config.contracts.map((c) => ({
        ...c,
        dataKeys: [...(c.dataKeys ?? []), temporary],
        temporaryEntryPolicies: [{ entryKey: temporary, autoExtend: true }],
      })),
    };
    const result = await runEngineExecution(config, s.deps, { submit: true });
    const record = result.records.find((r) => r.entryKey === temporary);
    expect(record).toMatchObject({ outcome: 'succeeded' });
    expect(result.liveness.findings.some((f) => f.entryKey === temporary)).toBe(false);
  });
  it('executes, records intent first, and confirms the exact selected envelopes', async () => {
    const s = setup();
    const result = await runEngineExecution({ ...s.config, mode: 'live' }, s.deps, {
      submit: true,
    });
    expect(result.records.map((r) => r.outcome)).toEqual(['succeeded', 'succeeded']);
    expect(result.exitCode).toBe(0);
    expect(result.mode).toBe('live');
    expect(result.feesByPayer.first?.reservedFeeStroops).toBe('1200');
    expect(s.rpc.sendTransaction.mock.calls.map(([tx]) => tx.sequence)).toEqual(['13', '14']);
    expect(s.recorder.record).toHaveBeenCalledTimes(2);
    for (let i = 0; i < 2; i++)
      expect(s.recorder.record.mock.invocationCallOrder[i]).toBeLessThan(
        s.rpc.sendTransaction.mock.invocationCallOrder[i]!,
      );
    expect(JSON.stringify(s.recorder.record.mock.calls)).not.toContain(s.first.secret());
  });
  it('🔴 refuses live execution when the attempt journal is not reconciled', async () => {
    // W3-D16-02's third clause: handle an in-flight tx when overlapping runs
    // collide. An existing attempt file means a previous run left a hash whose
    // fate is unknown — submitting again can land the same extension twice, or
    // spend a fee against a sequence already consumed.
    //
    // Added 2026-09-14: removing `assertReady()` from execution.ts left all 637
    // tests green. The guard existed and nothing reached it.
    const s = setup();
    s.recorder.assertReady = vi.fn(async () => {
      throw new Error('attempt file exists with an unresolved hash');
    });
    await expect(
      runEngineExecution({ ...s.config, mode: 'live' }, s.deps, { submit: true }),
    ).rejects.toThrow(/RECORDER_UNAVAILABLE|recorder is not ready/i);
    // Nothing may be sent, and no secret may even be read.
    expect(s.rpc.sendTransaction).not.toHaveBeenCalled();
    expect(s.readSecret).not.toHaveBeenCalled();
  });

  it('does not silently activate from live config alone or submit from dry-run config', async () => {
    const s = setup();
    await expect(runEngineExecution({ ...s.config, mode: 'live' }, s.deps)).rejects.toThrow(
      /submit/,
    );
    await expect(runEngineExecution(s.config, s.deps, { submit: true })).rejects.toThrow(/mode/);
    expect(s.reader.read).not.toHaveBeenCalled();
    expect(s.readSecret).not.toHaveBeenCalled();
  });
  it('allows explicit dry-run of a live config and rejects conflicting flags', async () => {
    const s = setup();
    expect(
      (await runEngineExecution({ ...s.config, mode: 'live' }, s.deps, { dryRun: true })).mode,
    ).toBe('dry-run');
    await expect(
      runEngineExecution(s.config, s.deps, { submit: true, dryRun: true }),
    ).rejects.toThrow(/conflict/i);
    expect(s.readSecret).not.toHaveBeenCalled();
  });
  it('requires a recorder for live mode before network or secret access', async () => {
    const s = setup();
    const { recorder, ...deps } = s.deps;
    void recorder;
    await expect(
      runEngineExecution({ ...s.config, mode: 'live' }, deps, { submit: true }),
    ).rejects.toThrow(/recorder/);
    expect(s.reader.read).not.toHaveBeenCalled();
    expect(s.readSecret).not.toHaveBeenCalled();
  });
  it('refuses missing public payer or live budget before preparation', async () => {
    for (const missing of ['sourceAccount', 'maxFeeStroops'] as const) {
      const s = setup();
      const payer = { ...s.config.payers.first };
      delete payer[missing];
      const result = await runEngineExecution(
        { ...s.config, mode: 'live', payers: { ...s.config.payers, first: payer } },
        s.deps,
        { submit: true },
      );
      expect(result.exitCode).toBe(2);
      expect(s.rpc.simulateTransaction).not.toHaveBeenCalled();
      expect(s.readSecret).not.toHaveBeenCalled();
    }
  });
  it('stops all later sends after an uncertain first send, including another payer', async () => {
    const s = setup(true);
    s.rpc.sendTransaction.mockRejectedValue(new Error('private raw transport detail'));
    const result = await runEngineExecution({ ...s.config, mode: 'live' }, s.deps, {
      submit: true,
    });
    expect(result.records).toHaveLength(1);
    expect(result.records[0]?.outcome).toBe('submitted');
    expect(result.unattempted).toContain(instanceKey(D));
    expect(s.rpc.sendTransaction).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(result)).not.toContain('private raw');
  });
  it('does not reset a payer budget for a second key', async () => {
    const s = setup();
    const result = await runEngineExecution(
      {
        ...s.config,
        mode: 'live',
        payers: {
          ...s.config.payers,
          first: { ...s.config.payers.first, signer: 'ed25519', maxFeeStroops: '1000' },
        },
      },
      s.deps,
      { submit: true },
    );
    expect(result.records.map((r) => r.outcome)).toEqual(['succeeded', 'failed']);
    expect(s.rpc.sendTransaction).toHaveBeenCalledTimes(1);
    expect(result.exitCode).toBe(2);
  });
  it('preserves aggregate caps even in simulation', async () => {
    const s = setup();
    const result = await runEngineExecution(
      {
        ...s.config,
        payers: {
          ...s.config.payers,
          first: { ...s.config.payers.first, signer: 'ed25519', maxFeeStroops: '1000' },
        },
      },
      s.deps,
    );
    expect(result.records.map((r) => r.outcome)).toEqual(['simulated', 'failed']);
    expect(s.readSecret).not.toHaveBeenCalled();
  });
  it('rejects active aliases of one public account before preparing', async () => {
    const s = setup(true);
    const result = await runEngineExecution(
      {
        ...s.config,
        mode: 'live',
        payers: {
          ...s.config.payers,
          second: {
            signer: 'ed25519',
            secretEnvVar: 'SECOND',
            sourceAccount: s.first.publicKey(),
            maxFeeStroops: '600',
          },
        },
      },
      s.deps,
      { submit: true },
    );
    expect(result.exitCode).toBe(2);
    expect(s.rpc.simulateTransaction).not.toHaveBeenCalled();
  });
  it('never prepares temporary data without explicit consent', async () => {
    const s = setup();
    const result = await runEngineExecution(
      {
        ...s.config,
        contracts: [{ ...s.config.contracts[0]!, dataKeys: [persistent, temporary] }],
      },
      s.deps,
    );
    expect(result.decisions.find((d) => d.entryKey === temporary)).toMatchObject({
      action: 'skip',
      reason: expect.stringContaining('Temporary retention disabled'),
    });
    expect(result.previews.map((p) => p.entry.entryKey)).not.toContain(temporary);
  });
  it('retries transient account reads within the bound', async () => {
    const s = setup();
    s.rpc.getAccount.mockRejectedValueOnce(
      Object.assign(new Error('rate limited'), { status: 429 }),
    );
    const result = await runEngineExecution(s.config, s.deps);
    expect(result.records.every((r) => r.outcome === 'simulated')).toBe(true);
    expect(s.deps.sleep).toHaveBeenCalledWith(1000);
    expect(s.rpc.getAccount).toHaveBeenCalledTimes(3);
  });
  it('stops before send when the recorder fails, without claiming submission', async () => {
    const s = setup();
    s.recorder.record.mockRejectedValue(new Error('disk private detail'));
    const result = await runEngineExecution({ ...s.config, mode: 'live' }, s.deps, {
      submit: true,
    });
    expect(result.records[0]?.outcome).toBe('failed');
    expect(result.records[0]).not.toHaveProperty('transactionHash');
    expect(s.rpc.sendTransaction).not.toHaveBeenCalled();
  });
  it('never adds an initially healthy instance to a persistent-only footprint', async () => {
    const s = setup();
    s.rows.get(instanceKey(A))!.liveUntilLedgerSeq = fixture.latestLedger + 5000;
    const result = await runEngineExecution(s.config, s.deps);
    expect(result.previews.map((p) => p.entry.entryKey)).toEqual([persistent]);
  });
});

describe('engine execution — review boundaries', () => {
  it('executes A while preserving B/C and shared-code refusals in the same pass', async () => {
    const s = setup();
    const value = xdr.LedgerEntryData.fromXDR(fixture.entries[0]!.xdr, 'base64');
    if (value.type !== 'contractData') throw new Error('fixture');
    for (const subject of PROTECTED_ENTRIES) {
      s.rows.set(instanceKey(subject.contractId), {
        key: instanceKey(subject.contractId),
        entryXdr: xdr.LedgerEntryData.contractData(
          new xdr.ContractDataEntry({
            ...value.contractData,
            contract: new Address(subject.contractId).toScAddress(),
          }),
        ).toXDR('base64'),
        liveUntilLedgerSeq: fixture.latestLedger + 50,
      });
    }
    s.rows.get(SHARED_CODE_ENTRY_KEY)!.liveUntilLedgerSeq = fixture.latestLedger + 50;
    const result = await runEngineExecution(
      {
        ...s.config,
        mode: 'live',
        contracts: [...s.config.contracts, ...PROTECTED_ENTRIES.map((p) => ({ id: p.contractId }))],
      },
      s.deps,
      { submit: true },
    );
    expect(result.records.map((r) => [r.entryKey, r.outcome])).toEqual([
      [instanceKey(A), 'succeeded'],
      [persistent, 'succeeded'],
    ]);
    expect(s.rpc.sendTransaction).toHaveBeenCalledTimes(2);
    for (const key of [
      ...PROTECTED_ENTRIES.map((p) => instanceKey(p.contractId)),
      SHARED_CODE_ENTRY_KEY,
    ]) {
      expect(result.decisions.find((d) => d.entryKey === key)).toMatchObject({
        action: 'skip',
        reason: expect.stringContaining('WRITE GUARD'),
      });
      expect(result.previews.some((p) => p.entry.entryKey === key)).toBe(false);
      expect(
        result.liveness.findings.some((f) => f.entryKey === key && f.reason === 'skipped'),
      ).toBe(true);
    }
    expect(result.exitCode).toBe(1);
  });
  it('fails closed on an incomplete initial scan even when other keys are due', async () => {
    const s = setup(true);
    s.rows.delete(instanceKey(D));
    const result = await runEngineExecution({ ...s.config, mode: 'live' }, s.deps, {
      submit: true,
    });
    expect(
      result.preview.decisions.some((d) => d.entryKey === instanceKey(A) && d.action === 'extend'),
    ).toBe(true);
    expect(result.diagnostics).toContainEqual(expect.objectContaining({ code: 'SCAN_INCOMPLETE' }));
    expect(result.records).toEqual([]);
    expect(result.unattempted).toContain(instanceKey(A));
    expect(result.liveness.isAlarm).toBe(true);
    expect(result.exitCode).toBe(2);
    expect(s.readSecret).not.toHaveBeenCalled();
    expect(s.rpc.sendTransaction).not.toHaveBeenCalled();
  });
});

describe('engine execution — bounded failure and refresh paths', () => {
  it('polls only the same hash after NOT_FOUND and never sends a replacement', async () => {
    const s = setup();
    s.rpc.getTransaction.mockImplementation(async (hash) => ({
      status: 'NOT_FOUND',
      txHash: hash,
    }));
    const result = await runEngineExecution({ ...s.config, mode: 'live' }, s.deps, {
      submit: true,
    });
    expect(result.records[0]?.outcome).toBe('submitted');
    expect(s.rpc.sendTransaction).toHaveBeenCalledTimes(1);
    expect(s.rpc.getTransaction).toHaveBeenCalledTimes(12);
    expect(new Set(s.rpc.getTransaction.mock.calls.map(([hash]) => hash)).size).toBe(1);
    expect(result.unattempted).toContain(persistent);
  });
  it('does not retry a semantic simulation rejection', async () => {
    const s = setup();
    const simulation = vi.fn(async () => ({
      id: '1',
      latestLedger: fixture.latestLedger,
      error: 'rejected by simulation',
    }));
    const result = await runEngineExecution(s.config, {
      ...s.deps,
      rpc: { ...s.rpc, simulateTransaction: simulation },
    });
    expect(result.records[0]?.outcome).toBe('failed');
    expect(simulation).toHaveBeenCalledTimes(1);
    expect(s.deps.sleep).not.toHaveBeenCalled();
  });
  it('does not report success from a receipt without sufficient post-state', async () => {
    const s = setup();
    const send = s.rpc.sendTransaction.getMockImplementation()!;
    s.rpc.sendTransaction.mockImplementation(async (tx) => {
      const response = await send(tx);
      s.rows.get(instanceKey(A))!.liveUntilLedgerSeq = fixture.latestLedger + 50;
      return response;
    });
    const result = await runEngineExecution({ ...s.config, mode: 'live' }, s.deps, {
      submit: true,
    });
    expect(result.records[0]?.outcome).toBe('failed');
    expect(result.exitCode).toBe(2);
    expect(s.rpc.sendTransaction).toHaveBeenCalledTimes(1);
  });
  it('refuses wrong-network RPC before account lookup or secret access', async () => {
    const s = setup();
    s.rpc.getNetwork.mockResolvedValue({ passphrase: Networks.PUBLIC });
    await expect(runEngineExecution(s.config, s.deps)).rejects.toThrow(/Testnet/);
    expect(s.rpc.getAccount).not.toHaveBeenCalled();
    expect(s.readSecret).not.toHaveBeenCalled();
  });
  it('bounds a stalled read with the overall deadline', async () => {
    const s = setup();
    s.rpc.getNetwork.mockImplementation(() => new Promise(() => {}));
    await expect(runEngineExecution(s.config, s.deps, { maxRunMs: 5 })).rejects.toThrow(/deadline/);
    expect(s.rpc.sendTransaction).not.toHaveBeenCalled();
  });
  it('a stalled send is uncertain, not retried', async () => {
    const s = setup();
    s.rpc.sendTransaction.mockImplementation(() => new Promise(() => {}));
    const result = await runEngineExecution({ ...s.config, mode: 'live' }, s.deps, {
      submit: true,
      maxRunMs: 100,
    });
    expect(result.records[0]?.outcome).toBe('submitted');
    expect(s.rpc.sendTransaction).toHaveBeenCalledTimes(1);
  });
  it('refreshes after the initial decision and skips newly satisfied state without fabricating success', async () => {
    const s = setup();
    const read = s.reader.read.getMockImplementation()!;
    let settingsReads = 0;
    s.reader.read.mockImplementation(async (keys) => {
      const response = await read(keys);
      if (keys.includes(settings.key) && ++settingsReads === 1)
        s.rows.get(instanceKey(A))!.liveUntilLedgerSeq = fixture.latestLedger + 5000;
      return response;
    });
    const result = await runEngineExecution(s.config, s.deps);
    expect(result.preview.decisions.find((d) => d.entryKey === instanceKey(A))?.action).toBe(
      'extend',
    );
    expect(result.decisions.find((d) => d.entryKey === instanceKey(A))?.action).toBe('skip');
    expect(result.previews.map((p) => p.entry.entryKey)).toEqual([persistent]);
    expect(result.records.every((r) => r.entryKey !== instanceKey(A))).toBe(true);
    expect(result.liveness.isAlarm).toBe(true);
  });
});

it('keeps SDK envelope time aligned with the fixture clock after a real delay', async () => {
  const s = setup();
  await new Promise((resolve) => setTimeout(resolve, 1100));
  const result = await runEngineExecution({ ...s.config, mode: 'live' }, s.deps, { submit: true });
  expect(result.records.map((r) => r.outcome)).toEqual(['succeeded', 'succeeded']);
});
