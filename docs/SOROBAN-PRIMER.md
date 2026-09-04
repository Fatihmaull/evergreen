# Soroban primer — domain knowledge for this repo

Read this before writing any code that touches ledger entries, TTL, or rent. It exists so agents and new contributors stop guessing at Soroban semantics.

**Verification rule:** if something you need isn't in here, check the official Stellar docs and then *add it here with a link*. Do not code against a remembered API.

## The core concept

Soroban contract data lives in **ledger entries**. Each entry has a **TTL measured in ledgers**, not in seconds. An entry's `liveUntilLedgerSeq` is the last ledger at which it is still live; remaining TTL is:

```
remainingLedgers = liveUntilLedgerSeq - currentLedgerSeq
```

Every ledger that closes decrements the remaining TTL by one. Ledgers close roughly every 5–6 seconds, so converting to wall-clock is an *estimate*, not a guarantee. Always compute in ledgers internally and convert to dates only for display.

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

> **Verified against docs 2026-09-04. Empirical confirmation due W1-D4 (Rakha extends the TTL of a contract deployed by Fatih's account).** Docs are not the network — if observed behavior contradicts this, that discovery outranks everything else in the plan and gets escalated immediately, not worked around.

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

**Placeholder — fill in during W1-D4-04.** Record the *actual* minimum TTL a freshly deployed entry receives on testnet, per entry type. Two things depend on these numbers and neither can be guessed:

1. **The bump threshold** has to be chosen against a real floor, not an assumed one.
2. **Whether the natural-decay proof is achievable in-sprint.** If a fresh persistent entry's floor is longer than the days remaining, a contract cannot decay to the threshold before Sep 30 and the "would have been archived, was saved" demonstration has to be designed around the floor instead of assumed into existence.

| Entry type | Observed floor (ledgers) | ≈ wall clock | Measured on | Notes |
|---|---|---|---|---|
| Instance | *(W1-D4-04)* | | | |
| Code (Wasm) | *(W1-D4-04)* | | | |
| Persistent | *(W1-D4-04)* | | | |
| Temporary | *(W1-D4-04)* | | | |

> **Fixture placeholder — fill in during W1-D4-05.** Paste a real, unedited `getLedgerEntries` response for our guinea-pig contract here, and mirror it into `packages/core/test/fixtures`. Every unit test should run against real observed shapes, not invented ones.

```jsonc
// TODO(W1-D4-05): paste real testnet response
```

## Non-custodial authorization

Soroban **smart wallets** (contract accounts) enforce authorization in `__check_auth` rather than with a single secret key. Signers can be WebAuthn passkeys (secp256r1), Ed25519 keys, or **policy signers** — and policies can scope *what* a signer is allowed to do: spending limits, allowlists, thresholds.

**Read this section in light of the permissionless finding above.** Evergreen does not need smart-wallet authorization to do its job — `extendTTL` requires none. Smart wallets matter to us for a narrower purpose: capping what the engine's own hot key can do.

Evergreen's model: an **Ed25519 signer** (headless — no browser, no passkey ceremony, because our bot runs on a scheduler), optionally scoped by a policy to `extendTTL` only. Sequenced in two stages:

- **Stage 1 (v1 default, what the README teaches):** a plain funded Ed25519 account holding only enough XLM to pay extend fees. Short quickstart, nothing to configure.
- **Stage 2 (hardened path):** the same signer scoped by a policy so a leaked key cannot drain the account it sits on. In v1 that account is the user's, so this protects the user.

See [`ADR-002`](adr/ADR-002-policy-signer-provider.md) for the provider decision and its 2026-09-04 amendment, and [`POLICY-SIGNER.md`](POLICY-SIGNER.md) for setup.

## Gotchas to design around

- **Ledgers ≠ seconds.** Never store a TTL as a date. Convert at the edge, for display only.
- **`liveUntilLedgerSeq` can be missing.** Handle undefined explicitly; don't `!`-assert it.
- **Testnet resets.** Stellar testnet is periodically reset — contracts and accounts vanish. Don't hardcode contract IDs in source; read them from config (`docs/SETUP.md` holds the current guinea-pig ID). If everything suddenly 404s, suspect a reset before suspecting your code.
- **Fee estimation drift.** A modeled rent cost must be validated against a real transaction's actual fee at least once (W2-D9-02), or the "cost estimate" is fiction.
- **Archived ≠ deleted.** Report them differently. Telling a user their persistent data is "gone" when it's restorable is a serious UX bug.

## References

- [Smart contract state archival — Stellar Docs](https://developers.stellar.org/docs/learn/fundamentals/contract-development/storage/state-archival)
- [Test TTL extension logic in smart contracts — Stellar Docs](https://developers.stellar.org/docs/build/guides/archival/test-ttl-extension)
- [Extend a deployed contract's storage entry TTL — Stellar Docs](https://soroban.stellar.org/docs/guides/cli/extend-contract-storage)
- [Smart wallets — Stellar Docs](https://developers.stellar.org/docs/build/guides/contract-accounts/smart-wallets)
- [Authorization — Stellar Docs](https://developers.stellar.org/docs/learn/fundamentals/contract-development/authorization)
