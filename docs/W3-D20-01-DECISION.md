# W3-D20-01 — accepted Stage2 disposition

**Accepted by Fatih on 2026-09-22 in [#183](https://github.com/Fatihmaull/evergreen/issues/183); ADR-002 amended through merged [#230](https://github.com/Fatihmaull/evergreen/pull/230).**
Source: merged feasibility #162 and the decision packet published in
[PR #191](https://github.com/Fatihmaull/evergreen/pull/191). Investigation need not
be repeated; this document preserves the disposition that was accepted.

## Accepted decision

1. **No-go for the direct passkey-kit adapter described by the original ADR-002.**
   Contract-invocation authorization does not constrain the native TTL payer's
   transaction signature; retaining that unrestricted key on the engine defeats
   the intended stolen-key protection.
2. **No automatic OpenZeppelin pivot.** Another contract-auth framework does not
   itself add an enforcement hook to the native TTL payer path. A genuinely different
   approach needs a bounded proposal and a defined threat model before new work.
3. **Keep the verified Stage1 self-hosted engine.** It remains non-custodial toward
   the monitored contract but uses a hot payer key and is not cryptographically
   restricted against moving that payer's own balance.
4. **Document Stage2 as not delivered in this sprint unless Shared explicitly
   approves a feasible alternative.** Do not call a software allowlist a hardened
   signing boundary. Funder acceptance of any SOW scope adjustment is a separate
   human action, not implied by this technical recommendation.

## Task effects

| ID | Disposition |
| --- | --- |
| D19-01/02/03 | Record unfulfilled original provider setup/security/e2e requirements and the agreed no-go disposition; do not mark deployment or proof Done |
| D20-01 | Done only after explicit Shared decision is recorded in ADR-002's update log |
| D20-02 | Not applicable/dropped with the decision reason if there is no Stage2 implementation; never mark its rejection-alert test passed without one |
| D20-03 | Deliver the truthful guide/status, limitations and available Stage1 route. Documentation completion does not satisfy an undelivered hardened-path demonstration |

The accepted no-go moves D19-01/02/03 out of Blocked as explicitly dropped,
completes D20-01, drops the conditional D20-02 and lets D20-03 publish the truthful
guide. No provider deployment or hardened-path demonstration is inferred.

## If Shared instead requests an alternative

The proposal must name: where the payer secret lives; what a stolen engine credential
can do without our wrapper; how native TTL transactions are authorized; how fees
are capped and paid by the self-hoster; evidence of allowed extension and rejected
fund movement; estimate and deadline that preserve Sep18 and B/C observations.

A separate policy-enforcing signing service adds a new trust/deployment boundary.
Classic account thresholds may reject payments but permit other operations or fee
expenditure. Neither is already the accepted smart-account design or a free fallback.
Do not implement either on speculation.

## Remaining human action

Fatih handles the required conversation with the funder/lead about the SOW impact.
That conversation is not evidence of technical capability and is not performed by
this repository update. The repo records the accepted decision and publishes the
guide without contradictory promises.
