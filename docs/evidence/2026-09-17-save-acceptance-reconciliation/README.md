# A-save acceptance annotation — preserved separately on Sep17

The block below was added by merged PR #166 on Sep15. That edit changed the
checksummed README inside the original Sep14 bundle while its manifest remained
unchanged. Sep17 inventory confirmed only README differed: all other57 checksummed
files matched. The original README is restored byte-for-byte from fd31dbf, matching
its existing SHA256SUMS. No raw RPC, envelope, screenshot, receipt or manifest changed.

This note preserves the accepted interpretation; it does not reopen #130 or undo
Fatih's acceptance. The numbers below are the historical Sep15 annotation, not a
new cadence measurement. Original acceptance source: #166 / b8afd44.

> **Accepted 2026-09-15 for `W3-D18-02a` ([#130](https://github.com/Fatihmaull/evergreen/issues/130)).**
>
> ## What this proves, and what it deliberately does not
>
> **Proved:** the engine decided and submitted with no human triggering it. A
> user-systemd timer fired on its own at 08:34:44 UTC, the engine chose to act,
> and a real transaction landed — `dae63da8…69128`, inclusion ledger 4,670,261,
> fee 44,725 stroops against a 2,000,000 cap. Independently confirmed against the
> chain rather than against this bundle: status, inclusion ledger and fee charged
> all match, and A's post-state expiry of 6,370,261 was read back with a separate
> scan.
>
> **Not proved:** that the production GitHub Actions cron does the same. It has
> never executed this path — it runs decide-only with no secret — and this proof
> says nothing about it.
>
> ## The local timer is the better demonstration, not a weaker substitute
>
> That distinction is worth stating positively rather than as a caveat, because
> the honest version is the stronger one.
>
> The GitHub cron delivers about **11% of its declared cadence** — a 136-minute
> median and a 369-minute worst gap against a declared 15 minutes
> ([measurement](../2026-09-14-scheduler-cadence/README.md)). Running this proof
> on that scheduler would have entangled two separate claims: *what the engine
> decides and submits when it fires*, and *whether the platform fires when it
> says it will*. The first is ours; the second is GitHub's, and it is measurably
> unreliable.
>
> A local OS timer separates them. It fires when it says it will, so what remains
> in the record is the engine's behaviour and nothing else. **Two claims, proved
> separately, is stronger than one claim that quietly depends on both.**
>
> The platform's scheduling is tracked on its own terms in `W3-D18-01`, whose row
> now states the measured cadence in its title rather than behind a caveat.


