# W2-D11-02/03 — controlled A-instance live-proof plan

**Bounded request approved by Rakha, 2026-09-11; execution Blocked on readiness.** Owner: Rakha. D11-02 is Blocked under [#98](https://github.com/Fatihmaull/evergreen/issues/98); D11-03 remains Pending. Approval covers only the fixed scope below and does not waive the readiness checks. Based on PR #86 at `ccf7374`; Fatih's formal code review is still pending. Fatih handles PR merges. Follow the already agreed internal-review → publish PR/issue → Fatih review flow.

## Objective and fixed scope

Run one manual extension using the reviewed CLI and Rakha's own Testnet payer, then prove that A's **instance** expiry ledger increased. Capture the actual transaction and before/after evidence immediately. No deployment, funding, restore, contract invocation, automatic retry or additional feature is included.

| Request item | Approved value |
|---|---|
| Network | Stellar Testnet; verify live passphrase before reads/simulation/send |
| Contract | `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` (A) |
| Selected key | `AAAABgAAAAEblswW+PDBZ8QGOhf7+j8AvTtHrEL+O4eNCZiCZ4RiuwAAABQAAAAB` — instance only |
| Public payer | `GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB` — Rakha dev, from SETUP |
| Requested increment | **1,000 ledgers** |
| Maximum total envelope fee | **25,000 stroops = 0.0025 XLM**, no automatic increase |
| Secret reference at authorized execution only | `EVERGREEN_DEV_SECRET`, the name already in `.env.example` |
| Number of transactions | At most one for this proof |

Do not supply `--keys-file` or `--include-code`. No B/C key or shared Wasm may appear in the transaction footprint. B/C may be read as controls. A's persistent/temporary data are outside this request. A valid scan exit never authorizes a send.

## Observed preflight, not a reusable transaction

[Raw preflight and decoded verification](evidence/2026-09-11-live-proof-preflight/verification.json) were captured at **2026-09-11 09:49:14 UTC**, using the compiled CLI from the reviewed D11 branch, with no submit/secret flags.

| Observation | Value |
|---|---:|
| Read ledger | 4,619,313 |
| A instance last-live ledger | 6,025,589 |
| Remaining at read | 1,406,276 |
| Resolved target for +1,000 | **1,407,276** |
| Prepared fee | **15,073 stroops = 0.0015073 XLM** |
| Approved fee ceiling for execution | 25,000 stroops |
| Account sequence read / prepared sequence | 19,410,430,384,406,532 / 19,410,430,384,406,533 |

The decoded envelope contains one extension operation, one read-only instance key, zero writable keys and zero signatures. It was not submitted. The observed account balance is included in verification.json as public Testnet data; it does not prove current spendable balance or key availability.

**The 60-second envelope is already historical. Never sign or submit the saved XDR.** Immediately before authorized execution, rebuild from fresh account/ledger/config reads and re-simulate. Keep the fixed increment and fee cap; compute the new target per the existing helper, capped at `maxEntryTtl - 1`. If target is already satisfied, stop with a no-op; if the needed operation is capped or differs materially from the reviewed request, review the change instead of silently claiming the requested increase.

## Readiness before any live run

- [ ] Fatih has reviewed the current #86 implementation. Reconcile any requested changes first and run checks on the exact tree that will execute; do not treat earlier CI as validation of later code.
- [x] Rakha approved continuation of this bounded live request on 2026-09-11. Any changed key, payer, increment, added operation or increased fee cap needs renewed review.
- [ ] The intended secret can be supplied privately via the existing environment setup; the actual signer must derive the expected public payer. Secret availability has **not** been inspected in this planning turn. Never print a seed or pass one as a CLI argument; the command does not auto-load `.env`.
- [ ] Evidence capture is ready **before** sending: raw RPC request/response saving, CLI stdout/stderr, actual before/after scan screenshots and an actual transaction-explorer screenshot. Verify image files can be saved into the evidence directory. Do not substitute rendered text for real screenshots.

Screenshot preflight: the Chrome DevTools connector could not find its Chrome executable. The in-app browser successfully loaded A's real StellarExpert page and produced an actual screenshot in the session. This establishes a browser fallback, not a saved transaction receipt. Real terminal before/after screenshot capture and saving image artifacts to the repository still need verification at execution time; coordinate those captures with Rakha/Fatih if the harness cannot operate a native terminal. Do not send while this evidence path is unready.

## Execution recipe after approval

1. Create a fresh execution/evidence branch from the reviewed D11 code or its merged main version; preserve this plan. Mark D11-02/03 In progress in repo/Notion, record the exact source SHA, and make branch ownership visible. The plan branch is currently `docs/W2-D11-02-live-proof-plan`, stacked on #86.
2. Run `pnpm check` and build the actual CLI bundle with `pnpm --filter @evergreen-stellar/cli bundle`. If the base changed, rerun the relevant signing/confirmation tests and review the diff before proceeding.
3. Create `docs/evidence/<actual-date>-manual-extend-proof/`. Set up a capture path that saves full unedited RPC responses, not just parsed summaries. Planning's read/simulate-only recorder intentionally refuses sends; live capture must explicitly permit only the one approved send plus reads/confirmation, never an unrestricted transport.
4. Capture A's scan before state and the actual terminal screenshot; record B/C instance/persistent and shared-code expiry as read-only controls. Save network configuration and account observation. No exact deletion/archival claim is inferred from a missing response.
5. Simulate the fresh bundled command below. Independently decode the resulting envelope and verify payer, one operation, selected instance key, empty writable footprint, resolved target, fee ≤25,000, no signature and bounded validity. Confirm that the target would increase the observed expiry. Preserve the preview before any send.

```bash
node packages/cli/dist/evergreen.mjs extend CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L --ledgers 1000 --source-account GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB --max-fee-stroops 25000 --json
```

6. **Only after the readiness checks and explicit live approval**, execute once with the same bounded intent. This invocation rebuilds/re-simulates rather than using the expired preflight XDR:

```bash
node packages/cli/dist/evergreen.mjs extend CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L --ledgers 1000 --source-account GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB --max-fee-stroops 25000 --secret-env EVERGREEN_DEV_SECRET --submit --json
```

7. Record the locally computed hash before the send, preserve send response and poll that exact hash. Confirm the returned envelope hashes to the requested transaction; SDK `txHash` alone is a request echo. Do not send a replacement on timeout, NOT_FOUND, transport errors or ambiguous results. Keep the attempt submitted/unconfirmed and investigate the same hash.
8. After confirmed inclusion, rerun scan and capture the after screenshot. Require the same key, a post-read ledger at/after inclusion, `after.endsAtLedger > before.endsAtLedger` and `after.endsAtLedger >= inclusionLedger + resolvedTarget`. Remaining TTL may decrease between reads, so absolute expiry is the primary comparison. Note possible concurrent extenders rather than claiming exclusive causation.
9. Re-read the B/C/shared-code controls and compare expiry ledgers. Immediately save the real explorer transaction screenshot with hash/status/operation visible. Link **hash + full unedited RPC + screenshot** in EVIDENCE on the transaction date. Do not mark complete while an artifact or post-state proof is missing.

## Stop conditions and completion

Stop before signing for wrong network/payer, unreadable/expired instance, changed scope, unexpected operations, invalid/stale envelope, fee above cap, missing key setup or unavailable evidence capture. Do not fund an account or restore state as a workaround. On uncertain send, preserve the hash and stop; a failed or unverified attempt is evidence to report, not a successful extension.

D11-02 completes with the approved transaction confirmed and its required artifacts captured. D11-03 completes with the verified before/after TTL and screenshots. If a blocker arises, record it in repo/Notion and a dedicated issue with the exact dependency; do not silently omit evidence. Then review the result internally, publish PR + issue after Rakha approval, and request Fatih review. Fatih handles merge.

## Readiness follow-up, 2026-09-11

Rakha approved the bounded continuation. Live GitHub check still reports #86 OPEN at `ccf73746c18c448a5f95fb0a93402409e2121991` with no formal reviews. Dedicated [#98](https://github.com/Fatihmaull/evergreen/issues/98) mentions and assigns Fatih for review coordination and records the screenshot readiness gap. D11-02 is Blocked; D11-03 remains Pending. No secret read, signing or transaction.

## Earlier planning turn

Read-only network/account/config observations, one unsigned A-instance simulation, independent envelope inspection, and a real explorer screenshot capability check. No secret was read, no signature created, no transaction sent. D11-02 stays In progress for planning; D11-03 stays Pending. No new runtime code, PR or publication issue.
