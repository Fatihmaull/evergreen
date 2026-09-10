# `@evergreen/core`

TTL math, rent model, RPC client, storage optimizer, and decision rules.

**The only package that talks to the network.** `core` never imports from `cli`, `engine`, or `dashboard` — the dependency arrow points one way (see [ARCHITECTURE](../../docs/ARCHITECTURE.md)).

Rules that are easy to get wrong:

- **Ledgers are the unit of truth.** Compute in ledgers; convert to dates only at the display edge. Never store a TTL as a date.
- **`liveUntilLedgerSeq` is optional.** Some entry types carry no TTL. Handle its absence explicitly; never `!`-assert it.
- **One round trip, not two.** `getLedgerEntries` returns `latestLedger` alongside the entries, which is what `remainingLedgers` is computed against. Don't call for the latest ledger separately.
- **The ledger key is the unit, not the contract.** Contracts sharing a Wasm share one `ContractCode` entry. Dedupe by ledger key before deciding, sum rent per unique key (or you charge a factory deployment N times for one entry), and weight severity by blast radius — a shared code entry expiring takes every contract with it.
- **Temporary entries expire two orders of magnitude faster than everything else** — ~688 ledgers (~57 min) against ~120,927 (~7 days), measured 2026-09-05. Any code that reasons about "days of headroom" is wrong for temporary entries.

Decision rules are a pure function — `(ScanResult, thresholds) => BumpDecision` — with no I/O, so the engine can be tested without a network.

## Current scan API (`W2-D8-03/04`)

`scanContract(reader, { id, label? }, dataKeys?, { noDataKeys? })` returns a `ScanResult` for one contract. It reads the instance, derives a Wasm code key from its executable, then reads code and explicit persistent/temporary data keys in batches of at most 200. The supplied keys must be canonical base64 XDR `ContractData` keys belonging to that contract. A non-Wasm executable produces `unsupported-executable`; it never produces an invented code key.

`LedgerEntryReader` carries the serialized entry payload as `entryXdr` in addition to optional TTL. The production adapter preserves SDK `val` as XDR. Payload/key mismatches, duplicates, unrequested rows, invalid TTL and malformed responses are diagnosed. A failing batch does not erase successful batches, and each observation keeps its response's `latestLedger`.

Coverage is always `known-keys`, including the unique validated supplied data-key count. Neither a missing entry nor unavailable TTL proves expiry. This API does not enumerate all storage. Legacy `scanInstances` is still exported, but the CLI uses `scanContract`.

The [CLI guide](../cli/README.md) describes the input file and exit policy. The [read-only Testnet capture](../../docs/evidence/2026-09-08-scan-entry-types/README.md) complements offline fixtures; no transaction path is added.

An explicit `{ noDataKeys: true }` with an empty key list records a caller assertion, not verified enumeration. Supplying any key at the same time is rejected before RPC reads. Omission leaves coverage unknown when no data keys were supplied. CLI health/exit policy is documented in ADR-006; core returns observations, not spending instructions.

### Multiple contracts and shared entries

`scanContracts(reader, requests)` accepts an array of `ContractScanRequest` from core:

```ts
const scan = await scanContracts(reader, [
  { contract: { id: firstId }, dataKeys: firstDataKeys },
  { contract: { id: secondId }, dataKeys: secondDataKeys },
]);
```

Each request has `contract: ContractRef`, optional `dataKeys: readonly LedgerKey[]`, and optional `noDataKeys: boolean`. `scanContract` delegates to this same path with one request; CLI syntax is unchanged. No shared-domain schema or SDK adapter change is needed.

Instances are deduplicated and read first; their valid Wasm hashes populate one map of code/data keys for the second phase. Every canonical key is requested once, in batches of at most 200. A shared code entry lists every unique **known input** consumer, never all consumers on the network. Repeated contract IDs union validated data keys and keep the first supplied label. An empty-data assertion contradicting any nonempty input for that ID is an error; that contract is excluded from reads while independent contracts continue. Malformed scope arrays/flags also exclude that contract.

A shared-key error names all known affected consumers; a failed batch names the union of that batch's consumers. Missing/invalid instances do not invent shared-code associations, but their valid explicit data can still be read. Each successful observation retains its response ledger; this is not an atomic snapshot across batches. Duplicate RPC observations are discarded, not reconciled by taking the newest-looking value. Coverage counts/assertions remain per contract, and unknown coverage is never promoted by another contract's declaration.

The legacy `scanInstances` now removes duplicate input consumers; it remains instance-only with unspecified coverage. Multi-contract CLI UX, rent and engine decisions are separate tasks.

[Read-only shared-Wasm evidence](../../docs/evidence/2026-09-09-scan-dedup/README.md) verifies B, C, B becomes two unique contracts and three entries, using two instance keys and one code-key read.

