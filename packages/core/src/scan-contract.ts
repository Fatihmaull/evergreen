import { Address, xdr } from '@stellar/stellar-sdk';
import type {
  ContractRef,
  LedgerEntryTTL,
  LedgerKey,
  ScanIssue,
  ScanResult,
} from '@evergreen-stellar/shared-types';
import type { LedgerEntryReader } from './rpc.js';
import { codeKey, instanceKey } from './rpc.js';
import { observeTTL } from './ttl.js';

const MAX_KEYS_PER_READ = 200;

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function ledger(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 0xffff_ffff;
}

function parseKey(value: unknown): xdr.LedgerKey {
  if (typeof value !== 'string') throw new Error('Invalid ledger key');
  const text = value.trim();
  // Buffer's base64 decoder ignores invalid characters; do not accept that repair.
  if (!text || Buffer.from(text, 'base64').toString('base64') !== text)
    throw new Error('Invalid ledger key');
  const key = xdr.LedgerKey.fromXDR(text, 'base64');
  if (key.toXDR('base64') !== text) throw new Error('Invalid ledger key');
  return key;
}

function payloadKey(value: xdr.LedgerEntryData): LedgerKey {
  if (value.type === 'contractData') {
    const data = value.contractData;
    return xdr.LedgerKey.contractData(
      new xdr.LedgerKeyContractData({
        contract: data.contract,
        key: data.key,
        durability: data.durability,
      }),
    ).toXDR('base64');
  }
  if (value.type === 'contractCode') return codeKey(value.contractCode.hash.value);
  throw new Error('Unsupported entry type');
}

/**
 * Read one contract's instance/code plus explicit persistent/temporary keys.
 * RPC cannot enumerate arbitrary storage. Coverage always says known-keys.
 * Multi-contract consumer merging and observation reconciliation are D8-04.
 */
