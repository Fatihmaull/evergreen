/**
 * Strict input parsing for the watchlist routes (docs/API.md §6). Each parser
 * returns the parsed value or a `Refusal` naming the field; nothing here
 * echoes the request back, so an error cannot carry a secret or another
 * user's data (§9).
 */
import { StrKey, xdr } from '@stellar/stellar-sdk';
import type {
  AutopilotPatch,
  NewWatchItem,
  WatchNetwork,
  WatchPatch,
  WatchScope,
} from './store.js';

export interface Refusal {
  readonly ok: false;
  readonly field: string;
  readonly message: string;
}
export type Parsed<T> = { readonly ok: true; readonly value: T } | Refusal;

const refuse = (field: string, message: string): Refusal => ({ ok: false, field, message });
const ok = <T>(value: T): Parsed<T> => ({ ok: true, value });

/**
 * Caps the spec does not state. They keep one signed-in user from storing an
 * unbounded row, and are listed as open questions in the PR (PH2-E2-05).
 */
export const LABEL_MAX_CHARS = 100;
export const DATA_KEYS_MAX = 100;
export const DATA_KEY_MAX_CHARS = 2048;

/** Largest i128, the Soroban `Stroops` bound; the column is numeric(39,0). */
const I128_MAX = 2n ** 127n - 1n;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

function onlyKeys(obj: Obj, allowed: readonly string[], path: string): Refusal | undefined {
  for (const key of Object.keys(obj)) {
    if (!allowed.includes(key)) return refuse(`${path}${key}`, 'Unknown field.');
  }
  return undefined;
}

export function parseNetwork(v: unknown, field = 'network'): Parsed<WatchNetwork> {
  return v === 'testnet' || v === 'mainnet'
    ? ok(v)
    : refuse(field, "network must be 'testnet' or 'mainnet'.");
}

export function parseContractId(v: unknown, field = 'contractId'): Parsed<string> {
  return typeof v === 'string' && /^C[A-Z2-7]{55}$/.test(v) && StrKey.isValidContract(v)
    ? ok(v)
    : refuse(field, 'contractId must be a valid contract ID (C…).');
}

export function parseLabel(v: unknown, field = 'label'): Parsed<string> {
  if (typeof v !== 'string') return refuse(field, 'label must be a string.');
  const label = v.trim();
  // eslint-disable-next-line no-control-regex -- the point is to refuse control characters
  if (label === '' || [...label].length > LABEL_MAX_CHARS || /[\u0000-\u001f\u007f]/.test(label)) {
    return refuse(
      field,
      `label must be 1 to ${LABEL_MAX_CHARS} characters, with no control characters.`,
    );
  }
  return ok(label);
}

/** A canonical base64 `LedgerKey` XDR: it must decode, and encode back to the same text. */
function isLedgerKey(v: unknown): v is string {
  if (typeof v !== 'string' || v === '' || v.length > DATA_KEY_MAX_CHARS) return false;
  try {
    return xdr.LedgerKey.fromXDR(v, 'base64').toXDR('base64') === v;
  } catch {
    return false;
  }
}

export function parseScope(v: unknown, field = 'scope'): Parsed<WatchScope> {
  if (!isObj(v)) return refuse(field, 'scope must be { dataKeys: [...] } or { noDataKeys: true }.');
  if ('noDataKeys' in v) {
    const extra = onlyKeys(v, ['noDataKeys'], `${field}.`);
    if (extra !== undefined) return extra;
    return v['noDataKeys'] === true
      ? ok({ noDataKeys: true })
      : refuse(`${field}.noDataKeys`, 'noDataKeys must be true.');
  }
  const extra = onlyKeys(v, ['dataKeys'], `${field}.`);
  if (extra !== undefined) return extra;
  const keys = v['dataKeys'];
  if (!Array.isArray(keys) || keys.length === 0 || keys.length > DATA_KEYS_MAX) {
    return refuse(
      `${field}.dataKeys`,
      `dataKeys must hold 1 to ${DATA_KEYS_MAX} keys; use { noDataKeys: true } for none.`,
    );
  }
  if (!keys.every(isLedgerKey)) {
    return refuse(`${field}.dataKeys`, 'Every data key must be a canonical base64 LedgerKey.');
  }
  return ok({ dataKeys: [...new Set(keys)] });
}