## TTL projection and cadence (`W2-D8-01`)

`projectEnd(entry, now, cadence?)` answers three questions the CLI, dashboard and engine all ask, and keeps them apart because they genuinely are apart:

| Field | Meaning |
|---|---|
| `endsAtLedger` | The final **live** ledger, inclusive. The truth — store this. |
| `endBehavior` | `archived` or `deleted`. Which fate, not when. |
| `isRestorableAfterEnd` | Machine-readable so no display path re-derives it and calls a deletion an archival. |
| `estimatedEndsAt` | Wall clock, display edge only. **Never store it.** |
| `earliestEndsAt` / `latestEndsAt` | The band implied by cadence uncertainty. |

There is deliberately no `projectedArchiveDate`. That name is wrong twice: *archive* is false for temporary entries, which are deleted, and *date* invites storing a wall-clock value where the truth is a ledger number.

**Cadence carries its own uncertainty.** `LedgerCadence` bundles the rate with its provenance and a `±` band, because "about five seconds" is doing real work: across `max_entry_ttl` (3,110,400 ledgers = 180 days), the recorded ±0.0008 s/ledger band is over an hour wide. A projection that reports a bare instant at that horizon is precise-looking and wrong.

`measureCadence(samples)` derives a cadence from observed closes and is **pure** — callers fetch the samples, this does the arithmetic, so a measurement is testable without a network. It never reports zero uncertainty: close times are whole seconds, so a window of N ledgers cannot resolve cadence more finely than `1/N` s/ledger, and a single interval cannot bound drift at all. Drifting closes widen the band; that is the intended signal, not noise.

## The liveness assertion (`W2-D10-04`)

`assertLiveness({ scan, thresholds, records, decisions? })` answers one question: **did this run establish that everything it watches is healthy?** If not, `isAlarm` is true and the engine must exit non-zero.

**When it fires is strict. What it says is graded.**

The rule: *an entry that needs action and was not verifiably extended by this run means the run is not healthy, whatever the reason.* A held claim, a lock lookup that threw, a dry-run, an unconfirmed submission, a policy skip — all legitimate reasons not to bump, none of them a reason to report health. The asymmetry is deliberate: a false alarm costs an email, a missed alarm costs the Sep 20 proof.

Only `outcome: 'succeeded'` buys silence. `submitted` is *"never treated as successful yet"* by its own type comment, `simulated` never touched the chain.

| Situation | Fires | Severity | Says |
|---|---|---|---|
| `succeeded` | no | — | — |
| dry-run | **yes** | `info` | *Would have acted; dry-run mode.* |
| submitted, unconfirmed | **yes** | `warn` | *Submitted, could not confirm within this run.* |
| attempted, failed | **yes** | `critical` | *Attempted and failed: `<reason>`.* |
| skipped, claim held | **yes** | `critical` | *Skipped: another run holds the claim.* |
| TTL unreadable | **yes** | `critical` | *Absence of an observation is not evidence of health.* |

**Severity grades the message; it never gates the firing.** Dry-run is `info` because it is not an emergency — but suppressing it would train you to skim the channel, and then the alarm that matters on Sep 20 goes unread too. A test pins that specifically: making `info` suppress the alarm fails.

The unconfirmed case is worded as **uncertainty, not failure**. A run that cannot confirm its own work genuinely does not know whether it landed, which is different information from either outcome. Silence there would claim success it has not earned.

### `remediation` — because the required action changes at expiry

An entry at `remaining = -5` is past `extendTTL` and needs `RestoreFootprintOp`. It still alarms, but `remediation` reads `restore` rather than `extend` and the detail says so. Pointing someone at the wrong operation while they are acting under pressure is its own failure.

### The threshold is a floor, not a line to sit on

`needsAction` fires at `remaining <= threshold`. Read the threshold as **"act once remaining reaches this number."** Touching the margin is already the failure the margin exists to prevent.

**This does not match the inclusive TTL boundary, and that is correct.** `isLive` is inclusive at zero; `needsAction` is inclusive at the threshold; the same `==` case falls on opposite sides. They answer different questions and are governed by different authorities — see the comparison block in `ttl.ts`. One is a protocol fact owned by the chain; the other is a policy choice owned by us. Agreement between them was never the property to preserve.

### Why it exists

A run that does nothing looks exactly like a run that succeeded. `claim()` returning null is the *ordinary* skip path, so ~96 clean exit-0 runs could pass across guinea-pig B's 24-hour window while B archives unattended. `liveness.test.ts` simulates that window run-by-run and pins **48 quiet runs, then 48 consecutive alarms** — and **zero** alarms across the same window when the engine acts. The second half matters as much as the first: an alarm that cries wolf gets muted, and is then worth nothing.

The rule is pure and has no engine dependency, which is why it lands before the run loop. Wiring it in is `W3-D15-01`.
