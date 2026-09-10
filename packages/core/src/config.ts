import type {
  EvergreenConfig,
  ExecutionMode,
  PayerConfig,
  TestnetPassphrase,
} from '@evergreen-stellar/shared-types';

/**
 * Config loading (`W2-D13-01`). Pure: takes text, returns a validated config.
 * The caller reads the file, so this is testable without a filesystem.
 *
 * Three properties the shared types demand in comments and a loader has to
 * actually enforce, because a comment is not a mechanism:
 *
 *   - **Omitted `mode` means dry-run.** Live is an explicit opt-in, never a
 *     default and never inferred.
 *   - **Every contract's payer must resolve**, checked at the input boundary
 *     rather than discovered when a bump tries to sign.
 *   - **Only testnet.** The passphrase is compared, not a label trusted.
 *
 * And one this project learned the hard way: **secrets are named here, never
 * stored here.** A config carrying a secret key would be committed by someone,
 * eventually, so the loader rejects anything that looks like one.
 */

export const TESTNET_PASSPHRASE: TestnetPassphrase = 'Test SDF Network ; September 2015';

export interface ConfigLoadResult {
  readonly config: EvergreenConfig;
  /** Non-fatal, but printed. An empty array is not the same as "nothing to say". */
  readonly warnings: readonly string[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Documentation fields are `_`-prefixed by convention and carry no behaviour. */
function isDocumentationKey(key: string): boolean {
  return key.startsWith('_');
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) throw new ConfigError(`${path} must be an object.`);
  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new ConfigError(`${path} must be a non-empty string.`);
  }
  return value;
}

function requireLedgerCount(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ConfigError(`${path} must be a non-negative whole number of ledgers.`);
  }
  return value;
}

/**
 * Anything that looks like a Stellar secret seed. Checked on every string in
 * the file rather than only where a secret might plausibly go — the point is to
 * catch it wherever someone pasted it.
 */
const SECRET_SEED = /\bS[A-Z2-7]{55}\b/;

function assertNoSecrets(raw: string): void {
  if (SECRET_SEED.test(raw)) {
    throw new ConfigError(
      'This config appears to contain a Stellar SECRET KEY.\n' +
        'Evergreen never stores secrets in config — name an environment variable instead\n' +
        '(for example "secretEnvVar": "EVERGREEN_SIGNER_SECRET"). Rotate that key: a\n' +
        'secret written to a config file should be treated as already leaked.',
    );
  }
}

function parsePayer(value: unknown, id: string): PayerConfig {
  const payer = requireRecord(value, `payers.${id}`);
  const signer = payer.signer;
  if (signer === 'ed25519') {
    return { signer, secretEnvVar: requireString(payer.secretEnvVar, `payers.${id}.secretEnvVar`) };
  }
  if (signer === 'policy') {
    return { signer, signerRef: requireString(payer.signerRef, `payers.${id}.signerRef`) };
  }
  throw new ConfigError(`payers.${id}.signer must be "ed25519" or "policy".`);
}

