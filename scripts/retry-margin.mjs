/**
 * Pure helpers for the testnet retry-margin measurement.
 * No network. The live runner is `measure-retry-margin.mjs`.
 *
 * A hosted renewal has to be included in a ledger that is still live.
 * The margin is how long a failed or late submit may take to be noticed,
 * plus how long the retry then takes to be included, plus one ledger of slack
 * so the retry is not aimed at the ledger that just reported the failure.
 */

export const TESTNET_PASSPHRASE = 'Test SDF Network ; September 2015';
export const MAINNET_PASSPHRASE = 'Public Global Stellar Network ; September 2015';
export const FUTURENET_PASSPHRASE = 'Test SDF Future Network ; October 2022';
export const TESTNET_RPC_URL = 'https://soroban-testnet.stellar.org';
export const TESTNET_RPC_HOST = 'soroban-testnet.stellar.org';
export const FRIENDBOT_HOST = 'friendbot.stellar.org';

/** Stellar secret seeds start with S. Public keys start with G and are not secrets. */
const SECRET_KEY = /S[A-Z2-7]{55}/;

export const CSV_COLUMNS = [
  'scenario',
  'run',
  'started_at',
  'finished_at',
  'seconds',
  'ledgers',
  'sim_ledger',
  'send_ledger',
  'inclusion_ledger',
  'drift_seconds',
  'drift_ledgers',
  'sim_resource_fee_stroops',
  'declared_resource_fee_stroops',
  'fee_charged_stroops',
  'inclusion_fee_charged_stroops',
  'non_refundable_stroops',
  'refundable_stroops',
  'rent_stroops',
  'network_soroban_inclusion_min_stroops',
  'network_soroban_inclusion_p50_stroops',
  'network_soroban_inclusion_max_stroops',
  'network_inclusion_min_stroops',
  'network_inclusion_p50_stroops',
  'network_inclusion_max_stroops',
  'send_status',
  'final_status',
  'result_code',
  'polls',
  'tx_hash',
  'source_public',
  'contract_id',
  'sequence_from',
  'sequence_to',
  'note',
];

const NUMERIC_FIELDS = [
  'seconds',
  'ledgers',
  'drift_seconds',
  'drift_ledgers',
  'sim_resource_fee_stroops',
  'declared_resource_fee_stroops',
  'fee_charged_stroops',
  'inclusion_fee_charged_stroops',
  'non_refundable_stroops',
  'refundable_stroops',
  'rent_stroops',
  'network_soroban_inclusion_min_stroops',
  'network_soroban_inclusion_p50_stroops',
  'network_soroban_inclusion_max_stroops',
  'network_inclusion_min_stroops',
  'network_inclusion_p50_stroops',
  'network_inclusion_max_stroops',
];

export function redact(value) {
  return String(value ?? '').replace(SECRET_KEY, '[redacted]');
}

export function assertNoSecret(value) {
  const text = String(value ?? '');
  if (SECRET_KEY.test(text)) {
    throw new Error('Refusing to record a secret key');
  }
}

/**
 * Refuse anything that is not Stellar testnet.
 * One accepted shape: network flag `testnet`, the testnet passphrase, and
 * `https://soroban-testnet.stellar.org` with no userinfo. Every other
 * passphrase, host, or flag is a refusal, including mainnet and futurenet.
 */
export function assertTestnetOnly(input) {
  const network = input?.network;
  const passphrase = input?.passphrase ?? '';
  const rpcUrl = input?.rpcUrl ?? '';
  const problems = [];

  if (network !== 'testnet') {
    problems.push(`network flag ${JSON.stringify(network)} is not testnet`);
  }
  if (passphrase !== TESTNET_PASSPHRASE) {
    problems.push('passphrase is not the Stellar testnet passphrase');
  }
  if (passphrase === MAINNET_PASSPHRASE || /mainnet/i.test(passphrase)) {
    problems.push('mainnet passphrase');
  }
  if (passphrase === FUTURENET_PASSPHRASE || /futurenet/i.test(passphrase)) {
    problems.push('futurenet passphrase');
  }

  let url;
  try {
    url = new globalThis.URL(rpcUrl);
  } catch {
    problems.push('rpc url is not a url');
  }
  if (url) {
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:') problems.push('rpc url is not https');
    if (url.username || url.password) problems.push('rpc url carries userinfo');
    if (host !== TESTNET_RPC_HOST) problems.push(`rpc host ${host} is not ${TESTNET_RPC_HOST}`);
    if (/mainnet/i.test(rpcUrl) || host === 'horizon.stellar.org') {
      problems.push('mainnet rpc url');
    }
    if (/futurenet/i.test(rpcUrl)) problems.push('futurenet rpc url');
  }

  if (problems.length > 0) {
    const error = new Error(`Refusing to run: ${problems.join('; ')}`);
    error.code = 'REFUSED_NETWORK';
    throw error;
  }
}

