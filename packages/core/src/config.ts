import { temporaryKey } from './temporary-policy.js';
import type {
  EvergreenConfig,
  BumpThresholds,
  Stroops,
  ExecutionMode,
  PayerConfig,
  TestnetPassphrase,
} from '@evergreen-stellar/shared-types';
import { DEFAULT_WARN_LEDGERS, resolveHealthThresholds } from './health.js';
import { needsAction, SECONDS_PER_LEDGER } from './ttl.js';
import { isValidPayerAccount } from './ed25519-signer.js';

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
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ConfigError(`${path} must be a non-negative safe whole number of ledgers.`);
  }
  return value;
}

const THRESHOLD_FIELDS = [
  'warnBelowLedgers',
  'bumpWhenRemainingLedgersBelow',
  'extendToLedgers',
] as const;

function parseThresholdFields(value: unknown, path: string): Partial<BumpThresholds> {
  const raw = requireRecord(value, path);
  const parsed: { -readonly [K in keyof BumpThresholds]?: BumpThresholds[K] } = {};
  for (const key of Object.keys(raw)) {
    if (isDocumentationKey(key)) continue;
    if (!THRESHOLD_FIELDS.some((field) => field === key)) {
      throw new ConfigError(
        `${path}.${key} is not a supported threshold field. Use warnBelowLedgers for warning and bumpWhenRemainingLedgersBelow for action.`,
      );
    }
  }
  for (const field of THRESHOLD_FIELDS) {
    if (raw[field] !== undefined)
      parsed[field] = requireLedgerCount(raw[field], `${path}.${field}`);
  }
  return parsed;
}

function validateThresholdPair(
  defaults: BumpThresholds,
  overrides: Partial<BumpThresholds> | undefined,
  path: string,
  warnings: string[],
): void {
  try {
    const pair = resolveHealthThresholds(defaults, overrides);
    if (
      defaults.warnBelowLedgers === undefined &&
      overrides?.warnBelowLedgers === undefined &&
      !needsAction(pair.criticalBelowLedgers, DEFAULT_WARN_LEDGERS) &&
      (path === 'defaults' || pair.criticalBelowLedgers !== defaults.bumpWhenRemainingLedgersBelow)
    ) {
      warnings.push(
        `${path}: warning omitted; derived warnBelowLedgers=${pair.warnBelowLedgers} to match the action threshold. Set an explicit warning horizon for an earlier warning.`,
      );
    }
  } catch (error) {
    throw new ConfigError(`${path}: ${(error as Error).message}`);
  }
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
    const sourceAccount =
      payer.sourceAccount === undefined
        ? undefined
        : requireString(payer.sourceAccount, `payers.${id}.sourceAccount`);
    if (sourceAccount !== undefined && !isValidPayerAccount(sourceAccount)) {
      throw new ConfigError(`payers.${id}.sourceAccount must be a public Ed25519 account.`);
    }
    const maxFeeStroops =
      payer.maxFeeStroops === undefined
        ? undefined
        : requireString(payer.maxFeeStroops, `payers.${id}.maxFeeStroops`);
    if (maxFeeStroops !== undefined && !/^[1-9]\d*$/.test(maxFeeStroops)) {
      throw new ConfigError(`payers.${id}.maxFeeStroops must be positive decimal integer stroops.`);
    }
    return {
      signer,
      secretEnvVar: requireString(payer.secretEnvVar, `payers.${id}.secretEnvVar`),
      ...(sourceAccount === undefined ? {} : { sourceAccount }),
      ...(maxFeeStroops === undefined ? {} : { maxFeeStroops: maxFeeStroops as Stroops }),
    };
  }
  if (signer === 'policy') {
    return { signer, signerRef: requireString(payer.signerRef, `payers.${id}.signerRef`) };
  }
  throw new ConfigError(`payers.${id}.signer must be "ed25519" or "policy".`);
}

