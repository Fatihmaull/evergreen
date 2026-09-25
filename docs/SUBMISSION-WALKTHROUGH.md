# Ten-minute verification walkthrough

**For Kenny Rivaldi, Ambassador Chapter Lead.** Ten steps, about ten minutes,
**nothing here needs a terminal.** Every step says what to open, what you should
see, and — the part that matters for §6.2 — **what seeing it proves.**

> **This is not the evidence index.** [`SUBMISSION-INDEX.md`](SUBMISSION-INDEX.md)
> maps each SOW §6.1 requirement to its artifact, in §6.1's order, for checking
> coverage. **This page is a route through it**, ordered by what settles the
> question fastest rather than by the SOW's numbering.
>
> **One thing is incomplete, and it is named at the step where you meet it** —
> step 10 — rather than collected at the end. You should not have to find it.
> *(Updated 2026-09-25: this said three. The npm package published on 2026-09-24
> and took two of them with it.)*

## Before you start — two things that will otherwise look like errors

**1. Live pages and committed snapshots will disagree, on purpose.**
[The overview](https://evergreen-stellar.pages.dev/dashboard/) reads the chain
live. [Our contracts](https://evergreen-stellar.pages.dev/dashboard/contracts/)
grades from a snapshot committed with the build and **says which ledger it was
read at.** Soroban TTL falls by roughly one ledger every five seconds, so the two
figures are never identical. A page that labels its own staleness is doing the
right thing; a page that quietly showed you a stale number as current would not
be.

**2. If an explorer link opens empty, testnet has been reset.**
Stellar wipes testnet periodically. A transaction hash pointing at a chain that no
longer exists proves nothing to anyone — which is why every claim below is also
backed by committed raw RPC responses and explorer screenshots taken at the time.
**Both transactions in step 4 were re-verified against the network on
2026-09-25.** If they are gone by the time you read this, the committed bundle is
the durable record and that is what it is for.

---

## Deliverable 1 — the CLI · about 2 minutes

### Step 1 · The repository

**Open:** [github.com/Fatihmaull/evergreen](https://github.com/Fatihmaull/evergreen)

**You should see:** a public repository, MIT licensed, with a green CI badge and a
README that opens on what the tool does.

**What it proves:** the work is public and inspectable, and its own tests pass on
every change. This is §6.1's first item for Deliverable 1.

### Step 2 · The CLI actually doing the three things

**Open:** [four entry types](evidence/2026-09-14-d1-capture/capture-1-four-entry-types/1.png)
· then [storage advice](evidence/2026-09-14-d1-capture/capture-3-storage-advice/1.png)
· then [blast radius](evidence/2026-09-14-d1-capture/capture-4-blast-radius/1.png)

**You should see:** real terminal output. Remaining TTL **counted in ledgers** with
a wall-clock date labelled as an estimate; a projected archive date; and a cost to
extend.

**What it proves:** §6.1 asks for screenshots showing *TTL, archive prediction and
cost estimates* — these are those three, on a real contract, not a mock-up. The
third image is the one worth pausing on: it shows the tool reporting that a code
entry is **shared with other contracts**, which is the finding the tool exists for
(step 8 shows why).

### Step 3 · Test coverage — and the package you can run yourself

**Open:** [coverage report](evidence/2026-09-10-coverage/coverage-report.txt)

**You should see:** **93.24%** of statements, 85.29% of branches, 97.64% of
functions, 94.57% of lines.

**What it proves:** the correctness claims are measured, not asserted.

> ✅ **Deliverable 1 is complete.** The fourth item —
> **[`@evergreen-stellar/cli@0.1.0`](https://www.npmjs.com/package/@evergreen-stellar/cli)** —
> published on 2026-09-24. You can run it yourself with no install and no account:
>
> ```
> npx @evergreen-stellar/cli scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
> ```
>
> We then checked it against what the registry actually serves rather than against
> our own build — clean directory, no workspace above it, isolated cache. One
> declared dependency. [The record](evidence/2026-09-25-published-package-verification/README.md).

---

## Deliverable 2 — the engine · about 4 minutes

**This is the strongest deliverable, and the two best pieces of evidence in it are
both the engine *refusing* to act.**

### Step 4 · A real transaction, on the public chain

**Open:** [the unattended save on stellar.expert](https://stellar.expert/explorer/testnet/tx/dae63da8bd42dde7ca8a72ac9ff99f7d7179cc505819db337253843e60369128)

**You should see:** a successful `extendTTL` transaction on Stellar **testnet**,
included at ledger **4,670,261** on 2026-09-14.

**What it proves:** the engine's output is a real state change on a public
blockchain that anyone can check independently of us. Not a log line, not a
screenshot — the chain.

### Step 5 · That it ran with nobody watching — and the boundary of that claim

**Open:** [what the run did](evidence/2026-09-14-scheduled-a-save/README.md)

**You should see:** two headings near the top — **"Proved"** and **"Not proved"**.
Proved: a timer fired on its own at 08:34:44 UTC, the engine decided to act, and
the transaction in step 4 landed. Not proved: that the production GitHub Actions
cron does the same thing — it has never executed that path.

**What it proves:** the automation is genuinely unattended, **and** we mark exactly
where the claim stops. §4.1 promised an auto-bump engine; this is it running with
no human in the loop, with the one thing it does not yet demonstrate stated in our
own words rather than left for you to discover.

### Step 6 · The operator finds out — including when nothing happens

**Open:** [success alert](evidence/2026-09-22-alert-screenshots/success-alert-inbox.png)
· then [the refusal alert](evidence/2026-09-22-alert-screenshots/shared-code-refusal-alert-inbox.png)

**You should see:** two emails in a real inbox. One reports a completed extension.
The second reports that the engine **declined** to extend something.

**What it proves:** §6.1's alert screenshots, and something beyond them. The second
email is a tool telling its operator *"I could have acted here and chose not
to."* A tool that only reports its successes cannot be trusted near production.

### Step 7 · Both halves of the claim, from observations recorded at the time

**Open:** [the TTL decay chart](https://evergreen-stellar.pages.dev/dashboard/decay/)

**You should see:** one chart with two shapes — a line declining to zero and
stopping (**guinea-pig B**, left alone), and a line that steps back up
(**guinea-pig A**, extended). Dots are unevenly spaced.

**What it proves:** that decay is real and that intervention works, on the same
axes. The uneven spacing is the tell that these are **recorded observations rather
than a simulation** — the readings happened when people took them.

Guinea-pig B was watched from health into expiry across four checkpoints:
**17,279 → 8,641 → 4,319 → expired**, roughly halving each time, on a contract
nobody touched. At the first three the engine detected it below threshold and
**refused to extend**, because B was the proof and extending it would have
destroyed the only evidence in the project that cannot be recreated.

> **One qualification on Deliverable 2, in our words.** §4.1 describes a *capped
> policy-signer*. **That capability is not delivered and we are not claiming it.**
> The reason is a property of Soroban, not a shortcut: contract-level
> authorization does not constrain the signature on the ordinary transaction that
> *pays* for a TTL extension, so a policy signer of that shape does not cap the
> key it was meant to cap. What ships is the path verified end to end — a funded
> account the self-hoster owns — documented with its limits in
> [`POLICY-SIGNER.md`](POLICY-SIGNER.md). **All four of §6.1's evidence items for
> Deliverable 2 are present**; this concerns §4.1's description of the mechanism.

---

## Deliverable 3 — dashboard, CI check, docs · about 2½ minutes

### Step 8 · The finding the whole tool exists for

**Open:** [our contracts](https://evergreen-stellar.pages.dev/dashboard/contracts/)
and read the **guinea-pig A** panel.

**You should see:** A graded **healthy**, and directly beneath it *"binds: contract
code"* with an expiry around **20 October 2026** — and a line saying that code
entry is **shared with B and C**.

**What it proves:** this is the point of the product. **The entry that will kill
the contract is not the contract's own.** A is healthy for a year on its own
storage, but it dies in October with a code entry it shares with two other
contracts — and a scan of A alone *cannot see that*, because the chain does not
index reverse dependencies. Three contracts, one shared fate, invisible from
inside any one of them. That is the risk no existing Stellar tooling reports, and
it is why this project was funded.

You should also see **B reading `archived`** — the same contract from step 7,
after expiry. By the time you read this **C will read archived too**; its expiry
was 26 September, the documented second run of the same proof.

### Step 9 · You check a contract yourself, with no account

**Open:** [the scanner](https://evergreen-stellar.pages.dev/dashboard/scanner/),
press **Use guinea-pig A**, and press **Scan**. Or paste any testnet contract ID.

**You should see** — this is the real output, run on 2026-09-25:

> `healthy` · worst entry health · warn below 120,960 · act at or below 17,280 ledgers
>
> **This contract stops working on ~October 20, 2026, at ledger 5,290,829 — its
> contract code entry expires first.**
>
> Scan is **PARTIAL — 2 issue(s). Absence is not health.**

**What it proves:** §6.1's live testnet dashboard, and the product thesis in one
click — **no wallet, no signup, no account, and nothing you do here can spend
anything.** Scanning is a permissionless read.

It also proves step 8's point in the tool's own words rather than ours: the second
line names **the code entry as the thing that expires first**, on a contract graded
`healthy`.

**Those two are not in conflict, and the distinction is the product.** `healthy`
means *above the alert threshold today*. October is when that stops being true. A
tool that only showed you the grade would have told you nothing worth acting on.

**`PARTIAL — 2 issue(s)` is the honest part.** One issue is that a single-contract
scan cannot settle whether that code entry is shared, so it reads **undetermined**
rather than guessing. The other is that no data keys were supplied, so only the
instance and code entries were visible. A clean result means *"everything I was
asked to check is healthy"* — never *"this contract is healthy"* — and the tool
refuses to blur the two.

> **You will not see a rent figure on this page, and that is deliberate.** The
> cost estimator is not yet safe to run in a browser, so the page shows rent as
> *unavailable* rather than showing `0`. A wrong number is worse than a gap,
> because you cannot tell. The cost figures are in step 2, from the CLI.

### Step 10 · The CI check — and the two remaining gaps

**Open:** [a green run and a red run](https://github.com/Fatihmaull/evergreen/actions/runs/36095411235),
then [the CI section of the README](../README.md#use-it-in-ci)

**You should see:** one workflow, two jobs. `green · must pass` **succeeded**;
`red · must fail` **failed with exit code 1**. Both scanned the same contract and
**only the threshold differs** — so the thing demonstrated is *"the job fails when
an entry is at or below the threshold you configured"*, not that the contract is
decaying. Then a short YAML block a developer drops into their own workflow.

**What it proves:** §6.1's `evergreen-check` GitHub Action exists and is usable by
someone else. The last clause is the honest part — an incomplete scan is not
evidence of health, so it fails rather than passing quietly.

> ⬜ **One item is incomplete, in the whole submission: the 3–5 minute demo video
> has not been recorded.** The [script](W4-D28-01-DEMO-SCRIPT.md) is written, timed
> at 4m20s, and every slot that blocked recording is now filled and verified
> against the live artifact. What is missing is the recording.
>
> **And something we would rather tell you than have you find.** The run linked
> above is the second attempt. The first time that workflow ever ran, **both jobs
> failed** — including the one named *green · must pass* — with
> `Unable to locate executable file: pnpm`. That was a genuine defect in the
> Action: it was configured in a way that required the *caller's* package manager
> to be installed, so `evergreen-check` would have failed on first use in any
> repository that uses pnpm. It is fixed, and a test now guards it.
>
> We are telling you because of what it says about the evidence. **The file existed
> and looked correct for days; running it is what found the defect.** That is why
> the run is in the evidence and not just the configuration.

---

## Where that leaves the three rows

| | Our reading | What is missing |
|---|---|---|
| **Deliverable 1** | **Present — 4 of 4** | nothing |
| **Deliverable 2** | **Present — 4 of 4** | nothing in §6.1; §4.1's policy-signer is addressed in step 7 |
| **Deliverable 3** | Partial — 4 of 5 | **the demo video, and nothing else** |

**One evidence item is absent across all three deliverables.** The publish on
2026-09-24 filled D1's fourth item and D3's npm links, made the demo's install
line true, and made the Action's green-and-red pair recordable — all four at
once.

**You do not have to take our word for that reading.** The repository runs a check
of its own, `check:sow`, that looks for each of the thirteen §6.1 artifacts and
reports Present/Partial independently of this page and of the index. If we
quietly marked something complete here, that check would still say otherwise —
and from 29 September it blocks every merge until the gap is closed rather than
merely warning.

If you want the machinery underneath any step: **59 dated evidence directories**
under [`docs/evidence/`](evidence/), each a sealed bundle of unedited RPC
responses with a `SHA256SUMS` over its own contents, none edited after the fact.
[The evidence page](https://evergreen-stellar.pages.dev/evidence/) is the
browsable version. **None of it is required to assess the three rows above.**
