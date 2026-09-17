# D20 decision/guide preparation review — Sep17

Baseline mainbd7f245. Documentation-only changes: a proposed Shared disposition,
a truthful POLICY-SIGNER guide and two README corrections that previously implied
a hardened path was already available/demonstrated. No ADR history was rewritten.

Full pnpm check passed: 770 Vitest +114 Node =884 tests. Final documentation link,
schedule and diff checks also passed. An offline runner check with recorded
instance/network fixtures and a policy payer produced UNSUPPORTED_SIGNER, no execution
records, no secret reads and no transaction RPC. This verifies the guide's current
behavior claim without deploying or using a provider. Local result is retained at
.evergreen/d20-guide/refusal-check.json.

D20-01 remains In progress pending Shared approval; D19 remains Blocked and D20-02
conditional. D20-03 is In progress for the draft guide, not a claim of completed
hardened-path demonstration. Public scope/funder treatment is a human decision.
The two README claims are corrected as present capability statements; that does
not predetermine the outcome of the pending scope decision.

No new implementation or live proof is justified until the decision chooses a
specific path. Published in PR #191 for review; Shared decision remains pending in #183.