/**
 * The shortest action window a scheduler can actually serve.
 *
 * Two configurable numbers have to stand in a relation and nothing enforced it:
 * the action threshold decides how much warning the engine gets, and the
 * SCHEDULER decides how often it can act on that warning. Set a threshold
 * shorter than the scheduler's worst gap and the engine silently never fires
 * inside its own window — no error, no alarm, an entry archiving while every
 * run reports healthy.
 *
 * Measured 2026-09-14 across two independent workflows: GitHub Actions delivers
 * ~7.5% of a declared 15-minute cron, **worst observed gap 331 minutes**
 * (docs/evidence/2026-09-14-scheduler-cadence). The constraint comes from the
 * scheduler, not from the protocol, and the message says so — a user who reads
 * "too low" as a Soroban rule will go looking in the wrong documentation.
 *
 * Four worst-gaps is the floor: one to notice, and three to survive the failures
 * that made the gap worst in the first place. At 5 s/ledger that is 15,888
 * ledgers, which is why the 17,280 default (a full day) clears it and a
 * "couple of hours" threshold does not.
 */
/**
 * MEASUREMENT — what the scheduler actually did. Not a policy.
 *
 * Sample: 20 `engine-cron` runs, 2026-09-12T19:19Z → 2026-09-15T01:31Z.
 * Median gap 136 min; worst gap 369 min; declared cron interval 15 min, so the
 * scheduler delivers about **11% of its declared cadence**.
 *
 * **Update this whenever anyone measures.** It should always be true, and it
 * will keep rising: a running maximum over a growing sample only goes up. It was
 * 331 when first recorded on 2026-09-14 and 369 nine hours later.
 *
 * Nothing enforces a policy against this number directly — that is
 * `SCHEDULER_GAP_FLOOR_MINUTES` below, and the separation is deliberate.
 */
export const WORST_OBSERVED_SCHEDULER_GAP_MINUTES = 369;

/**
 * FLOOR — what we are willing to allow. A decision, not an observation.
 *
 * Split from the measurement on 2026-09-15 because one constant was doing two
 * jobs with different update cadences. A floor that tracks the observed maximum
 * thrashes: every fresh measurement invalidates fixtures and retroactively fails
 * configurations that were correct the day before. That is a design defect, not
 * a value that needs updating faster.
 *
 * **Why 480 (8 hours):** a round operational boundary roughly 30% above the
 * current worst observation, chosen so ordinary drift cannot move it. It is not
 * derived from the measurement — deriving it is precisely what makes it move.
 *
 * **Review trigger, not automatic tracking:** if a measured gap ever exceeds 80%
 * of this floor (394 min), the headroom has been consumed and the floor needs a
 * deliberate decision. Do not raise it by reflex when a measurement lands.
 */
export const SCHEDULER_GAP_FLOOR_MINUTES = 480;

const MIN_ACTION_RUNS_IN_WINDOW = 4;

/**
 * Deliberately still derived from **331**, the measurement as of 2026-09-14, and
 * frozen there pending a decision after Sep 26.
 *
 * 🔴 **Recorded finding, do not silently fix.** At the current measurement of 369
 * this window would be `ceil(369 × 4 × 60 / 5) = 17,712` ledgers, and the default
 * action threshold of 17,280 would fall **below** it — giving **3.9 scheduler
 * runs** of margin against the 4 this constant exists to guarantee. 17,280 only
 * ever cleared the old value by accident: it was chosen before the scheduler was
 * ever measured.
 *
 * It is not changed here because raising the number that governs *when the engine
 * acts* in the week of guinea-pig B's crossing is the wrong week to do it. B
 * crosses ~2026-09-20 and C ~2026-09-25; revisit after Sep 26.
 */
const ACTION_WINDOW_GAP_BASIS_MINUTES = 331;
export const MIN_SAFE_ACTION_WINDOW_LEDGERS = Math.ceil(
  (ACTION_WINDOW_GAP_BASIS_MINUTES * MIN_ACTION_RUNS_IN_WINDOW * 60) / SECONDS_PER_LEDGER,
);
/**
 * Warns rather than refuses. A short threshold is legitimate on a scheduler we
 * have not measured — someone self-hosting on a real cron gets minutes, not
 * hours — so refusing would block a correct configuration. But it is silent
 * failure if nobody says anything, and this is the config loader's one chance.
 */
