# Ready to use — what Evergreen has to be by Oct 2

**This is the goal. [`BACKLOG.md`](../BACKLOG.md) is only the means.** A completed task list and a working product are not the same thing, and when they diverge this file wins.

> **Not to be confused with the task-level "definition of done"** in [`AGENTS.md`](../AGENTS.md), which says when one *task* may be ticked. This file says when the *product* is finished. A sprint can satisfy every task's definition of done and still fail this one.

---

## The four things a stranger must be able to do

Following **only the docs** — no access to us, no repo knowledge, no prior Stellar context beyond knowing what a contract is:

| # | A stranger can… | Bar |
|---|---|---|
| **1** | **Install the CLI and scan a real contract** | Under five minutes, start to answer |
| **2** | **Open the dashboard and check any contract's TTL** | No wallet, no signup, no account |
| **3** | **Add `evergreen-check` to their own repo's CI** | And see it both **pass** and **fail** |
| **4** | **Self-host the engine against their own contract** | Funding their own account |

Each is checkable by someone who is not us. That is the whole point of the list: "the CLI works" is an opinion, "a stranger installed it in four minutes on a machine that never saw this repo" is an observation.

## What "ready to use" honestly means for each

Overclaiming is the one thing that would make a working product look broken. A reader who expects one click and finds a fork-and-configure will conclude the tool is unfinished — even when it is doing exactly what it was designed to do.

**The CLI, the dashboard and the Action can be genuinely turnkey by Oct 2.** Install, open, add-to-workflow. No qualification needed, and none should be offered.

**The engine is self-hosted by design, and that is not a shortfall.** ADR-004 settles it: the user always pays their own extend fees, so the user runs the engine with their own funded account. There is no hosted instance to sign up for, and building one is explicitly a SOW 2 direction rather than a v1 gap. So for the engine, *ready to use* means **"deployable by someone competent following the guide"** — fork it, set a secret, edit a config, schedule it. Not one click.

**Say that plainly in the README rather than letting a reader discover it.** The sentence to avoid is any that implies the engine runs itself for you; the sentence to write says who runs it and what they need. A reader told the truth up front reads a self-hosted tool as a design choice. The same reader, having expected a service, reads it as a broken promise.

## How this gets checked — early, repeatedly, and by a stranger's path

**The failure mode this guards against is a verification whose result arrives too late to act on.** This project has been bitten by that shape three times already: `W3-D20-02` scheduled two days after the crossing it protected; guinea-pig A's expiry watched by nobody because the watching was pointed at B and C; and CI reporting green about a commit that was no longer being merged.

`B-D29-03` — the fresh-machine test, the single check that answers *"can a stranger use this"* — is planned for **Thu Oct 1, one day before submission.** A failure there has nowhere to go.

So the check moves earlier and repeats. **This adds no scope**; it re-sequences work that already exists, the same move as the Week 3 rescope and the decay-proof insurance:

| When | Run | What a failure tells you, while you can still act |
|---|---|---|
| **End of W3 — Tue Sep 23** | Fresh-machine install-and-scan against whatever exists | **It is expected to fail.** That is the point. Failing on Sep 23 is information; failing on Oct 1 is a crisis. |
| **Each W4 gate** | Repeat it | Three cheap runs beat one expensive one, and each one is cheap precisely because the last one found the obvious things. |
| **Thu Oct 1 (`B-D29-03`)** | The final run | Confirmation, not discovery. If this is the first time anyone tried, the schedule already failed. |

**Draft the README quickstart before [`W4-D26-01`](../BACKLOG.md).** Otherwise the early runs test a placeholder rather than the real front door, and a fresh-machine test against a README nobody has written yet measures nothing.

## Where the four actually stand — 2026-09-09, day 7 of 30

Assessed against the backlog as written, with every risk put to two independent refuters. **32 of 34 candidate risks were refuted** — mostly because the backlog already mitigated them somewhere the assessor had not read, which is a good sign about the plan. The two that survived are both real and both now fixed or re-sequenced.

| # | Outcome | Verdict | The binding constraint |
|---|---|---|---|
| 1 | CLI install and scan | 🟡 **at-risk** | No runnable path for a stranger until `W4-D27-02` on **Sep 29, day 27** — and the artifact could not install at all until Sep 9 (below) |
| 2 | Dashboard TTL check | 🟡 **at-risk** | Zero dashboard code exists; first line is written Sep 24, public URL unproven until Sep 26. Cheapest of the four to build, latest to start |
| 3 | Action in a stranger's CI | 🟡 **at-risk** | Was scheduled to be proven **two days before the package it wraps existed**; now re-sequenced |
| 4 | Self-hosted engine | 🔴 **will not make it as stated** | One backlog line (`W4-D26-02`, Sep 28) carries the entire claim, and **no task anywhere verifies it** |

### The one that was already broken

**`npx @evergreen-stellar/cli` would have 404'd for every user**, and nothing in the plan would have found out until Sep 29. Both `cli` and `core` declare `@evergreen-stellar/shared-types` as a **runtime** dependency; only two packages were ever going to be published. Reproduced by packing the real workspace and installing into an empty directory:

```
npm error code E404
npm error 404 Not Found - GET https://registry.npmjs.org/@evergreen-stellar%2fshared-types
```

Fixed the same day, and re-verified: install exit 0, CLI runs from a directory that never saw the repo. The rehearsal that caught it is now `W2-D14-02b`, on **Sep 16 instead of Sep 29**. Note what *would not* have caught it: `W4-D27-01`'s `npm publish --dry-run`, which packs without resolving. **A check that never leaves the monorepo cannot answer a question about strangers.**

### Outcome 4 is the honest problem

The other three are timing, and timing is fixable by moving work that already exists. Outcome 4 is different: the engine is the only one of the four with **no independent verification anywhere in the thirty days.** The Action gets a throwaway repo (`W4-D25-02`); the CLI gets the fresh-machine test (`B-D29-03`); the engine gets a guide written on Sep 28 and read for the first time by the grant reviewer.

Everything a stranger would need is also produced in our-repo, our-guinea-pig form today: the cron workflow hardcodes guinea-pig A's contract ID and needs no secrets, and `packages/engine` is private under a name no task publishes. **That is not a documentation gap; it is a "nobody has tried it" gap**, and the fix is to make someone try — which is why the Sep 23 run below covers the engine and not just the CLI.

## The trade, stated in advance

**If any of the four cannot realistically be true by Oct 2, flag it at the Week 3 gate** (`W3-D21-01`) — not later, and not quietly.

**Cutting a P1 to protect one of the four is the right trade, every time.** The cut order in [`BACKLOG.md`](../BACKLOG.md) exists so that decision is a lookup rather than an argument at 11pm on Oct 1. Its first items are already the cheap ones.

What must never be cut to make a deadline: any of the four above, the evidence capture, or the unattended bump proof. Those *are* the deliverable. Everything else is negotiable, and saying so now is what makes it negotiable later.
