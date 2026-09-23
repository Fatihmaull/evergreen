# Signer status and self-hosting limits

**Stage2 policy signer is not available.** The engine's implemented execution path
uses a plain funded Ed25519 account (Stage1). A policy signer is represented in the
config/type seam for future adapters, but the current engine rejects that payer
kind; it is not an activation switch for an implemented provider.

The final Stage2 disposition is **no-go for the direct adapter, no automatic
framework pivot, and honest partial delivery with full scoping deferred to SOW 2**.
Fatih accepted that decision in [#183](https://github.com/Fatihmaull/evergreen/issues/183),
and ADR-002 records it through merged PR #230. The
[feasibility report](W3-POLICY-SIGNER-FEASIBILITY.md) remains technical evidence;
it is not proof of a deployed policy wallet.

## Why the planned direct adapter does not provide the promised protection

Evergreen signs a native ExtendFootprintTTL transaction whose fee payer is a Stellar
G-address. Passkey-kit policies authorize contract invocation entries through a
wallet's __check_auth. Those are different authorization paths. Installing that
wallet does not constrain the separate transaction key that pays the native TTL fee.

The verified result is bounded to this direct integration. No alternative signing
architecture is implemented or approved merely because the original path is no-go.
OpenZeppelin is not an automatic remedy for the same protocol-layer mismatch.

## What Stage1 provides

The self-hoster supplies their own funded Testnet payer account. The engine applies
explicit-submit gating, selected-key/target checks, network validation, configured
fee caps, protected-subject guards, signed-envelope validation and post-state checks.
Those controls constrain the normal execution path and help reject incorrect work.

They **do not** make a leaked payer secret incapable of signing another transaction.
The Signer interface is not a security boundary. A compromised host with the raw
secret can bypass the wrapper and spend the payer account's remaining balance.
Keep the account separate from other assets and fund only the intended operating
budget. A per-run fee cap is not an account-wide cryptographic spending limit.

Evergreen remains non-custodial with respect to monitored contracts because TTL
extension is permissionless. It neither needs nor gains authority over their storage
contents. This does not eliminate the self-hoster's hot-key risk.

## Using the implemented path

Start with [SETUP](SETUP.md), [the engine overview](../packages/engine/README.md),
[the example config](../evergreen.config.example.json) and the executable commands'
`--help`. Configure an Ed25519 payer, declared monitored scope, public payer identity,
secret environment reference and fee cap. Start with dry-run. Store secrets only in
private environment/platform stores; never in a committed config or evidence bundle.

Do not switch signer to policy or provide a wallet address expecting the current
engine to use it. That configuration is unsupported for execution and must fail
rather than fall back silently to a different payer. Do not use the guinea-pig
save-proof harness as a general self-hosting recipe; it intentionally selects A only.
The broader independent setup test and production guide remain D21-01e/D26-02.

## What a future hardened path must demonstrate

- The engine cannot access an unrestricted secret for the balance being protected.
- A valid native TTL extension works headlessly and pays from the intended payer.
- The same compromised/delegated credential cannot move protected funds through
  direct SDK calls that bypass Evergreen's wrapper.
- Payer, footprint, target, fee, replay, admin and recovery controls are explicit.
- The self-hoster pays their own fees; third-party subsidy is not the security model.
- Rejection and uncertain execution remain visible through the existing alert path.

No current artifact establishes all these properties. The Stage1 proof, the temporary
retention policy and its successful extension do not count as a policy-signer proof.

## Accepted scope disposition

ADR-002's history is preserved and amended with the accepted no-go reasoning.
Evergreen retains Stage1 and describes Stage2 as partial/unavailable rather than
inventing a setup recipe. Full policy scoping is deferred to SOW 2. The remaining
conversation with the Ambassador Chapter Lead about the SOW impact is a human action;
this guide neither performs it nor upgrades the missing capped-signer capability to
Present. It truthfully supplies the required configuration/status artifact.
