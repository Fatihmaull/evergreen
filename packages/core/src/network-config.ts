import { xdr, rpc } from '@stellar/stellar-sdk';

/**
 * State-archival settings, read from the chain (`W2-D9-01`).
 *
 * The primer is explicit that these are **network configuration, not constants
 * to hardcode**. `max_entry_ttl` in particular is the protocol ceiling on any
 * single extend, and a hardcoded copy would be one more policy with two homes.
 */

/** ConfigSetting key for STATE_ARCHIVAL. Recorded 2026-09-05, unchanged since. */
export const STATE_ARCHIVAL_CONFIG_KEY = 'AAAACAAAAAo=';

export interface StateArchivalSettings {
  /** Inclusive lifetime setting; an extend operation target must be <= this minus one. */
  readonly maxEntryTtl: number;
  readonly minTemporaryTtl: number;
  readonly minPersistentTtl: number;
  /**
   * Rent rate denominators. Observed 2026-09-10 as persistent 1215 and
   * temporary 2430 — **exactly 2:1**, which is the protocol stating outright
   * what the fee fixture measured as a 1.952x durability ratio. The residual
   * is the flat components, not noise in the measurement.
   */
  readonly persistentRentRateDenominator: string;
  readonly temporaryRentRateDenominator: string;
  readonly observedAtLedger: number;
}

/**
 * Read a field that the SDK exposes as a METHOD in its ESM build and as a
 * PLAIN PROPERTY in its CJS build.
 *
 * Found the hard way on 2026-09-10: the same decode worked under `node -e`
 * (CJS) and threw under Vitest (ESM). A parser that only works in one module
 * system is a parser that passes its tests and fails in the binary, or the
 * reverse — so this accepts both rather than betting on which build is loaded.
 */
function field(source: unknown, name: string): unknown {
  if (source === null || typeof source !== 'object') return undefined;
  const value = (source as Record<string, unknown>)[name];
  return typeof value === 'function' ? (value as () => unknown).call(source) : value;
}

function firstNumber(source: unknown, ...names: string[]): number | undefined {
  for (const name of names) {
    const value = field(source, name);
    if (typeof value === 'number') return value;
    if (typeof value === 'bigint') return Number(value);
  }
  return undefined;
}

/** Decode the settings from a raw ConfigSetting entry payload. Pure; testable offline. */
export function parseStateArchivalSettings(
  entryXdr: string,
  observedAtLedger: number,
): StateArchivalSettings {
  const data: unknown = xdr.LedgerEntryData.fromXDR(entryXdr, 'base64');
  const configSetting = field(data, 'configSetting');
  const settings = field(configSetting, 'stateArchivalSettings');
  const maxEntryTtl = firstNumber(settings, 'max_entry_ttl', 'maxEntryTtl');
  if (maxEntryTtl === undefined) {
    throw new Error('Entry is not a STATE_ARCHIVAL config setting');
  }
  const persistentDenominator =
    field(settings, 'persistent_rent_rate_denominator') ??
    field(settings, 'persistentRentRateDenominator');
  const temporaryDenominator =
    field(settings, 'temp_rent_rate_denominator') ?? field(settings, 'tempRentRateDenominator');
  return {
    maxEntryTtl,
    minTemporaryTtl: firstNumber(settings, 'min_temporary_ttl', 'minTemporaryTtl') ?? 0,
    minPersistentTtl: firstNumber(settings, 'min_persistent_ttl', 'minPersistentTtl') ?? 0,
    persistentRentRateDenominator: String(persistentDenominator),
    temporaryRentRateDenominator: String(temporaryDenominator),
    observedAtLedger,
  };
}

export async function readStateArchivalSettings(
  server: rpc.Server,
): Promise<StateArchivalSettings> {
  const response = await server.getLedgerEntries(
    xdr.LedgerKey.fromXDR(STATE_ARCHIVAL_CONFIG_KEY, 'base64'),
  );
  const entry = response.entries[0];
  if (!entry) throw new Error('Network returned no state-archival config entry');
  return parseStateArchivalSettings(entry.val.toXDR('base64'), response.latestLedger);
}

export interface ResolvedTarget {
  /** The absolute target to pass as `extendTo`. Never a delta. */
  readonly extendToLedgers: number;
  /** True when the request was reduced to the protocol ceiling. */
  readonly wasCapped: boolean;
  /** What the caller asked for, before capping. */
  readonly requestedLedgers: number;
}

/**
 * Turn a user's "give me N more ledgers" into the absolute target the protocol
 * wants — and cap it at the ceiling.
 *
 * **The CLI absorbs this conversion so the user never meets it.** `--ledgers N`
 * is how a person thinks about headroom; `extendTo` is an SDK quirk, and
 * pushing it into the user's vocabulary is the opposite of what a CLI is for.
 *
 * **Capping is reported, never silent.** `current + N` can exceed
 * `max_entry_ttl`, and quietly handing back a smaller extension than requested
 * while reporting success is the same silent-shortfall shape as passing a delta
 * where a target belongs. Worse here, because **simulation does not clamp**:
 * asked for 4,000,000 against a 3,110,400 ceiling it quoted 345,853 stroops,
 * about 52% more than the capped extension actually costs (observed
 * 2026-09-10). An uncapped request would be quoted for something that cannot
 * happen.
 */
export function resolveExtendTarget(args: {
  readonly currentRemainingLedgers: number;
  readonly additionalLedgers: number;
  readonly maxEntryTtl: number;
}): ResolvedTarget {
  const { currentRemainingLedgers, additionalLedgers, maxEntryTtl } = args;
  if (!Number.isInteger(additionalLedgers) || additionalLedgers <= 0) {
    throw new Error('--ledgers must be a positive integer of ledgers');
  }
  if (!Number.isInteger(maxEntryTtl) || maxEntryTtl <= 0) {
    throw new Error('maxEntryTtl must come from the network and be a positive integer');
  }
  // An already-expired entry has negative remaining; treat its base as 0 rather
  // than subtracting from the request.
  const base = Math.max(0, currentRemainingLedgers);
  const requested = base + additionalLedgers;
  // The setting includes the current live ledger. Core rejects an operation
  // target greater than maxEntryTTL - 1 (ExtendFootprintTTLOpFrame::doCheckValidForSoroban).
  const capped = Math.min(requested, maxEntryTtl - 1);
  return {
    extendToLedgers: capped,
    wasCapped: capped < requested,
    requestedLedgers: requested,
  };
}