export function parseStroops(v: unknown, field: string): Parsed<string> {
  if (typeof v !== 'string' || !/^(?:0|[1-9]\d{0,38})$/.test(v) || BigInt(v) > I128_MAX) {
    return refuse(field, 'Amounts are stroops as a decimal string.');
  }
  return ok(v);
}

function parseLedgers(v: unknown, field: string): Parsed<number> {
  return typeof v === 'number' && Number.isSafeInteger(v) && v > 0
    ? ok(v)
    : refuse(field, 'Ledgers are a positive whole number.');
}

export function parseAutopilot(v: unknown, field = 'autopilot'): Parsed<AutopilotPatch> {
  if (!isObj(v)) return refuse(field, 'autopilot must be an object.');
  if (v['enabled'] === false) {
    const extra = onlyKeys(v, ['enabled'], `${field}.`);
    return extra ?? ok({ enabled: false });
  }
  if (v['enabled'] !== true) return refuse(`${field}.enabled`, 'enabled must be true or false.');
  const extra = onlyKeys(
    v,
    ['enabled', 'payerWallet', 'thresholdLedgers', 'extendToLedgers', 'budget'],
    `${field}.`,
  );
  if (extra !== undefined) return extra;
  const payer = v['payerWallet'];
  if (typeof payer !== 'string' || !StrKey.isValidEd25519PublicKey(payer)) {
    return refuse(`${field}.payerWallet`, 'payerWallet must be a linked G… address.');
  }
  const threshold = parseLedgers(v['thresholdLedgers'], `${field}.thresholdLedgers`);
  if (!threshold.ok) return threshold;
  const extendTo = parseLedgers(v['extendToLedgers'], `${field}.extendToLedgers`);
  if (!extendTo.ok) return extendTo;
  const budget = v['budget'];
  if (!isObj(budget)) return refuse(`${field}.budget`, 'Turning autopilot on needs a budget.');
  const budgetExtra = onlyKeys(
    budget,
    ['perJobMaxStroops', 'per30DaysMaxStroops'],
    `${field}.budget.`,
  );
  if (budgetExtra !== undefined) return budgetExtra;
  const perJob = parseStroops(budget['perJobMaxStroops'], `${field}.budget.perJobMaxStroops`);
  if (!perJob.ok) return perJob;
  const per30 = parseStroops(budget['per30DaysMaxStroops'], `${field}.budget.per30DaysMaxStroops`);
  if (!per30.ok) return per30;
  return ok({
    enabled: true,
    payerWallet: payer,
    thresholdLedgers: threshold.value,
    extendToLedgers: extendTo.value,
    perJobMaxStroops: perJob.value,
    per30DaysMaxStroops: per30.value,
  });
}

export function parseNewItem(body: unknown): Parsed<NewWatchItem> {
  if (!isObj(body)) return refuse('body', 'Send a JSON object.');
  const extra = onlyKeys(body, ['network', 'contractId', 'label', 'scope'], '');
  if (extra !== undefined) return extra;
  const network = parseNetwork(body['network']);
  if (!network.ok) return network;
  const contractId = parseContractId(body['contractId']);
  if (!contractId.ok) return contractId;
  if (!('scope' in body)) return refuse('scope', 'scope is required.');
  const scope = parseScope(body['scope']);
  if (!scope.ok) return scope;
  if (!('label' in body)) {
    return ok({ network: network.value, contractId: contractId.value, scope: scope.value });
  }
  const label = parseLabel(body['label']);
  if (!label.ok) return label;
  return ok({
    network: network.value,
    contractId: contractId.value,
    scope: scope.value,
    label: label.value,
  });
}

export function parsePatch(body: unknown): Parsed<WatchPatch> {
  if (!isObj(body)) return refuse('body', 'Send a JSON object.');
  const extra = onlyKeys(body, ['label', 'scope', 'autopilot'], '');
  if (extra !== undefined) return extra;
  if (Object.keys(body).length === 0) return refuse('body', 'Nothing to change.');
  const patch: { label?: string; scope?: WatchScope; autopilot?: AutopilotPatch } = {};
  if ('label' in body) {
    const label = parseLabel(body['label']);
    if (!label.ok) return label;
    patch.label = label.value;
  }
  if ('scope' in body) {
    const scope = parseScope(body['scope']);
    if (!scope.ok) return scope;
    patch.scope = scope.value;
  }
  if ('autopilot' in body) {
    const autopilot = parseAutopilot(body['autopilot']);
    if (!autopilot.ok) return autopilot;
    patch.autopilot = autopilot.value;
  }
  return ok(patch);
}
