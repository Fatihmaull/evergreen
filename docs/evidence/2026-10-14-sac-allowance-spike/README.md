# Spike — can a SEP-41 allowance fund a hosted autopilot without custody?

**Testnet, 2026-10-14. Research only — no product code was written and
`packages/` is untouched.** Every claim below is backed by a transaction hash or
a quoted source. Where something could not be established it says
`undetermined`.

| | |
|---|---|
| Native XLM SAC | `CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC` |
| "user" (holder) | `GA75PD2EE356C7GKMUEZQBSKRPTMKELPSVBJGOOHQWXXQEHBE6JUIVVU` |
| "engine" (spender) | `GCEZBCVVA3OPNEL3FDXNVGFVLYZF75Y7T2IJZZKM743IUQDDP5ABM26L` |

Both are throwaway friendbot identities created for this spike. Their secrets
live only in the local `stellar` keystore.

---

## Verdict

**Viable, with four limits — and one property that is better than the premise
assumed.**

The limits:

1. **Re-signing every ~180 days.** `live_until_ledger` is capped at
   `current + 3,110,399`, the same `max_entry_ttl - 1` ceiling as `extendTTL`.
2. **The allowance lives in temporary storage**, so at expiry it is *deleted*,
   not archived, and cannot be restored by anyone.
3. **One allowance per (holder, spender) pair.** A second `approve` overwrites
   the first; it does not add to it.
4. **The user must be the transaction source for a single-signature flow.** A
   sponsored-submission shape, where the user authorizes but does not submit,
   was not tested — `undetermined`.

The better-than-assumed property is in §6: **the engine cannot extend its own
spending authority**, even though `extendTTL` is permissionless and the
allowance is an ordinary ledger entry. That was tested directly rather than
reasoned about, and it is the single most important result here.

**On the custody question, plainly: this is not custody.** Evergreen never holds
the user's balance, cannot increase its own allowance, cannot outlive the
allowance's stated expiry, and is refused by the contract in every direction
that was tested. What it *can* lose is bounded and stated exactly in §6.

---

## 1 · Native XLM, classic G-account holder — **works**

The premise's biggest unknown. Both halves succeeded.

