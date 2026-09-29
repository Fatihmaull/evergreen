# Week 4 review — 2026-09-29 pre-gate read

This is the shared W4-D28-03 review, prepared one day before its planned
September 30 gate so a finding can still be acted on. The repository baseline
is main 74348877aa5ab740d1ced591e65b3ab210fae379 at 2026-09-29 11:58 UTC.
[Evidence snapshot #4](evidence/2026-09-29-w4-review/README.md) records the
checks and their limits. This review did not create a Testnet transaction,
change a protected subject, rewrite a capture, or edit the demo video.

## Gate result: not all three deliverables are public yet

| Deliverable | SOW evidence read | Qualification |
|---|---|---|
| 1 — CLI | Present, 4 of 4 items | Published npm CLI 0.1.1 installed and scanned from a clean directory. Historical GitHub Release cli-v0.1.0 is a distinct artifact. |
| 2 — Engine | Present, 4 of 4 evidence items | The capped policy-signer capability in SOW §4.1 is not available. The plain funded-account path and its limits are documented; a guide is not the missing capability. |
| 3 — Dashboard, Action, docs and demo | Partial, 4 of 5 items | No accepted public 3–5 minute demo URL is in EVIDENCE.md. A private video or local rough cut does not clear the link gate. |

The repository gate still reports the missing video evidence type while
allowing checks until **2026-10-01 00:00 UTC (07:00 WIB)**. The
[recording sheet](W4-D28-02-RECORDING-SHEET.md) and
[design-language reference](../web-reference/design-language/README.md)
exist. Fatih is handling edit and voice-over; this review neither approves
the private cut nor claims an upload. The milestone line in BACKLOG.md,
"all three deliverables shipped and publicly reachable", is **not met yet**.

## Product readiness is a different test

[READY.md](READY.md) asks what a stranger can do from the docs alone. A fresh
read-only run on September 29 returned **2 PASS, 0 FAIL, 2 HUMAN**:

1. CLI install plus read-only A scan: PASS using the published 0.1.1 package.
2. Dashboard entry route plus scanner affordance: PASS in the mechanical
   smoke. This does not replace a stranger actually operating the page.
3. Action in an unrelated person's own CI: HUMAN. The repository-owned
   external fixture has already produced green and red using A at different
   thresholds, but Rakha owns that fixture; an unrelated human has not
   followed the guide.
4. Self-hosted engine on a non-guinea-pig contract: HUMAN. The guide exists,
   but nobody independent has established that it is sufficient. The
   scheduled repository cron is decide-only, not an unattended live-send
   service.

The fresh-machine instrument previously called guinea-pig D the intended
red fixture even though the merged A-threshold run removed that need, and
called outcome 4 the only human check despite outcome 3 also being HUMAN.
Its report wording was corrected under B-D29-03 in this branch; verdicts and
execution logic were unchanged.

## Carry-over and owner boundaries

- W3-D21-01 and W3-D21-02 remain in progress; the formal Week 3 snapshot #3
  was not produced. Do not relabel the W3 inventory or the later B/C captures
  as that missing gate snapshot. The W2 snapshot #2 does exist and its
  previously stale index entry is corrected with this review.
- B and C have committed decay/expiry evidence, with C's missed Friday
  checkpoint retained as a permanent gap. The original B v1 verdict remains
  unverified; its separate assessment reports expiry-observed. Issue #219
  about missing raw watcher logs is closed. W3-D18-02d, the shared-code
  extension, remains pending and is not implied by any capture.
- W3-D20-01 accepted Stage 2 as Partial. A later hosted Neon adoption is
  not an assessor evidence item; issue #260 holds the still-open ownership
  decision. Fatih's comment recommends deferring that decision past
  October 2. No migration is authorised by this review.
- The web track owns its apps and web-reference rows. BACKLOG still has
  unticked web rows even though a public dashboard and docs site exist; this
  report uses the deployed URL and current SOW gate for the deliverable
  reading, and does not silently flip Fatih-owned task checkboxes.
- Rakha-owned W4-D22-12/13/14 still have open issues
  [#195](https://github.com/Fatihmaull/evergreen/issues/195),
  [#196](https://github.com/Fatihmaull/evergreen/issues/196), and
  [#197](https://github.com/Fatihmaull/evergreen/issues/197): presentation
  rules, app-aware gates, and browser CI respectively. They are engineering
  follow-ups, not a substitute for the missing video evidence type.
  [#198](https://github.com/Fatihmaull/evergreen/issues/198) is closed while
  its W4-D22-15 checkbox is still pending; task-status reconciliation is
  separate from claiming any new behaviour.

## Next gates

1. Fatih and Rakha review the final video, put it on an allowed host with
   no-login access, and add its URL to EVIDENCE.md through a reviewed PR.
   Until that URL lands, Deliverable 3 remains Partial.
2. A human outside the implementation path tests READY outcomes 3 and 4.
   A script or a team-owned fixture is useful technical proof, not a
   substitute for that observation; leave B-D29-03 In progress otherwise.
3. On October 1, re-read the public npm version and every assessor-facing
   version link together under Fatih-owned B-D29-05. Fatih owns the eventual
   evidence-bundle submission. The shared retro and SOW 2 candidate list
   follow after the submission-critical work.

Completing this **review** does not mark the Week 4 milestone, the demo task,
the two human READY calls, or hosted persistence Done. Repo facts above are
dated; a later merge or publication requires a new readback. Notion mirror
sync for W4-D28-03 is pending.
