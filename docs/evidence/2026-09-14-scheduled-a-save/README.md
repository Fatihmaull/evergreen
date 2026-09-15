# W3 Stage 1 scheduled A save and real alerts

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


One actual user-systemd timer ran pinned source `32670fea3b66f59a9c156cee01126691c4aed86e`
on 2026-09-14. Armed 08:33:44 UTC, started 08:34:44, completed 08:34:53.
Invocation `63214779da9a45a0b9ff26c1e259c2a8` matches captured runner metadata
and the independently recorded systemd journal. This is a local scheduled proof;
Shared acceptance and production GitHub deployment remain separate.

- Transaction: `dae63da8bd42dde7ca8a72ac9ff99f7d7179cc505819db337253843e60369128`.
- Inclusion ledger: 4,670,261. Exactly one `extendFootprintTtl`, A instance only.
- Instance expiry: 6,026,591 → 6,370,261 (+343,670 ledgers).
- Raised action threshold: 1,500,000. Target remaining TTL: 1,700,000.
- Fee: 44,725 stroop charged; envelope bound 60,683; configured cap 2,000,000.
- All five B/C/shared controls retained their original expiry. No restore or funding.
- Success email: `07992c67-18c1-4dfe-8515-0dce865e8b21`.
- Separate shared-code refusal/liveness email: `3429c29c-8c8e-4638-b2f7-cbd99df5277c`.
- Rakha confirmed both emails arrived in the inbox; no resends.

A did not naturally decay to this trigger. Its action threshold was deliberately
raised above observed TTL; detection, scheduled execution, extension, fee and
alerts are real. The protected shared entry correctly remained a skip with an
alarm, so the final runner exit was 1 even though A succeeded. The service accepts
that documented alarm status; the original result has not been rewritten.

`rpc/` retains full unedited requests/responses including signed envelope,
submission response, confirmation and metadata XDR. `explorer.jpg` is the actual
browser screenshot, inspected after export. `attempt.jsonl` is the persisted
pre-send intent. `alerts/` retains exact messages/results and delivery receipts;
addresses and provider credentials were never part of those files.

`campaign.json` and the exact private-config copy contain public IDs and secret
variable names only, not keys. The selected existing dev key matched the public
payer; the global environment was not changed. The runtime snapshot references
installed SDK 17.0.1; this is a controlled host proof, not a hermetic release image.
The original attempt remains in private persistent storage.

The actual readiness gate rejected this same manifest after the successful run,
and a fresh command process also exited 2 before capture, network or signer access.
A requested second OS timer was not activated because automatic approval review
was at capacity; the refusal check is therefore reported as process/offline proof.
`replay-refusal.json` records unchanged attempt checksums.

Run `node docs/evidence/2026-09-14-scheduled-a-save/verify-proof.mjs` from the repo root.
It validates SHA256SUMS first, then binds record, intent, payer signature, exact
footprint, receipt, TTL metadata change, control reads, timing and accepted success
message. Inbox confirmation is a separate human observation, not inferred from
Resend acceptance. This evidence is local pending internal review/publication.