export function loadConfig(raw: string): ConfigLoadResult {
  assertNoSecrets(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new ConfigError('Config is not valid JSON. Check for a trailing comma or a stray quote.');
  }
  const root = requireRecord(parsed, 'config');
  const warnings: string[] = [];

  const network = requireRecord(root.network, 'network');
  const networkPassphrase = requireString(network.networkPassphrase, 'network.networkPassphrase');
  if (networkPassphrase !== TESTNET_PASSPHRASE) {
    // Compare the passphrase, never trust a label that says "testnet".
    throw new ConfigError(
      `Refusing to load: network.networkPassphrase is "${networkPassphrase}", not Stellar testnet.\n` +
        'Evergreen runs against testnet only in this release.',
    );
  }

  const defaults = requireRecord(root.defaults, 'defaults');
  const thresholds = {
    bumpWhenRemainingLedgersBelow: requireLedgerCount(
      defaults.bumpWhenRemainingLedgersBelow,
      'defaults.bumpWhenRemainingLedgersBelow',
    ),
    extendToLedgers: requireLedgerCount(defaults.extendToLedgers, 'defaults.extendToLedgers'),
  };

  const payersRaw = requireRecord(root.payers, 'payers');
  const payers: Record<string, PayerConfig> = {};
  for (const [id, value] of Object.entries(payersRaw)) {
    if (isDocumentationKey(id)) continue;
    payers[id] = parsePayer(value, id);
  }
  if (Object.keys(payers).length === 0)
    throw new ConfigError('payers must define at least one payer.');

  if (!Array.isArray(root.contracts)) throw new ConfigError('contracts must be an array.');
  const contracts = root.contracts.map((value, index) => {
    const contract = requireRecord(value, `contracts[${index}]`);
    const id = requireString(contract.id, `contracts[${index}].id`);
    if (id.startsWith('REPLACE_WITH')) {
      throw new ConfigError(
        `contracts[${index}].id is still the placeholder from the example config.\n` +
          'Replace it with a real contract ID before running.',
      );
    }
    const payer = requireString(contract.payer, `contracts[${index}].payer`);
    if (!(payer in payers)) {
      // Checked here rather than discovered when a bump tries to sign.
      throw new ConfigError(
        `contracts[${index}].payer is "${payer}", which is not defined in payers.\n` +
          `Known payers: ${Object.keys(payers).join(', ')}`,
      );
    }
    const label = typeof contract.label === 'string' ? contract.label : undefined;
    // ADR-006 makes coverage part of the health answer, so a config that
    // dropped the caller's declaration would silently downgrade every
    // configured scan to "unknown scope". Carried through explicitly.
    if (contract.dataKeys !== undefined && !Array.isArray(contract.dataKeys)) {
      throw new ConfigError(`contracts[${index}].dataKeys must be an array of ledger keys.`);
    }
    const dataKeys = contract.dataKeys as readonly string[] | undefined;
    if (contract.noDataKeys !== undefined && typeof contract.noDataKeys !== 'boolean') {
      throw new ConfigError(`contracts[${index}].noDataKeys must be true or false.`);
    }
    const noDataKeys = contract.noDataKeys as boolean | undefined;
    if (noDataKeys === true && dataKeys !== undefined && dataKeys.length > 0) {
      // The same contradiction the CLI rejects. Catching it at load time means
      // it fails once, at the boundary, rather than on every run.
      throw new ConfigError(
        `contracts[${index}] declares noDataKeys while also supplying dataKeys.\n` +
          'Those cannot both be true. Remove one.',
      );
    }
    const overrides = isRecord(contract.thresholds) ? contract.thresholds : undefined;
    return {
      id,
      ...(label === undefined ? {} : { label }),
      payer,
      ...(dataKeys === undefined ? {} : { dataKeys }),
      ...(noDataKeys === undefined ? {} : { noDataKeys }),
      ...(overrides === undefined
        ? {}
        : {
            thresholds: {
              ...(overrides.bumpWhenRemainingLedgersBelow === undefined
                ? {}
                : {
                    bumpWhenRemainingLedgersBelow: requireLedgerCount(
                      overrides.bumpWhenRemainingLedgersBelow,
                      `contracts[${index}].thresholds.bumpWhenRemainingLedgersBelow`,
                    ),
                  }),
              ...(overrides.extendToLedgers === undefined
                ? {}
                : {
                    extendToLedgers: requireLedgerCount(
                      overrides.extendToLedgers,
                      `contracts[${index}].thresholds.extendToLedgers`,
                    ),
                  }),
            },
          }),
    };
  });

  // The decay-proof guard. `_doNotWatch` is documentation, so it cannot stop
  // anything by itself — but a contract sitting in BOTH lists is someone
  // half-way through the add/dry-run/confirm procedure, and that is exactly
  // when an unnoticed threshold mismatch destroys an unrepeatable proof.
  if (Array.isArray(root._doNotWatch)) {
    for (const entry of root._doNotWatch) {
      if (!isRecord(entry) || typeof entry.id !== 'string') continue;
      const watched = contracts.find((c) => c.id === entry.id);
      if (watched === undefined) continue;
      warnings.push(
        `⚠ ${watched.label ?? watched.id} is in BOTH "contracts" and "_doNotWatch".\n` +
          '  It is listed as a deliberate natural-decay subject. The engine will act on it.\n' +
          '  Verify the threshold in dry-run and confirm "no action needed" BEFORE going live —\n' +
          '  an early bump destroys ageing that cannot be recovered inside the sprint.\n' +
          '  See docs/SETUP.md § Putting B and C into the engine config.',
      );
    }
  }

  // Omission means dry-run. Live is explicit, never inferred.
  let mode: ExecutionMode = 'dry-run';
  if (root.mode !== undefined) {
    if (root.mode !== 'dry-run' && root.mode !== 'live') {
      throw new ConfigError('mode must be "dry-run" or "live" when present.');
    }
    mode = root.mode;
    if (mode === 'live') {
      warnings.push(
        '⚠ mode is "live": this config permits real transactions and real fees.\n' +
          '  Dry-run is the default for a reason; confirm this is intended.',
      );
    }
  }

  const notifications = isRecord(root.notifications)
    ? {
        channel: 'email' as const,
        toEnvVar: requireString(root.notifications.toEnvVar, 'notifications.toEnvVar'),
      }
    : undefined;

  return {
    config: {
      network: { rpcUrl: requireString(network.rpcUrl, 'network.rpcUrl'), networkPassphrase },
      mode,
      defaults: thresholds,
      contracts,
      payers,
      ...(notifications === undefined ? {} : { notifications }),
    },
    warnings,
  };
}
