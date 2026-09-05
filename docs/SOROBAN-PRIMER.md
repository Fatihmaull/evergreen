# Soroban primer — domain knowledge for this repo

Read this before writing any code that touches ledger entries, TTL, or rent. It exists so agents and new contributors stop guessing at Soroban semantics.

**Verification rule:** if something you need isn't in here, check the official Stellar docs and then *add it here with a link*. Do not code against a remembered API.

## The core concept

Soroban contract data lives in **ledger entries**. Each entry has a **TTL measured in ledgers**, not in seconds. An entry's `liveUntilLedgerSeq` is the last ledger at which it is still live; remaining TTL is:

```
remainingLedgers = liveUntilLedgerSeq - currentLedgerSeq
```

Every ledger that closes decrements the remaining TTL by one. Ledgers close roughly every 5–6 seconds, so converting to wall-clock is an *estimate*, not a guarantee. Always compute in ledgers internally and convert to dates only for display.

### The boundary is inclusive — and `remainingLedgers == 0` does NOT mean expired

**Documented, partially observed, not yet pinned.** Sourced from Stellar's [state archival](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival) and [`getLedgerEntries`](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries) docs on 2026-09-05.

An entry stops being live when **`currentLedger > liveUntilLedgerSeq`**. So at `currentLedger == liveUntilLedgerSeq` the entry is **still live** — that is its *final live ledger*, not its first dead one.

The arithmetic is plain subtraction, no `+1`. Stellar's worked example: current 5, live-until 15 → TTL 10.

```
remainingLedgers = liveUntilLedgerSeq − currentLedgerSeq
```

> #### ⚠️ The trap those two facts create
>
> **`remainingLedgers == 0` means the entry is on its last live ledger, not that it has expired.** Expiry begins at `−1`.
>
> ```ts
> if (remainingLedgers <= 0)  // WRONG — reports a live entry as dead
> if (remainingLedgers < 0)   // correct
> ```
>
> The naive guard is wrong by one ledger **in the dangerous direction**, and it is silent: every test you write will agree with whichever convention you picked. It surfaces only as an off-by-one in a projected date, or a bump fired one ledger late.

**What we have actually observed (2026-09-05):** guinea-pigs B and C's temporary entries, `liveUntil` 4,513,652 and 4,513,931, were **absent** from `getLedgerEntries` at ledger 4,515,215. That is consistent with the inclusive boundary and rules out nothing else — both were ~1,300 ledgers past expiry, so it confirms *dead well after* and does **not** pin *alive exactly at*.

**Still to observe: the exact boundary ledger** (`W1-D4-13`). Docs are not the network — that is our own standard, and this is the case it was written for. If observation disagrees with the above, **the observation wins and the disagreement is escalated.**

## Rent

Contracts prepay **rent** in XLM to keep entries alive. Extending TTL means topping up rent. This is what Evergreen automates: watch `remainingLedgers`, and before it runs out, pay to extend.

## What happens at zero

When TTL expires, the entry doesn't sit there inert:

- **Persistent entries** and **contract instance/code entries** are **archived** — moved out of the live state. The contract becomes unusable until someone submits a `RestoreFootprintOp` to bring it back. Restoring is slower and more expensive than a normal read because archived entries are treated as disk-based data.
- **Temporary entries** are **deleted** outright when they expire. They cannot be restored. Data that must survive should never live in temporary storage.

This distinction matters for the storage optimizer (W2-D12) and for how we report severity: an expiring temporary entry is a different (often worse) problem than an expiring persistent one.

## Storage types

| Type | Survives expiry? | Typical use |
|---|---|---|
| Instance | Archived, restorable | Contract's own instance data; shares TTL with the contract instance |
| Code (Wasm) | Archived, restorable | The uploaded contract Wasm |
| Persistent | Archived, restorable | Long-lived user/protocol state |
| Temporary | **Deleted, unrecoverable** | Short-lived data (nonces, sessions) |