**`approve`** from a funded classic G-account on the native SAC —
[`53aade33…4a04`](https://stellar.expert/explorer/testnet/tx/53aade338c1f338e0864018e5345fd24adc212d8a521655e4c63187ae9ab4a04).
`approve(from=user, spender=engine, amount=500000000, live_until_ledger=5291504)`.
Allowance read back immediately afterwards: `"500000000"`.

**`transfer_from` by a different G-account** moved real native XLM —
[`d7b6ed91…8240`](https://stellar.expert/explorer/testnet/tx/d7b6ed917c1f39753e3fdb85576b84a483b7556db2b0e8253ec0ae0914978240).
`transfer_from(spender=engine, from=user, to=engine, amount=100000000)`.

Balances read from Horizon:

| account | before | after | Δ |
|---|---|---|---|
| user | 10000.0000000 | 9989.9902549 | −10.0097451 (10 XLM moved + its own `approve` fee) |
| engine | 10000.0000000 | 10009.9982069 | +9.9982069 (10 XLM received − its own `transfer_from` fee) |

Allowance after: `"400000000"` — decremented by exactly the amount transferred.

**So the mechanism works for native XLM held by a classic G-account.** The docs
did not state this; it is now established by transaction.

---

## 2 · Maximum horizon — `current + 3,110,399`, in temporary storage

**Probed by simulation rather than assumed.** At ledger 5,191,523:

| `live_until_ledger` | offset | result |
|---|---|---|
| 8,301,923 | +3,110,400 | **rejected** — `Error(Contract, #9)` |
| 8,301,922 | +3,110,399 | **accepted** |
| 11,191,523 | +6,000,000 | rejected |
| 4,294,967,295 | u32 max | rejected |

**The ceiling is `max_entry_ttl - 1` — the same bound `extendTTL` is subject to**
(`packages/core/src/network-config.ts:135`), and `max_entry_ttl` read live from
the network's `ConfigSetting` is 3,110,400.

**Storage type: `temporary`.** Taken from the `approve` transaction's own
footprint, not from documentation:

```
read_only : durability=persistent  key=ledger_key_contract_instance
read_write: durability=temporary   key={"vec":[{"symbol":"Allowance"},
            {"map":[{"key":{"symbol":"from"},...},
                    {"key":{"symbol":"spender"},...}]}]}
```

Full key in `raw/allowance-ledger-key.json`.

**In practice: a user re-signs at most every ~180 days** (3,110,399 ledgers at
the measured ~5.11 s/ledger ≈ 184 days). That is the same cadence as the TTL
extension the autopilot exists to perform, which is a convenient alignment
rather than an extra burden.

**Can the allowance entry's TTL be extended?** Yes — and it does not do what one
might hope or fear. See §6.

---

## 3 · Cap enforcement — refused in all four directions tested

Per the brief, this was tested on what it must **refuse**, not only what it must
allow. Every case was refused with `Error(Contract, #9)`.

| case | setup | result |
|---|---|---|
| **over remaining allowance** | remaining 400000000, requested 450000000 | **refused** — `"not enough allowance to spend", 400000000, 450000000` |
| **after expiry** | `live_until_ledger` 5,191,547 passed | **refused**; `allowance()` read `"0"` |
| **after revocation** | `approve(amount=0, live_until_ledger=0)` | **refused**; `allowance()` read `"0"` |
| **after the spender extends the entry's TTL** | see §6 | **refused** |

Raw stderr for each in `raw/refusal-*.txt`.

Revocation transaction:
[`328f8d7b…8c1a`](https://stellar.expert/explorer/testnet/tx/328f8d7b108e267d0c6abbca527828124278290ded7e46353423d75cfd7b8c1a).

**Revocation is immediate and one transaction.** It costs the user 8,735
stroops.

---

## 4 · Cost — measured, not estimated

`fee_charged` from Horizon:

| operation | who pays | stroops | XLM |
|---|---|---|---|
| `approve` | **user** | **97,451** | 0.0097451 |
| `transfer_from` | **engine** | **17,931** | 0.0017931 |
| `approve(0)` — revoke | user | 8,735 | 0.0008735 |
| `extendTTL` on the allowance entry | either | 5,622 | 0.0005622 |

**Per-action cost to us is ~0.0018 XLM**, roughly 18,000 stroops, on top of
whatever rent the extension itself costs. For scale, the single real extension
measured in the sibling task cost 289,112,648 stroops — so `transfer_from`
overhead is **~0.006% of a code-entry extension** and ~1% of a small instance
extension (1,588,629 stroops).

The user pays ~0.0097 XLM once per allowance period, not per action.

---

## 5 · Wallet UX — one signature at the protocol level; the extension UI is `undetermined`

**What was measured.** The `approve` transaction carries:

```
envelope signatures : 1
auth entries        : 1
credential type     : source_account
```

`source_account` credentials are satisfied by the transaction's own source
signature. **No separate `signAuthEntry` is required when the user's account is
the transaction source** — it is one signature over one transaction.

**What could not be established.** Freighter's documentation
(`docs.freighter.app/extension-freighter-api/signing.md`, read 2026-10-14) lists
`signTransaction()`, `signAuthEntry()` and `signMessage()`, and describes
`signTransaction()` as *"Pass a transaction XDR string to Freighter for the user
to review and sign."* It does **not** state whether a Soroban invocation surfaces
as one prompt or two.

> **`undetermined`:** whether Freighter renders this as a single prompt, and what
> it shows the user about `amount` and `live_until_ledger`. A browser extension
> cannot be exercised from here. The protocol shape above says one signature is
> sufficient; whether the wallet presents it that way, and legibly, needs a test
> page.

> **`undetermined`:** the sponsored shape, where Evergreen submits and pays the
> transaction fee while the user only authorizes. That requires `address`
> credentials and a separate `signAuthEntry`, and was not tested.

---

## 6 · What a stolen engine key gets — the honest custody statement

This is the section meant to be publishable, so it is stated exactly.

**Tested directly, because the obvious attack had to be ruled out.** `extendTTL`
is permissionless and the allowance is an ordinary temporary ledger entry, so the
question is whether a spender can prolong its own authorization without the user.

The engine extended the allowance entry's TTL from 5,191,583 to **5,291,576** —
[`41fd6270…b2f8`](https://stellar.expert/explorer/testnet/tx/41fd62708ca1f4ac1fdde0e172ee6749b7e0c757111bcf2b4c38a4b080e7b2f8)
— with **no user signature**. Then, past the user's `live_until_ledger`:

```
entry still live on ledger? YES, liveUntilLedgerSeq = 5291576
allowance() reads          : "0"
transfer_from              : REFUSED, Error(Contract, #9)
```

**The stored `live_until_ledger` governs, not the ledger entry's TTL.** Keeping
the entry alive does not resurrect the authorization. **A spender cannot extend
its own spending authority.**

### An attacker holding the engine's key gets, exactly:

1. **Our float** — the entire balance of the engine's own funded account. This is
   an ordinary Ed25519 key and nothing constrains it.
2. **Plus, per user, at most the remaining allowance** on that user's live
   `approve`, until its `live_until_ledger`.

### And nothing else. Specifically, they **cannot**:

- increase any allowance (`approve` requires the *holder's* authorization);
- extend any allowance's expiry — **tested above**;
- revive an expired allowance — the entry is temporary, so expiry deletes it and
  **[protocol]** temporary entries cannot be restored;
- reach any balance beyond the approved amount — **tested**;
- act after a user revokes — **tested**, and revocation is one transaction.

### The two honest caveats

- **The exposure is per-user and simultaneous.** "At most the remaining
  allowance" is per user, and a compromise drains every live allowance at once.
  The bound is the *sum* of all outstanding allowances, not any single one.
- **This says nothing about the engine's float.** That is a hot key with our own
  money on it, and that risk is unchanged from the Stage 1 design documented at
  `docs/POLICY-SIGNER.md`.

---

## On the premise

**ADR-002's no-go does not apply to this mechanism, and the distinction is worth
being precise about.** That finding was that *contract-auth policy cannot
constrain the classic transaction signature that pays for `extendTTL`* — the
policy signer sat on the wrong side of the authorization boundary.

The allowance does not try to constrain the extension transaction at all. It
constrains **a separate token transfer that happens first**, and the extension is
then paid for out of funds Evergreen already holds. The two authorization paths
that ADR-002 found to be disjoint stay disjoint; this design simply stops
requiring them to be the same one.

**That is why it works, and it is also the reason the user's cap is on the money
rather than on the operation.** An attacker with our key cannot extend a stranger's
TTL *on the user's authority* — they can only spend the allowance, and then they
have to pay for anything else themselves.

---

## Files

| file | what |
|---|---|
| `raw/tx-approve-50xlm.json` | the first `approve`, full Horizon record |
| `raw/tx-transfer-from-10xlm.json` | native XLM actually moved by a third party |
| `raw/tx-approve-short-ttl.json` | the short-lived allowance used for the expiry test |
| `raw/tx-revoke-approve-zero.json` | revocation |
| `raw/tx-approve-for-selfext-test.json` | the allowance used for the §6 test |
| `raw/tx-engine-extends-allowance-ttl.json` | spender extending the entry's TTL unilaterally |
| `raw/refusal-over-allowance.txt` | `"not enough allowance to spend", 400000000, 450000000` |
| `raw/refusal-after-expiry.txt` | `Error(Contract, #9)` |
| `raw/refusal-after-revoke.txt` | `Error(Contract, #9)` |
| `raw/refusal-after-self-extension.txt` | `Error(Contract, #9)` — the §6 result |
| `raw/allowance-ledger-key.json` | the temporary ledger key, from the footprint |

No pricing or architecture recommendation is made here, by instruction.
