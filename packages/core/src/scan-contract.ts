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

/** Explicit known-key scope for one contract; never a storage enumeration. */
export interface ContractScanRequest {
  readonly contract: ContractRef;
  readonly dataKeys?: readonly LedgerKey[];
  readonly noDataKeys?: boolean;
}

type ExpectedEntry = {
  readonly kind: LedgerEntryTTL['kind'];
  readonly contracts: string[];
};

/** Preserve the single-contract API on the same validated multi-contract path. */
export function scanContract(
  reader: LedgerEntryReader,
  contract: ContractRef,
  dataKeys: readonly LedgerKey[] = [],
  options: { readonly noDataKeys?: boolean } = {},
): Promise<ScanResult> {
  return scanContracts(reader, [{ contract, dataKeys, ...options }]);
}

/** Read each canonical key once, preserving all known input consumers. */
export async function scanContracts(
  reader: LedgerEntryReader,
  requests: readonly ContractScanRequest[],
): Promise<ScanResult> {
  const entries: Record<LedgerKey, LedgerEntryTTL> = {};
  const issues: ScanIssue[] = [];
  const supplied: Record<string, number> = {};
  const declarations: Record<string, boolean> = {};
  const contracts = new Map<string, ContractRef>();
  const result: ScanResult = {
    network: 'testnet',
    contracts: [],
    entries,
    issues,
    coverage: { mode: 'known-keys', dataKeysSuppliedByContract: supplied },
  };
  function issue(
    kind: ScanIssue['kind'],
    message: string,
    consumers: readonly string[],
    key?: string,
    observedAtLedger?: number,
  ): void {
    issues.push({
      kind,
      message,
      contracts: [...new Set(consumers)],
      ...(key === undefined ? {} : { entryKey: key }),
      ...(observedAtLedger === undefined ? {} : { observedAtLedger }),
    });
  }

  const groups = new Map<
    string,
    {
      instance: LedgerKey;
      data: Map<LedgerKey, LedgerEntryTTL['kind']>;
      hasData: boolean;
      noDataKeys: boolean;
      invalid: boolean;
    }
  >();
  if (!Array.isArray(requests)) {
    issue('invalid-response', 'Scan requests must be an array.', []);
    return result;
  }
  for (const request of requests) {
    if (!object(request) || !object(request.contract) || typeof request.contract.id !== 'string') {
      issue('invalid-response', 'Each scan request must contain a contract ID.', []);
      continue;
    }
    const { contract } = request;
    const id = request.contract.id;
    const previous = contracts.get(id);
    const label = typeof contract.label === 'string' ? contract.label : undefined;
    contracts.set(id, {
      id,
      ...(previous?.label !== undefined
        ? { label: previous.label }
        : label !== undefined
          ? { label }
          : {}),
    });
    let instance: LedgerKey;
    try {
      instance = instanceKey(id);
    } catch {
      issue('invalid-response', 'Invalid contract ID. Expected a Stellar contract address.', [id]);
      continue;
    }
    let group = groups.get(id);
    if (!group) {
      group = { instance, data: new Map(), hasData: false, noDataKeys: false, invalid: false };
      groups.set(id, group);
    }
    if (request.noDataKeys !== undefined && typeof request.noDataKeys !== 'boolean') {
      issue('invalid-response', 'noDataKeys must be a boolean caller assertion.', [id]);
      group.invalid = true;
    }
    group.noDataKeys ||= request.noDataKeys === true;
    const dataKeys = request.dataKeys === undefined ? [] : request.dataKeys;
    if (!Array.isArray(dataKeys)) {
      issue('invalid-response', 'dataKeys must be an array of serialized LedgerKeys.', [id]);
      group.invalid = true;
      continue;
    }
    group.hasData ||= dataKeys.length > 0;
    for (const input of dataKeys) {
      try {
        const key = parseKey(input);
        if (
          key.type !== 'contractData' ||
          key.contractData.key.type === 'scvLedgerKeyContractInstance' ||
          Address.fromScAddress(key.contractData.contract).toString() !== id
        )
          throw new Error('Wrong data key');
        const durability = key.contractData.durability.name;
        if (durability !== 'persistent' && durability !== 'temporary')
          throw new Error('Wrong durability');
        group.data.set(key.toXDR('base64'), durability);
      } catch {
        issue(
          'invalid-response',
          'Invalid data key: expected persistent/temporary ContractData for this contract.',
          [id],
        );
      }
    }
  }

  const instances = new Map<LedgerKey, ExpectedEntry>();
  const data = new Map<LedgerKey, ExpectedEntry>();
  function expectEntry(
    target: Map<LedgerKey, ExpectedEntry>,
    key: LedgerKey,
    kind: LedgerEntryTTL['kind'],
    id: string,
  ): void {
    const existing = target.get(key);
    if (!existing) target.set(key, { kind, contracts: [id] });
    else if (!existing.contracts.includes(id)) existing.contracts.push(id);
  }
  for (const [id, group] of groups) {
    supplied[id] = group.data.size;
    if (group.noDataKeys) declarations[id] = true;
    if (group.noDataKeys && group.hasData) {
      issue(
        'invalid-response',
        'Cannot declare no data keys while supplying data keys for the same contract.',
        [id],
      );
      group.invalid = true;
    }
    if (group.invalid) continue;
    expectEntry(instances, group.instance, 'instance', id);
    for (const [key, kind] of group.data) expectEntry(data, key, kind, id);
  }

  async function read(
    expected: ReadonlyMap<LedgerKey, ExpectedEntry>,
  ): Promise<Map<LedgerKey, xdr.LedgerEntryData>> {
    const decoded = new Map<LedgerKey, xdr.LedgerEntryData>();
    const keys = [...expected.keys()];
    for (let start = 0; start < keys.length; start += MAX_KEYS_PER_READ) {
      const batch = keys.slice(start, start + MAX_KEYS_PER_READ);
      const consumers = [...new Set(batch.flatMap((key) => expected.get(key)!.contracts))];
      let response: unknown;
      try {
        response = await reader.read(batch);
      } catch {
        issue(
          'rpc-error',
          'RPC read failed for a batch; retry the scan. Successful batches are retained.',
          consumers,
        );
        continue;
      }
      if (!object(response) || !ledger(response.latestLedger) || !Array.isArray(response.entries)) {
        issue(
          'invalid-response',
          'RPC response must contain a valid latestLedger and entries array.',
          consumers,
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
            consumers,
            undefined,
            observedAtLedger,
          );
          continue;
        }
        if (!requested.has(key)) {
          issue(
            'invalid-response',
            'RPC returned an unrequested entry.',
            consumers,
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
            expected.get(key)!.contracts,
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
          const kind = expected.get(key)?.kind;
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
            contracts: [...expected.get(key)!.contracts],
            observedAtLedger,
            ttl: observeTTL({ liveUntilLedgerSeq: row.liveUntilLedgerSeq, observedAtLedger }),
          };
          decoded.set(key, value);
        } catch {
          issue(
            'invalid-response',
            'RPC entry payload or TTL is invalid or does not match its requested key.',
            expected.get(key)!.contracts,
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
            expected.get(key)!.contracts,
            key,
            observedAtLedger,
          );
      }
    }
    return decoded;
  }

  const observed = await read(instances);
  for (const [instance] of instances) {
    const instanceValue = observed.get(instance);
    if (!instanceValue) continue;
    if (
      instanceValue.type !== 'contractData' ||
      instanceValue.contractData.val.type !== 'scvContractInstance'
    )
      continue;
    const executable = instanceValue.contractData.val.instance.executable;
    const consumers = instances.get(instance)!.contracts;
    if (executable.type === 'contractExecutableWasm') {
      for (const id of consumers) expectEntry(data, codeKey(executable.wasmHash.value), 'code', id);
    } else {
      issue(
        'unsupported-executable',
        'Instance has a non-Wasm executable; this scanner does not discover its code.',
        consumers,
        instance,
        entries[instance]?.observedAtLedger,
      );
    }
  }
  await read(data);
  return {
    ...result,
    contracts: [...contracts.values()],
    coverage: {
      mode: 'known-keys',
      dataKeysSuppliedByContract: supplied,
      ...(Object.keys(declarations).length ? { noDataKeysDeclaredByContract: declarations } : {}),
    },
  };
}
