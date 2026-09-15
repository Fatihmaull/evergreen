# W3-D19 — policy signer feasibility result, 2026-09-15

**Result: no-go for directly adapting passkey-kit's smart-account auth signer to
Evergreen's existing fee-paying ExtendFootprintTTL signer.** This is a bounded
protocol/provider assessment, not a failed deployed-wallet test or a declaration
that every possible restricted-signing design is impossible. Shared D20-01 outcome
is still for Rakha/Fatih to accept. No dependency installation, deployment, new
transaction or email occurred during the investigation. Publication is authorized
for this report and blocker #161; no final Shared decision is claimed.

## Versions actually checked

- Read-only Testnet RPC: protocol **28**; RPC **28.0.1**, captive core commit
  **947aad8413c189d85504acf72207e85eeda9b021**.
- passkey-kit commit **dac58e6e78ae6e4177d60c73cee763378c142b3c**, package version
  **0.18.3**, SDK peer **^16.3.0**. Evergreen uses SDK **17.0.1**. Installing the
  latest provider into the production workspace would also introduce a version
  compatibility question; no provider runtime execution is claimed here.
- Sources were downloaded read-only and hashed. Metadata and offline results are
  under [evidence](evidence/2026-09-15-policy-feasibility/README.md).

## The missing enforcement link

The current path is:

`engine → prepared ExtendFootprintTTL envelope → G-address payer signature → core account signature/threshold validation → TTL operation`

The proposed provider path is:

`contract invocation → Soroban authorization entry → wallet __check_auth → signer/policy checks`

These paths do not automatically connect:

1. The real successful temporary-extension envelope from the preceding task contains
   one ExtendFootprintTTL operation, with only `ext` and `extendTo` operation fields.
   It is not an InvokeHostFunction and carries no Soroban authorization entry slot.
2. The installed SDK rejects a C-address as this operation's source. Calling a wallet
   method named "extendTTL" is not a replacement for the native operation.
3. The pinned provider's `sign` function delegates to `txn.signAuthEntries` for the
   wallet address. Its wallet verifies authorization contexts in `__check_auth`.
   That does not replace the fee payer's envelope signature.
4. The captive-core-matching operation source selects the classic account's signature
   threshold and then applies TTL extension without invoking a wallet policy hook.
5. If an unrestricted payer secret remains accessible to the engine, an attacker
   can bypass Evergreen's TypeScript validator. The offline reproduction signs and
   verifies both a TTL envelope and a payment with the same fresh ephemeral key.
   This last test demonstrates key capability, not a submitted payment or acceptance
   against an arbitrary account's configured thresholds.

A provider contract that restricts its own token balance could work for its own
invocation model, but that is not evidence that it protects the separate fee-paying
account whose key remains on the engine host. This is the balance ADR-002 promised
to protect. No wallet is deployed merely to demonstrate unrelated auth functionality.

## Source anchors (immutable)

- [Provider auth-entry signing](https://github.com/stellar/passkey-kit/blob/dac58e6e78ae6e4177d60c73cee763378c142b3c/src/kit/tx-ops.ts#L319): `sign` delegates to `signAuthEntries`.
- [Wallet auth hook](https://github.com/stellar/passkey-kit/blob/dac58e6e78ae6e4177d60c73cee763378c142b3c/contracts/smart-wallet/src/lib.rs#L473): context/policy verification.
- [Core operation signature check](https://github.com/stellar/stellar-core/blob/947aad8413c189d85504acf72207e85eeda9b021/src/transactions/OperationFrame.cpp#L217): source account threshold/signatures.
- [Core extension apply](https://github.com/stellar/stellar-core/blob/947aad8413c189d85504acf72207e85eeda9b021/src/transactions/ExtendFootprintTTLOpFrame.cpp#L296).
- [Core extension threshold](https://github.com/stellar/stellar-core/blob/947aad8413c189d85504acf72207e85eeda9b021/src/transactions/ExtendFootprintTTLOpFrame.cpp#L392): LOW at the captive-core commit. This resolves the source-version question;
  it does not constitute a live test of a lower-weight delegated account.

The generic operation documentation says Medium. Do not base a redesign on that
moving documentation label, or silently substitute the source's LOW into the ADR.

## Reproduction and limits

`node experiments/policy-signer/feasibility.mjs` uses installed SDK17 and the retained
prior transaction copy under `docs/evidence/2026-09-15-policy-feasibility/`.
It verifies the actual envelope shape, signs/verifies two disposable offline
transactions, and asserts rejection of a contract-address operation source. The
initial script needed SDK17's signature property rather than the SDK16 accessor;
the corrected script ran successfully. No network access or secret is used by it.

This is not a deployed passkey-kit rejection proof. D19-01's smart-account deployment,
D19-02's policy-scoped fund rejection, and D19-03's scoped headless extension are
**not complete**. D19-01/02/03 are Blocked under [#161](https://github.com/Fatihmaull/evergreen/issues/161), and D20-01 is In progress for Shared review;
no misleading Done checkbox or promised capability is added to POLICY-SIGNER.md.

## Recommended next decision

Do not continue D19 deployment or automatically pivot to OpenZeppelin for this same
integration design. Present this evidence at D20-01 and amend ADR-002 only after
Shared agreement. Keep Stage1 operating with its existing capped hot account.

Candidate follow-up designs, **not implemented or approved**:

- A truly separate signing boundary retaining the payer secret outside the engine
  could enforce a transaction allowlist, but adds a new trust/deployment boundary.
  It is not the smart-account solution already approved by ADR-002.
- Classic account threshold separation may reject payments while allowing TTL, but
  other low-threshold operations and fee-drain avenues must be evaluated. It does
  not establish the strict `{extendTTL}` capability set without more evidence.

Default: honest partial-scope documentation rather than an unbounded replacement
architecture during the Sep18 readiness window. D20-03 should document the actual
limit and available Stage1 path; it must not advertise a proven hardened path.
SOW treatment remains a human/Shared decision. Public blocker issue, ADR update,
Notion mirror and any proposal to the funder belong to the approved publication
checkpoint, not this local research step.
