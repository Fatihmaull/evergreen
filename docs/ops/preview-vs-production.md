# The preview trap

**Status: options proposed, Fatih decides.** Nothing on this page has been changed in the workflows yet, except making the problem visible ([#462](https://github.com/Fatihmaull/evergreen/pull/462), `PH2-E0-09`).

"Verified on preview" does not mean "verified on `main`". It can mean *verified on whichever pull request deployed last*. On 2026-10-26 it did: the login test ran on a Worker built from #440/#441's branches, not `main`, and the evidence had to be written that way (handoff §7.5). There are **two** gaps, in two different layers.

## Gap 1: the preview Worker runs whichever PR deployed last

`evergreen-api-preview` is deployed by **every same-repo pull request that touches `apps/api/**`, drafts included**, and by any manual dispatch. There is one Worker, so the last writer wins.

Observed live on 2026-10-27, while this page was being written:

| UTC | What deployed to `evergreen-api-preview` | Preview `/health` said |
|---|---|---|
| 16:26:12 | `feat/PH2-E2-04-health-commit` @ `16c84c0` (a PR branch, not `main`) | not read |
| 16:35:38 | `ci/PH2-E0-09-deploy-commit` @ `29ca3a4` (this work) | not read |
| 16:38:17 | `feat/PH2-E2-04-health-commit` @ `32aad89` again, a new push by another agent, **three minutes later** | `"commit":"undetermined"` |
| later | this work, deliberately re-run | `"commit":"29ca3a4432587e54902bb1619bddcea96d3a9d17"` |

Anyone testing between two of those rows tested someone else's code.

## Gap 2: the Pages preview builds from the git branch `preview`, which lags `main`

- The only origin the API accepts for signed-in flows is `https://preview.evergreen-stellar.pages.dev` (`DASHBOARD_ORIGIN`, one exact origin). That alias is believed to be Pages' alias for the git branch named `preview` (`undetermined` from the CLI: see [`README.md`](README.md#undetermined-settle-these-before-relying-on-them)).
- Nothing moves that branch. It was fast-forwarded by hand after each merge. On 2026-10-27 it was **9 commits behind `main`** (`51320ef` vs `0da486a`; 7 files under `apps/` and `functions/` differ), and it is unprotected.
- So the preview **UI** (branch `preview`) and the preview **API** (last PR to deploy) can be two unrelated commits at once.
- Every other branch also gets a Pages preview, but those previews cannot sign in (wrong `Origin`), and they all talk to the same preview Worker. At least 25 Pages deployments across 17 branches were listed within about 13 hours; whether that approaches a Pages build limit is `undetermined`.

## What was ruled out

| Idea | Why not |
|---|---|
| **A Worker per PR** (`evergreen-api-pr-<n>`) | A Pages preview binds **one** Worker for all preview branches, so a per-PR Worker is unreachable through the proxy. Reached directly on `workers.dev` it is cross-site (`workers.dev` is on the Public Suffix List), so the `SameSite=Lax` session cookie is never sent: [`docs/API.md`](../API.md) §1 decided option B for exactly this reason. Each Worker would also need its own four secrets. It could only test unauthenticated routes. |
| **A second long-lived Worker for PRs** | Same binding limit: Pages preview has one binding. |
| `wrangler versions upload` (a version without deploying) | Gives a `workers.dev` preview URL: same cookie problem. Fine for unauthenticated routes only. |

## Options

### Gap 1 (the Worker)

| | What | Trade-off |
|---|---|---|
| **W1. Make it visible** | `/health` reports the deployed commit ([#460](https://github.com/Fatihmaull/evergreen/pull/460) + #462) | Free and already built. Does not prevent the overwrite; it makes it **detectable**. Needed under every other option. |
| **W2. Preview is `main` by default; PR deploys are opt-in** | Add a `push: main` preview deploy (restores the baseline after every merge). A PR deploys to preview only when it carries a label (e.g. `deploy-preview`) or is dispatched by hand; drafts never. | A PR author who wants a real-Worker test must ask for it, and two people can still collide, but never by accident, and `/health` says who. Small workflow change. |
| **W3. No PR deploys at all** | Preview tracks `main` only | The strongest guarantee, and it **loses pre-merge testing on a real Worker**, which is how the 2026-10-24 email failures were worked through: the run history shows each fix (#438, #439) deployed to preview from its PR branch before it merged. Reliable for evidence, costly for development. |

### Gap 2 (the Pages preview)

| | What | Trade-off |
|---|---|---|
| **P1. Leave it manual** | Someone fast-forwards `preview` | It lags (9 behind today). The UI and API disagree until a human remembers. |
| **P2. Automate the fast-forward** | A small workflow on `push: main` that runs `git push origin main:preview` with `contents: write` | Removes the lag. It adds a workflow that can write to the repo (only to the unprotected `preview` branch). A non-fast-forward push fails loudly instead of silently diverging. |
| **P3. Build previews only for `preview`** | In the Pages project's branch controls, build previews for the branch `preview` only | Cuts ~16 branches' worth of builds (settles the quota question) and the previews that cannot sign in anyway. WEBF and WEBR lose per-branch UI previews. Dashboard setting, Fatih's to make. |

## Recommendation

**W1 + W2 + P2**, then **P3 only after Fatih reads the Pages usage page.**

- Together they make "preview" mean `main` at every layer unless someone explicitly says otherwise, and `/health` proves which.
- W3 is the fallback if W2's opt-in still produces confusion: it is stricter but costs the pre-merge test.
- Until a decision, the working rule for anyone writing evidence: **quote `/health`'s `commit` and say whether it is a `main` commit or a PR head; a missing field is `undetermined`.**

W2 and P2 each change a deploy path, so each is its own PR and is commissioned before it is trusted (a deploy from a labelled PR, from an unlabelled PR, from a draft, and from a merge to `main`, each read back through `/health`).

## Decisions for Fatih

1. **Preview trap:** W1 + W2 + P2 (recommended), W1 + W3 + P2, or W1 only.
2. **Stale approvals** ([`deploy.md`](deploy.md#stale-approvals-deploy-old-code)): approving a waiting run deploys *that run's* SHA, so a late approval can roll production back. Option **(a)** make the production job fail if `apps/api` or the workflow changed on `main` after the run's SHA (a `git diff --quiet "$GITHUB_SHA" origin/main -- apps/api .github/workflows/api-deploy.yml` step; the message says "approve the newest run"); option **(b)** rely on the rule "read the SHA, approve the newest". **(a)** costs one step and stops the mistake mechanically; **(b)** costs nothing and relies on attention. Recommendation: **(a)**.
3. **Pages previews (P3):** check the Pages usage and build limit in the dashboard, then decide. Recommendation: do P3 if builds are anywhere near the limit.