export function assertFriendbotUrl(friendbotUrl) {
  let url;
  try {
    url = new globalThis.URL(friendbotUrl);
  } catch {
    throw new Error('Refusing to fund: friendbot url from getNetwork is not a url');
  }
  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== FRIENDBOT_HOST) {
    throw new Error('Refusing to fund: friendbot host is not the testnet friendbot');
  }
  if (/mainnet|futurenet/i.test(friendbotUrl)) {
    throw new Error('Refusing to fund: friendbot url names another network');
  }
}

/**
 * Nearest-rank percentile. p95 of 20 values is the 19th (index 18).
 * Median of an even count is the mean of the two central values.
 * Empty input returns null. Non-finite values are dropped, not replaced.
 */
export function summarize(values) {
  const xs = [];
  for (const value of values) {
    const number = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(number)) xs.push(number);
  }
  xs.sort((a, b) => a - b);
  if (xs.length === 0) return null;
  const rank = (p) => {
    const index = Math.min(xs.length, Math.max(1, Math.ceil(p * xs.length))) - 1;
    return xs[index];
  };
  const median =
    xs.length % 2 === 1 ? xs[(xs.length - 1) / 2] : (xs[xs.length / 2 - 1] + xs[xs.length / 2]) / 2;
  return {
    n: xs.length,
    min: xs[0],
    median,
    p95: rank(0.95),
    max: xs[xs.length - 1],
  };
}

/**
 * margin = p95(detection) + p95(inclusion) + safety.
 * Safety is one ledger, whose seconds are the measured p95 ledger-close
 * interval. Missing any input returns undetermined. No default is filled in.
 */
export function recommendRetryMargin(stats) {
  const required = [
    'detectionSeconds',
    'inclusionSeconds',
    'closeSeconds',
    'detectionLedgers',
    'inclusionLedgers',
  ];
  const missing = required.filter((key) => {
    const summary = stats?.[key];
    return (
      !summary || !Number.isFinite(summary.n) || summary.n < 1 || !Number.isFinite(summary.p95)
    );
  });
  if (missing.length > 0) {
    return { status: 'undetermined', missing, seconds: null, ledgers: null };
  }
  const safetyLedgers = 1;
  const safetySeconds = stats.closeSeconds.p95;
  return {
    status: 'measured',
    seconds: stats.detectionSeconds.p95 + stats.inclusionSeconds.p95 + safetySeconds,
    ledgers: stats.detectionLedgers.p95 + stats.inclusionLedgers.p95 + safetyLedgers,
    safetyLedgers,
    safetySeconds,
    detectionN: stats.detectionSeconds.n,
    inclusionN: stats.inclusionSeconds.n,
    closeN: stats.closeSeconds.n,
    detectionScenario: stats.detectionScenario ?? null,
  };
}

