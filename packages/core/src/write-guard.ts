import type { ContractId, LedgerKey, ScanResult } from '@evergreen-stellar/shared-types';

/**
 * The deny-list for the WRITE path (`W2-D11-01` review, 2026-09-12).
 *
 * The config loader warns when a contract sits in both `contracts` and
 * `_doNotWatch`. **A warning is adequate for a scan and inadequate for a
 * write.** The extend path did not read config at all, so neither warning nor
 * enforcement reached it — demonstrated by planning a real extend against
 * guinea-pig B, which produced a prepared envelope and never mentioned that B
 * is a decay-proof subject.
 *
 * What is at stake is not a contract but a DATE. Guinea-pigs B and C are
 * calibrated to cross their thresholds unattended on 2026-09-20 and
 * 2026-09-25. A single extend moves that crossing past the sprint, silently,
 * and it cannot be re-armed inside it — the ageing is the evidence.
 *
 * So this refuses rather than warns, and it refuses by DEFAULT: a caller must
 * pass an explicit acknowledgement to proceed, and the acknowledgement names
 * the date it is spending.
 */

/** Protected subjects. Deliberately in code, not config — config can be edited. */
export const PROTECTED_ENTRIES: ReadonlyArray<{
  readonly contractId: ContractId;
  readonly label: string;
  readonly crossesOn: string;
  readonly why: string;
}> = [
  {
    contractId: 'CCYGO7KQ6FCAZBZAUWAPCAX4RBDIPZK4BJR2KGKISEIGARTJPB7KLTTQ',
    label: 'guinea-pig B',
    crossesOn: '2026-09-20',
    why: 'Natural-decay proof. Extending it moves the crossing past the sprint and the ageing cannot be recreated.',
  },
  {
    contractId: 'CCLW55OIEDHKS5DHDGEA3B2F2ZVOTRXZIOPO36SCMHNQV3VQEGRR33FL',
    label: 'guinea-pig C',
    crossesOn: '2026-09-25',
    why: 'Backup natural-decay proof, the only second shot if B is missed.',
  },
];

/**
 * The shared `ContractCode` entry, protected BY ITS LEDGER KEY.
 *
 * A, B and C are built from one Wasm, so extending "A's code" extends B's and
 * C's too — the one operation that reaches the protected subjects without
 * naming them.
 *
 * **Consumer lists cannot catch this, and the first version of this guard
 * failed exactly there.** A scan of A alone reports the code entry with one
 * consumer, because the chain does not index reverse dependencies from a
 * single contract query — the same `undetermined` limit the JSON channel
 * already admits to. So `extend A --include-code` looked harmless: one
 * contract, no protected subject in the list, guard silent. Verified against
 * the real CLI on 2026-09-12, where it produced a prepared envelope.
 *
 * Keying on the entry itself removes the dependence on what a scan can see.
 * Derived from Wasm hash `c7e55f0a…98bfb`.
 */
export const SHARED_CODE_ENTRY_KEY = 'AAAAB8flXwrYnvsGALwVBIsVUJn6TZfO4WRm+hJEs9y86Yv7';
export const SHARED_CODE_UNTIL = '2026-09-26';

export class ProtectedEntryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProtectedEntryError';
  }
}

export interface WriteGuardOptions {
  /**
   * Explicit acknowledgement that a protected subject is being spent. Absent or
   * false refuses. Named rather than boolean-true so it cannot be set by
   * accident: the caller states WHICH contract they mean.
   */
  readonly acknowledgeProtected?: readonly ContractId[];
  /** Today, injected so the guard is testable without a clock. */
  readonly now?: Date;
}

/**
 * Refuse a write that would touch a protected subject.
 *
 * Called before any envelope is prepared, so a refused write never produces a
 * transaction hash that someone could submit by hand afterwards.
 */
export function assertWriteAllowed(args: {
  readonly contractId: ContractId;
  readonly entryKeys: readonly LedgerKey[];
  readonly scan: Pick<ScanResult, 'entries'>;
  readonly options?: WriteGuardOptions;
}): void {
  const acknowledged = new Set(args.options?.acknowledgeProtected ?? []);

  // Every contract this write touches, including ones reached through a shared
  // entry rather than named on the command line. That indirection is the whole
  // hazard: `extend A --include-code` never mentions B or C.
  const touched = new Set<ContractId>([args.contractId]);
  for (const entryKey of args.entryKeys) {
    for (const consumer of args.scan.entries[entryKey]?.contracts ?? []) {
      touched.add(consumer);
    }
  }

  // Checked FIRST and by key, because this is the case a consumer list cannot
  // see. `--include-code` on any of the three reaches all three.
  if (args.entryKeys.includes(SHARED_CODE_ENTRY_KEY) && !acknowledged.has(SHARED_CODE_ENTRY_KEY)) {
    throw new ProtectedEntryError(
      'Refusing to write: this would extend the SHARED ContractCode entry.\n' +
        '  Guinea-pigs A, B and C are built from one Wasm and share this single entry,\n' +
        '  so extending it extends all three — including both natural-decay proofs,\n' +
        '  which cross on 2026-09-20 and 2026-09-25 and cannot be re-armed.\n' +
        '  A scan of one contract CANNOT show you this: it reports one consumer,\n' +
        '  because the chain does not index reverse dependencies from one query.\n\n' +
        `  It is scheduled for extension at W3-D18-02d, after ${SHARED_CODE_UNTIL}.\n` +
        `  To override: --acknowledge-protected ${SHARED_CODE_ENTRY_KEY}`,
    );
  }

  for (const subject of PROTECTED_ENTRIES) {
    if (!touched.has(subject.contractId)) continue;
    if (acknowledged.has(subject.contractId)) continue;

    const viaShared = args.contractId !== subject.contractId;
    throw new ProtectedEntryError(
      `Refusing to write: this would touch ${subject.label} (${subject.contractId}).\n` +
        (viaShared
          ? `  It is not the contract you named — it is reached through a SHARED ENTRY.\n` +
            `  A, B and C are built from one Wasm, so extending code extends all three.\n`
          : '') +
        `  ${subject.why}\n` +
        `  It is calibrated to cross unattended on ${subject.crossesOn}. Extending it now\n` +
        `  moves that crossing past the sprint, and the ageing cannot be recreated.\n\n` +
        `  If you genuinely intend this, pass the contract explicitly:\n` +
        `    --acknowledge-protected ${subject.contractId}\n` +
        `  The shared code entry is due to be extended at W3-D18-02d, after ${SHARED_CODE_UNTIL}.`,
    );
  }
}