function warnIfBelowSchedulerFloor(
  // NOT a TTL policy comparison, and named so the lint rule can tell. This
  // compares a CONFIGURED WINDOW against a SCHEDULER FLOOR — neither side is a
  // remaining TTL. Renaming rather than disabling the rule: a suppression here
  // would be indistinguishable from a suppression on a real policy comparison.
  configuredActionLedgers: number,
  path: string,
  warnings: string[],
): void {
  if (configuredActionLedgers >= MIN_SAFE_ACTION_WINDOW_LEDGERS) return;
  const hours = ((configuredActionLedgers * SECONDS_PER_LEDGER) / 3600).toFixed(1);
  warnings.push(
    `⚠ ${path}.bumpWhenRemainingLedgersBelow is ${configuredActionLedgers.toLocaleString()} ledgers ` +
      `(~${hours}h of warning), below the ${MIN_SAFE_ACTION_WINDOW_LEDGERS.toLocaleString()} ` +
      'needed for the engine to act reliably.\n' +
      '  This is a SCHEDULER limit, not a Soroban one. GitHub Actions was measured on ' +
      '2026-09-14 delivering ~7.5% of a declared 15-minute cron, worst gap 331 minutes.\n' +
      '  A window this short can close between runs: the entry archives while every run ' +
      'reports healthy, with no error anywhere.\n' +
      '  Raise the threshold, or run the engine on a scheduler whose worst gap you have measured.',
  );
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

  const defaults = parseThresholdFields(root.defaults, 'defaults');
  const thresholds: BumpThresholds = {
    ...defaults,
    bumpWhenRemainingLedgersBelow: requireLedgerCount(
      defaults.bumpWhenRemainingLedgersBelow,
      'defaults.bumpWhenRemainingLedgersBelow',
    ),
    extendToLedgers: requireLedgerCount(defaults.extendToLedgers, 'defaults.extendToLedgers'),
  };
  validateThresholdPair(thresholds, undefined, 'defaults', warnings);
  warnIfBelowSchedulerFloor(thresholds.bumpWhenRemainingLedgersBelow, 'defaults', warnings);

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
    let temporaryEntryPolicies: { entryKey: string; autoExtend: boolean }[] | undefined;
    if (contract.temporaryEntryPolicies !== undefined) {
      const path = `contracts[${index}].temporaryEntryPolicies`;
      try {
        if (!Array.isArray(contract.temporaryEntryPolicies)) throw new Error('Expected array');
        const seen = new Set<string>();
        temporaryEntryPolicies = contract.temporaryEntryPolicies.map((value) => {
          const policy = requireRecord(value, path);
          const entryKey = temporaryKey(requireString(policy.entryKey, path), id);
          if (
            typeof policy.autoExtend !== 'boolean' ||
            seen.has(entryKey) ||
            !dataKeys?.some((k) => typeof k === 'string' && k.trim() === entryKey)
          )
            throw new Error('Invalid or duplicate policy');
          seen.add(entryKey);
          return { entryKey, autoExtend: policy.autoExtend };
        });
      } catch {
        throw new ConfigError(
          `${path} requires unique declared temporary keys owned by this contract and explicit boolean autoExtend.`,
        );
      }
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
    const overrides =
      contract.thresholds === undefined
        ? undefined
        : parseThresholdFields(contract.thresholds, `contracts[${index}].thresholds`);
    validateThresholdPair(thresholds, overrides, `contracts[${index}].thresholds`, warnings);
    return {
      id,
      ...(label === undefined ? {} : { label }),
      payer,
      ...(dataKeys === undefined ? {} : { dataKeys }),
      ...(temporaryEntryPolicies === undefined ? {} : { temporaryEntryPolicies }),
      ...(noDataKeys === undefined ? {} : { noDataKeys }),
      ...(overrides === undefined ? {} : { thresholds: overrides }),
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

  let notifications: EvergreenConfig['notifications'];
  if (root.notifications !== undefined) {
    const value = requireRecord(root.notifications, 'notifications');
    for (const key of Object.keys(value)) {
      if (!['channel', 'toEnvVar'].includes(key) && !key.startsWith('_'))
        throw new ConfigError(`Unknown notifications field: ${key}`);
    }
    if (value.channel !== undefined && value.channel !== 'email')
      throw new ConfigError('notifications.channel must be email.');
    const toEnvVar = requireString(value.toEnvVar, 'notifications.toEnvVar');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(toEnvVar))
      throw new ConfigError('notifications.toEnvVar must be an environment-variable name.');
    notifications = { channel: 'email', toEnvVar };
  }

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
