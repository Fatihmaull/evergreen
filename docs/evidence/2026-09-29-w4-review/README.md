# Evidence snapshot #4 — Week 4, 2026-09-29

Observation cut: 2026-09-29 11:58 UTC (18:58 WIB), from
main 74348877aa5ab740d1ced591e65b3ab210fae379. This is a
repository/publication/readiness snapshot, **not** a new chain capture.
No raw RPC, transaction, sealed bundle or recorded verdict was changed.
The [Week 4 review](../../W4-REVIEW.md) interprets these observations.

| Check | Observed result | Limit |
|---|---|---|
| Full pnpm check on this main baseline | Exit 0; 63 Vitest files and 818 tests passed; remaining Node suites passed. Coverage: 94.35% statements, 90.43% branches, 94.42% functions, 96.45% lines. | This proves repository gates, not stranger usability. |
| Evidence-integrity gate | 39 bundles, 919 manifest entries verified; three captured transaction hashes indexed. | No bundle was resealed or recopied for this review. |
| SOW completeness gate | D1 4/4 Present; D2 4/4 evidence items Present; D3 4/5 Partial. The sole absent type is a public 3–5 minute demo link in EVIDENCE.md. | D2 policy-signer Stage 2 capability remains unavailable despite its evidence guide. A private video is not a public link. |
| Fresh-machine instrument with --no-write | Published CLI 0.1.1 clean install plus read-only A scan PASS; dashboard entry/scanner structural check PASS; Action and self-hosted engine HUMAN. Total 2 PASS, 0 FAIL, 2 HUMAN. | The dashboard leg checks route and scan affordance, not a human browser interaction. No human verdict was invented. |
| Latest main CI | [Run 36560299860](https://github.com/Fatihmaull/evergreen/actions/runs/36560299860) succeeded for the baseline SHA. | CI can be green while SOW video evidence is absent; check:sow warns until October 1 UTC. |
| Published Action path | [External run 36255608415](https://github.com/rakhargo/evergreen-check-smoke/actions/runs/36255608415) has green success and intentional red failure using the v1 Action tag. | The external repo is still operated by Rakha; it is not the unrelated-human READY call. |
| Week 3 follow-up | [Stage 2 decision #183](https://github.com/Fatihmaull/evergreen/issues/183) and [watcher-log issue #219](https://github.com/Fatihmaull/evergreen/issues/219) are closed. [Neon ownership #260](https://github.com/Fatihmaull/evergreen/issues/260) remains open. | A closed issue does not by itself close all W3 review or READY rows. |

The [submission index](../../SUBMISSION-INDEX.md) links the public CLI,
dashboard, Action, and docs. This run freshly exercised the CLI and checked
the dashboard entry/scanner route; the tagged Action result and other links
are attributed to their dated records, not all re-opened in this sitting.
The current SOW gate will hard-fail on **2026-10-01 UTC** if the demo URL is
still absent. Its host must match the gate's allowlist, and a reviewer must be
able to open it without signing in. This snapshot leaves that item empty
rather than pasting a local file or a private message.

The current product-readiness result is not "four pass": the
[earlier dated run](../2026-09-25-ready-fresh-machine/results.json) and
this September 29 --no-write rerun both reserve outcomes 3 and 4 for a human.
The rerun installed the public 0.1.1 CLI in a temporary directory and scanned
A read-only. It did not deploy a contract, fund an account, sign, submit, or
start a hosted database.