Evergreen must scan **all** relevant entry types for a contract, not just the instance — a live contract instance with archived persistent data is still broken.

## TTL extension is permissionless — the single most important fact in this document

**Anyone may extend anyone's TTL.** From Stellar's state-archival documentation:

> "There is no access control for TTL extension operations. Any user may invoke `ExtendFootprintTTLOp` on any `LedgerEntry`."

The only requirement is paying the resource fee. There is no owner check, no `require_auth`, no signature from the contract's deployer.

This is why Evergreen is non-custodial, and it is worth being precise about the reason: **not** because we built a carefully scoped signer, but because there is no authority over your contract to grant in the first place. There is no key to hand over and no permission to revoke. The engine holds nothing but the lumens it uses to pay fees.

Everything downstream follows from this:

- The engine never needs a user's key, so no component should be designed as though it does.
- A wallet signature in Evergreen authorizes a **payment**, never **access**. Any code, type, doc string, or UI label implying otherwise is a bug (ADR-004).
- The dashboard can scan *any* contract for *anyone*, because scanning is a permissionless read.
- One public engine protecting every registered contract becomes possible — recorded as an open SOW 2 direction in ADR-004, deliberately not built in v1.
- The capped policy signer (ADR-002) still matters, but for a different reason than we first wrote down: in v1 the hot key lives on *the user's* server with *the user's* lumens, so capping it protects *them*.