export async function scanContract(
  reader: LedgerEntryReader,
  contract: ContractRef,
  dataKeys: readonly LedgerKey[] = [],
  options: { readonly noDataKeys?: boolean } = {},
): Promise<ScanResult> {
  const entries: Record<LedgerKey, LedgerEntryTTL> = {};
  const issues: ScanIssue[] = [];
  const supplied: Record<string, number> = {};
  const result: ScanResult = {
    network: 'testnet',
    contracts: [contract],
    entries,
    issues,
    coverage: {
      mode: 'known-keys',
      dataKeysSuppliedByContract: supplied,
      ...(options.noDataKeys === true
        ? { noDataKeysDeclaredByContract: { [contract.id]: true } }
        : {}),
    },
  };
  function issue(
    kind: ScanIssue['kind'],
    message: string,
    key?: string,
    observedAtLedger?: number,
  ): void {
    issues.push({
      kind,
      message,
      contracts: [contract.id],
      ...(key === undefined ? {} : { entryKey: key }),
      ...(observedAtLedger === undefined ? {} : { observedAtLedger }),
    });
  }

  let instance: LedgerKey;
  try {
    instance = instanceKey(contract.id);
  } catch {
    issue('invalid-response', 'Invalid contract ID. Expected a Stellar contract address.');
    return result;
  }
  const data = new Map<LedgerKey, LedgerEntryTTL['kind']>();
  if (!Array.isArray(dataKeys)) {
    issue('invalid-response', 'dataKeys must be an array of serialized LedgerKeys.');
    return result;
  }
  if (options.noDataKeys === true && dataKeys.length > 0) {
    issue('invalid-response', 'Cannot declare no data keys while supplying data keys.');
    return result;
  }
  for (const input of dataKeys) {
    try {
      const key = parseKey(input);
      if (
        key.type !== 'contractData' ||
        key.contractData.key.type === 'scvLedgerKeyContractInstance' ||
        Address.fromScAddress(key.contractData.contract).toString() !== contract.id
      ) {
        throw new Error('Wrong data key');
      }
      const durability = key.contractData.durability.name;
      if (durability !== 'persistent' && durability !== 'temporary')
        throw new Error('Wrong durability');
      data.set(key.toXDR('base64'), durability);
    } catch {
      // Neither untrusted input nor raw exceptions enter diagnostics (may contain secrets).
      issue(
        'invalid-response',
        'Invalid data key: expected persistent/temporary ContractData for this contract.',
      );
    }
  }
  supplied[contract.id] = data.size;

  async function read(
    expected: ReadonlyMap<LedgerKey, LedgerEntryTTL['kind']>,
  ): Promise<Map<LedgerKey, xdr.LedgerEntryData>> {
    const decoded = new Map<LedgerKey, xdr.LedgerEntryData>();
    const keys = [...expected.keys()];
    for (let start = 0; start < keys.length; start += MAX_KEYS_PER_READ) {
      const batch = keys.slice(start, start + MAX_KEYS_PER_READ);
      let response: unknown;
      try {
        response = await reader.read(batch);
      } catch {
        issue(
          'rpc-error',
          'RPC read failed for a batch; retry the scan. Successful batches are retained.',
        );
        continue;
      }
      if (!object(response) || !ledger(response.latestLedger) || !Array.isArray(response.entries)) {
        issue(
          'invalid-response',
          'RPC response must contain a valid latestLedger and entries array.',
        );
        continue;
      }
      const observedAtLedger = response.latestLedger;
      const seen = new Set<LedgerKey>();
      const requested = new Set(batch);
      for (const row of response.entries as unknown[]) {
        let key: string;
        try {
          if (!object(row)) throw new Error('Invalid row');
          key = parseKey(row.key).toXDR('base64');
        } catch {
          issue(
            'invalid-response',
            'RPC returned a malformed ledger key.',
            undefined,
            observedAtLedger,
          );
          continue;
        }
        if (!requested.has(key)) {
          issue(
            'invalid-response',
            'RPC returned an unrequested entry.',
            undefined,
            observedAtLedger,
          );
          continue;
        }
        if (seen.has(key)) {
          // Do not keep either of two contradictory observations of one requested key.
          delete entries[key];
          decoded.delete(key);
          issue(
            'invalid-response',
            'RPC returned a duplicate entry; its observation was discarded.',
            key,
            observedAtLedger,
          );
          continue;
        }
        seen.add(key);
        try {
          if (
            !object(row) ||
            typeof row.entryXdr !== 'string' ||
            (row.liveUntilLedgerSeq !== undefined && !ledger(row.liveUntilLedgerSeq))
          )
            throw new Error('Invalid row');
          const value = xdr.LedgerEntryData.fromXDR(row.entryXdr, 'base64');
          if (value.toXDR('base64') !== row.entryXdr || payloadKey(value) !== key)
            throw new Error('Mismatched payload');
          const kind = expected.get(key);
          if (kind === undefined) throw new Error('Unexpected key');
          if (
            kind === 'instance' &&
            (value.type !== 'contractData' || value.contractData.val.type !== 'scvContractInstance')
          ) {
            throw new Error('Invalid instance payload');
          }
          const lifecycle =
            kind === 'temporary'
              ? { kind, endBehavior: 'deleted' as const }
              : {
                  kind,
                  endBehavior: 'archived' as const,
                };
          entries[key] = {
            ...lifecycle,
            contracts: [contract.id],
            observedAtLedger,
            ttl: observeTTL({ liveUntilLedgerSeq: row.liveUntilLedgerSeq, observedAtLedger }),
          };
          decoded.set(key, value);
        } catch {
          issue(
            'invalid-response',
            'RPC entry payload or TTL is invalid or does not match its requested key.',
            key,
            observedAtLedger,
          );
        }
      }
      for (const key of batch) {
        if (!seen.has(key))
          issue(
            'entry-not-found',
            'No entry returned. Absence is not proof of archival or deletion.',
            key,
            observedAtLedger,
          );
      }
    }
    return decoded;
  }

  const observed = await read(new Map([[instance, 'instance']]));
  const instanceValue = observed.get(instance);
  if (
    instanceValue?.type === 'contractData' &&
    instanceValue.contractData.val.type === 'scvContractInstance'
  ) {
    const executable = instanceValue.contractData.val.instance.executable;
    if (executable.type === 'contractExecutableWasm') {
      data.set(codeKey(executable.wasmHash.value), 'code');
    } else {
      issue(
        'unsupported-executable',
        'Instance has a non-Wasm executable; this scanner does not discover its code.',
        instance,
      );
    }
  }
  await read(data);
  return result;
}