export function parseArgs(argv) {
  const args = [...argv];
  let network;
  let rpcUrl = TESTNET_RPC_URL;
  let passphrase = TESTNET_PASSPHRASE;
  let submit = false;
  let runs = 20;
  let out = 'scripts/fixtures/e4-02-retry-margin.csv';
  let help = false;

  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    const next = args[i + 1];
    if (arg === '--help' || arg === '-h') help = true;
    else if (arg === '--submit') submit = true;
    else if (arg === '--network') {
      network = next;
      i += 1;
    } else if (arg === '--rpc-url') {
      rpcUrl = next;
      i += 1;
    } else if (arg === '--passphrase') {
      passphrase = next;
      i += 1;
    } else if (arg === '--runs') {
      runs = Number(next);
      i += 1;
    } else if (arg === '--out') {
      out = next;
      i += 1;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }

  if (!help && submit) {
    if (!Number.isInteger(runs) || runs < 1 || runs > 100) {
      throw new Error('Refusing to run: --runs must be an integer from 1 to 100');
    }
    assertTestnetOnly({ network, rpcUrl, passphrase });
  } else if (
    !help &&
    (network !== undefined || argv.includes('--rpc-url') || argv.includes('--passphrase'))
  ) {
    assertTestnetOnly({ network: network ?? 'testnet', rpcUrl, passphrase });
  }

  return {
    help,
    mode: submit ? 'submit' : 'dry-run',
    network: network ?? null,
    rpcUrl,
    passphrase,
    runs,
    out,
  };
}

export function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const text = String(value);
  assertNoSecret(text);
  if (/[",\n\r]/.test(text)) return `"${text.replaceAll('"', '""')}"`;
  return text;
}

export function toCsv(rows) {
  const lines = [CSV_COLUMNS.join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map((column) => csvEscape(row[column])).join(','));
  }
  const text = `${lines.join('\n')}\n`;
  assertNoSecret(text);
  return text;
}

export function parseCsv(text) {
  assertNoSecret(text);
  const rows = [];
  let field = '';
  let row = [];
  let quoted = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    if (row.length === 1 && row[0] === '' && rows.length > 0) {
      row = [];
      return;
    }
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else quoted = false;
      } else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ',') pushField();
    else if (char === '\n') {
      pushField();
      pushRow();
    } else if (char !== '\r') field += char;
  }
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }
  if (rows.length === 0) return [];
  const header = rows[0];
  return rows.slice(1).map((cells) => {
    const record = {};
    header.forEach((column, index) => {
      record[column] = cells[index] ?? '';
    });
    return record;
  });
}

export function summarizeRows(rows) {
  const scenarios = [...new Set(rows.map((row) => row.scenario).filter(Boolean))];
  const byScenario = {};
  for (const scenario of scenarios) {
    const group = rows.filter((row) => row.scenario === scenario);
    const fields = {};
    for (const field of NUMERIC_FIELDS) {
      const summary = summarize(group.map((row) => row[field]));
      if (summary) fields[field] = summary;
    }
    byScenario[scenario] = { n: group.length, fields };
  }
  return byScenario;
}

export function txResultCode(result) {
  const arm = result?.result;
  if (!arm || typeof arm.type !== 'string') return null;
  return arm.type;
}

export function sorobanFeeParts(meta) {
  if (!meta || (meta.type !== 'v3' && meta.type !== 'v4')) return null;
  const soroban = meta.value?.sorobanMeta ?? null;
  if (!soroban?.ext || soroban.ext.type !== 'v1') return null;
  const v1 = soroban.ext.value;
  if (!v1) return null;
  return {
    nonRefundable: v1.totalNonRefundableResourceFeeCharged,
    refundable: v1.totalRefundableResourceFeeCharged,
    rent: v1.rentFeeCharged,
  };
}

export function inclusionFeeCharged(feeCharged, parts) {
  if (typeof feeCharged !== 'bigint' || !parts) return null;
  const resource = parts.nonRefundable + parts.refundable;
  const inclusion = feeCharged - resource;
  if (inclusion < 0n) return null;
  return inclusion;
}

export function ledgerCloseDeltas(ledgers) {
  const ordered = [...ledgers].sort((a, b) => a.sequence - b.sequence);
  const deltas = [];
  for (let i = 1; i < ordered.length; i += 1) {
    const previous = ordered[i - 1];
    const current = ordered[i];
    const seconds = Number(current.ledgerCloseTime) - Number(previous.ledgerCloseTime);
    if (!Number.isFinite(seconds)) continue;
    deltas.push({
      seconds,
      ledgers: current.sequence - previous.sequence,
      sequenceFrom: previous.sequence,
      sequenceTo: current.sequence,
    });
  }
  return deltas;
}