Source: [Smart contract state archival — Stellar Docs](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival). Also relevant: [Extending Wasm TTL](https://developers.stellar.org/docs/build/guides/conventions/extending-wasm-ttl).

### ✅ Observed on testnet, 2026-09-05 (`W1-D4-06`)

**Not "the docs say" — we ran it.** Two independently generated testnet accounts, no authorization of any kind between them:

- **Account A** (deployer): `GBRGOJUAPPDR7YWM4GOGV3YLSCPWDW4KJZVL4R2LRG7HFIYCY5ODMWLZ` — deployed the contract.
- **Account B** (extender): `GDGAWY723FYFB5TNSHLQFYGRXMPITSP4KDEHTK4IRLKVGSX6QSKZMASE` — generated separately, never granted anything by A, never mentioned in the contract.
- Contract: `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` (guinea-pig A, deployed by A)

**B extended all four entry types on A's contract, and every one increased:**

| Entry type | `liveUntilLedgerSeq` before | after | delta | tx hash (source = B) |
|---|---|---|---|---|
| Instance | 4,633,568 | 4,712,648 | +79,080 | `484e5c33fe47d65ce8afef1d62c7963cb3c5367c446b3d5f14097688715af41e` |
| Code (Wasm) | 4,633,567 | 4,712,652 | +79,085 | `54d59191c1e9adccc35c846f169d774419b714dfa4758af834f93215086e1c0b` |
| Persistent | 4,633,569 | 4,712,658 | +79,089 | `b0bf79efa1421cfe9d6cfef763b572a05909fa7a38553c1b89c101a30a9375ae` |
| Temporary | 4,513,329 | 4,712,659 | +199,330 | `e796eb55c16839c25a9e20b5899ea5df4bab68aceb99d1a82ca88d098792a2b3` |

Verified properly, not by trusting a success code:

- **Before and after were read from `getLedgerEntries`**, not inferred from the transaction succeeding.
- **The built transaction's footprint carries no auth entries at all** — checked with `--build-only` and decoding the envelope. There is no authorization step to satisfy, which is the whole point.
- **Horizon confirms `source_account` is B**, not A, on every extend. Fees were paid by B: 14,032 and 11,104 stroops.
- **No entry type behaved differently.** All four extend identically for an unauthorized third party.

**Conclusion: confirmed. Evergreen needs no authority over a user's contract, because none exists to grant.** The README states this publicly and the statement is now backed by observation.

> Docs are not the network — if future observation ever contradicts this, that discovery outranks everything else in the plan and gets escalated immediately, not worked around.

## The operations we care about

- **`ExtendFootprintTTLOp`** ("extendTTL") — extends the live-until ledger of entries in the read-only set of the transaction footprint. This is the write operation the auto-bump engine performs, and the *only* one the policy signer may authorize.
- **`RestoreFootprintOp`** — brings archived entries back to live state. Evergreen v1 does not automate restores; it exists to *avoid* needing them. (Candidate for SOW 2.)

## RPC

The Soroban RPC method we lean on is **`getLedgerEntries`**. For each requested key it returns an entry result containing:

- `key`, `xdr` — the entry itself
- `lastModifiedLedgerSeq`
- `liveUntilLedgerSeq` — **optional**; absent for entry types that don't carry a TTL. Code must handle its absence rather than assuming it's present.

Combine with the current ledger sequence (from RPC network/latest-ledger info) to compute remaining TTL.

## Measured TTL floors

Record the *actual* minimum TTL a freshly deployed entry receives on testnet, per entry type. Two things depend on these numbers and neither can be guessed:

1. **The bump threshold** has to be chosen against a real floor, not an assumed one.
2. **Whether the natural-decay proof is achievable in-sprint.** If a fresh persistent entry's floor is longer than the days remaining, a contract cannot decay to the threshold before Sep 30 and the "would have been archived, was saved" demonstration has to be designed around the floor instead of assumed into existence.

**Correction during `W1-D4-13`, 2026-09-05:** the first table below records **remaining TTL when sampled**, not the initial network minimum. The [unedited A fixture](../packages/core/test/fixtures/getLedgerEntries-guinea-pig-a.json) was sampled 31 ledgers after its temporary entry was written. The [raw Testnet configuration](evidence/2026-09-05-rakha-setup/state-archival-settings.json) at ledger 4,519,665 reports `min_temporary_ttl = 720`, `min_persistent_ttl = 120960`, and `max_entry_ttl = 3110400`. These values are network configuration, not constants to hardcode in the engine.

The new isolated temporary entry was created at ledger 4,519,384 with `liveUntilLedgerSeq = 4,520,103`: **719 remaining ledgers at the creation ledger**, consistent with an inclusive 720-ledger lifetime. Exact adjacent-ledger expiry observation is still in progress. [Full experiment record](evidence/2026-09-05-rakha-setup/README.md).

Original snapshot, retained as measured on 2026-09-05 (protocol 28, testnet). Wall-clock figures assume ~5s per ledger and are estimates — ledgers are the unit of truth.

| Entry type | Remaining TTL when sampled (ledgers) | ≈ wall clock | Measured on | Notes |
|---|---|---|---|---|
| Instance | 120,927 | ~7 days | 2026-09-05 | |
| Code (Wasm) | 120,926 | ~7 days | 2026-09-05 | |
| Persistent | 120,928 | ~7 days | 2026-09-05 | |
| **Temporary** | **688** | **~57 minutes remaining** | 2026-09-05 | Sampled after creation; configured minimum is 720 |

**The temporary figure has design consequences.** A fresh temporary entry lives about an hour under the measured configuration, and it is **deleted** rather than archived — unrecoverable. Two things follow:

1. **A 5–15 minute engine cadence (ADR-001) is adequate but not generous for temporary entries.** With ~688 ledgers of headroom, the reaction-time argument in ADR-001 ("TTL headroom is measured in days") holds for persistent/instance/code and does **not** hold for temporary. Thresholds for temporary entries must be expressed in ledgers with that in mind, and the CLI should probably warn when a temporary entry's remaining TTL is within a couple of cron intervals.
2. **It makes temporary entries a fast, cheap test loop** — an entry that expires in an hour is a far quicker way to exercise expiry handling than waiting a week.

> **Fixture placeholder — fill in during W1-D4-05.** Paste a real, unedited `getLedgerEntries` response for our guinea-pig contract here, and mirror it into `packages/core/test/fixtures`. Every unit test should run against real observed shapes, not invented ones.

Recorded 2026-09-05 from the guinea-pig A contract, unedited, and mirrored into
[`packages/core/test/fixtures/getLedgerEntries-guinea-pig-a.json`](../packages/core/test/fixtures/getLedgerEntries-guinea-pig-a.json).

Note the actual entry shape — `key`, `xdr`, `lastModifiedLedgerSeq`, `liveUntilLedgerSeq`, and an `extXdr` field the plan didn't anticipate:

```jsonc
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "entries": [
      {
        "key": "AAAABgAAAAEblswW+PDBZ8QGOhf7+j8AvTtHrEL+O4eNCZiCZ4RiuwAAABQAAAAB",
        "xdr": "AAAABgAAAAAAAAABG5bMFvjwwWfEBjoX+/o/AL07R6xC/juHjQmYgmeEYrsAAAAU...",
        "lastModifiedLedgerSeq": 4512610,
        "liveUntilLedgerSeq": 4633568,
        "extXdr": "..."
      }
      // ... one entry per requested key
    ],
    "latestLedger": 4512641
  }
}
```

Two things in this response that the plan did not anticipate:

- **`latestLedger` arrives in the same response**, and it is what `remainingLedgers` is computed against. One round trip, not two — the RPC client should exploit this rather than fetching the latest ledger separately out of habit. Across a batch scan that is the difference between a scan that feels instant and one that does not.
- **`extXdr`** is present on each entry and was not in any of our planning docs. We do not currently use it. Whoever needs it later should know it was not designed for — read the current Stellar docs before relying on its shape.

## Non-custodial authorization

Soroban **smart wallets** (contract accounts) enforce authorization in `__check_auth` rather than with a single secret key. Signers can be WebAuthn passkeys (secp256r1), Ed25519 keys, or **policy signers** — and policies can scope *what* a signer is allowed to do: spending limits, allowlists, thresholds.

**Read this section in light of the permissionless finding above.** Evergreen does not need smart-wallet authorization to do its job — `extendTTL` requires none. Smart wallets matter to us for a narrower purpose: capping what the engine's own hot key can do.

Evergreen's model: an **Ed25519 signer** (headless — no browser, no passkey ceremony, because our bot runs on a scheduler), optionally scoped by a policy to `extendTTL` only. Sequenced in two stages:

- **Stage 1 (v1 default, what the README teaches):** a plain funded Ed25519 account holding only enough XLM to pay extend fees. Short quickstart, nothing to configure.
- **Stage 2 (hardened path):** the same signer scoped by a policy so a leaked key cannot drain the account it sits on. In v1 that account is the user's, so this protects the user.

See [`ADR-002`](adr/ADR-002-policy-signer-provider.md) for the provider decision and its 2026-09-04 amendment, and [`POLICY-SIGNER.md`](POLICY-SIGNER.md) for setup.

## Contracts deployed from identical Wasm share ONE code entry

> **This is the most consequential thing we found in Week 1, and it is a product requirement, not a fixture detail.** Read the whole section before writing anything that scans, prices, or prioritises entries.

### It is the factory pattern, not an edge case

Deploying N contracts from one Wasm is what protocols do at scale: per-user vaults, per-pair pools, per-market instances. Every one of those deployments shares a single `ContractCode` entry.

So the failure mode is: **one entry expires and every instance breaks at the same moment.** And a naive per-contract scan reports each of those instances as healthy right up until they all die together, because each instance's own entries genuinely are fine.

That is the worst possible shape for a monitoring tool — confidently green immediately before a total outage. We found it because two guinea-pigs happened to share a Wasm. A user finds it in production.

**Observed 2026-09-05.** Guinea-pigs B and C were deployed separately, from the same compiled Wasm. They have different contract ids and their own instance and data entries — but they share a **single** `ContractCode` ledger entry, keyed by the Wasm hash.

Consequences, all of which caught us:

- **Extending the code entry for one contract extends it for every contract sharing that Wasm.** We tried to give B and C staggered TTLs and found the code entry could not be staggered at all.
- **A contract is only as alive as its code entry.** If the shared Wasm entry is archived, every contract deployed from it is unusable, regardless of how healthy its own instance and data entries look.
- **A scan must report the code entry, and should say when it is shared.** Reporting per-contract TTL without it gives a false picture — a user could see four healthy contracts whose common code entry expires tomorrow.
- Our fix for the guinea-pigs was to extend the shared code entry well past the whole sprint (to ledger 5,290,829, ~2026-10-19) so it drives neither crossing, leaving each contract's crossing governed by its own instance and persistent entries.

### What this requires of Evergreen

Four concrete requirements, each tracked in `BACKLOG.md`:

1. **Deduplicate by ledger key, not by contract.** Scanning N contracts that share code surfaces the same entry N times. The engine must dedupe *before* deciding, or a single run tries to bump one entry N times. This is **within-run** idempotency and is a different concern from the across-run, overlapping-scheduler case — do not assume one task covers both.
2. **The rent model must not double-count.** Summing per-contract costs across a factory deployment charges the shared code entry N times, so the CLI's headline cost estimate is silently wrong for exactly the users who care most about cost. Needs a test with two contracts sharing a Wasm — B and C are that fixture.
3. **Severity must account for blast radius.** A shared code entry at 3 days is not one contract at 3 days; it is N contracts at 3 days. Whatever severity model the CLI and dashboard use has to reflect that a shared entry's expiry takes everything with it. This changes what "critical" means.
4. **Reporting must make sharing visible.** A per-contract view that does not say *"this code entry is shared with 12 other contracts"* is misleading by omission. That belongs in CLI output and the dashboard, not only in the optimizer's advice.

### How common is it? — measure, don't assume

The reasoning above is from how contracts are usually structured, not from observation. `W2-D12-02` surveys deployed third-party testnet contracts to find out how often code entries are actually shared in the wild.

- **Common** → this is a headline capability. *"Your 40 vault contracts share one code entry that expires Thursday"* is a non-obvious operational trap that makes tooling worth installing, and it belongs in the demo video rather than a footnote.
- **Rare** → it stays a correctness requirement and a footnote.

Either answer is useful, and it costs an afternoon already budgeted.

## Gotchas to design around

- **Ledgers ≠ seconds.** Never store a TTL as a date. Convert at the edge, for display only.
- **`liveUntilLedgerSeq` can be missing.** Handle undefined explicitly; don't `!`-assert it.
- **Testnet resets.** Stellar testnet is periodically reset — contracts and accounts vanish. Don't hardcode contract IDs in source; read them from config (`docs/SETUP.md` holds the current guinea-pig ID). If everything suddenly 404s, suspect a reset before suspecting your code.
- **Fee estimation drift.** A modeled rent cost must be validated against a real transaction's actual fee at least once (W2-D9-02), or the "cost estimate" is fiction.
- **Archived ≠ deleted.** Report them differently. Telling a user their persistent data is "gone" when it's restorable is a serious UX bug.
- **The code entry is shared across every contract built from the same Wasm** (see above). Do not model TTL as strictly per-contract.
- **Temporary entries really do vanish, fast.** B and C were observed absent well after their advertised expiry. The original 688-ledger figure was remaining TTL when sampled, not the network's 720-ledger minimum; the exact adjacent-ledger check is tracked in `W1-D4-13`.

## References

- [Smart contract state archival — Stellar Docs](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
- [Test TTL extension logic in smart contracts — Stellar Docs](https://developers.stellar.org/docs/build/guides/archival/test-ttl-extension)
- [Extend a deployed contract's storage entry TTL — Stellar Docs](https://soroban.stellar.org/docs/guides/cli/extend-contract-storage)
- [Smart wallets — Stellar Docs](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets)
- [Authorization — Stellar Docs](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization)
