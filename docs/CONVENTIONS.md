# Conventions

Rules an agent or human can follow without asking. If something here blocks good work, change the rule in a PR — don't silently deviate.

## Git

**Branches:** `<type>/<task-id>-<slug>` — e.g. `feat/W2-D8-01-ttl-math`, `fix/W3-D16-02-idempotency`.

**Commits:** Conventional Commits, with the task ID in the subject.

```
feat(cli): add scan command [W1-D7-01]
fix(engine): prevent double-bump across overlapping runs [W3-D16-02]
docs(primer): add getLedgerEntries response fixture [W1-D4-05]
chore(repo): pin node version [W1-D3-02]
```

Types: `feat` `fix` `docs` `test` `refactor` `chore` `ci`.
Scopes: `cli` `core` `engine` `dashboard` `types` `action` `repo` `docs`.

**Attribution:** commits and PR descriptions carry **no AI co-author trailer and no "generated with" footer.** The contributor list reflects the two people on the team. This is enforced mechanically in [`.claude/settings.json`](../.claude/settings.json):

```json
{ "attribution": { "commit": "", "pr": "", "sessionUrl": false } }
```

That file is committed rather than personal, so it applies to every clone and every session, not just one machine. The rule is written here as well because a settings file can be lost, overridden locally, or simply not noticed. *(The older `includeCoAuthoredBy` key is deprecated as of Claude Code v2.0.62 and is ignored once `attribution` is set — don't reintroduce it.)*

Commits made before 2026-09-05 carry the old trailer. They stay as they are: three commits are not worth a force-push on a repository a second person is cloning.

**PRs:** one task (or one tight cluster) per PR. Title = commit subject. Body must state: what changed, how it was verified, and any evidence captured. CI must be green before merge. `main` is protected — no direct pushes.

**Public naming:** use frozen task IDs and concrete deliverables in PRs, issues, comments and operational docs. Local grouping labels belong in private planning/chat; preserve historical identifiers and raw evidence.

**Stacked PRs: retarget the child to `main` *before* merging the parent.** Stacking is fine and we do it — a child PR based on a parent's branch keeps the child's diff readable. But GitHub deletes the parent's branch on merge, and **deleting a branch silently closes every PR that was targeting it.** The close is attributed to whoever clicked merge, so it reads like a rejection rather than an accident.

Recovering one is worse than it sounds, because the two repair paths block each other: GitHub refuses to reopen a PR whose base branch is missing, and refuses to change the base of a closed PR. The way out is to push the deleted base back to its old commit, reopen, retarget to `main`, then delete the temporary branch again:

```bash
git push origin <old-base-sha>:refs/heads/<deleted-base-branch>
gh pr reopen <n>
gh pr edit <n> --base main
git push origin --delete <deleted-base-branch>
```

Nothing is ever lost — the child's commits live on its own branch, untouched — but the PR record, its review comments and its CI history are only recoverable by the sequence above. Retargeting first costs one command and avoids all of it. *(Learned the expensive way on [#57](https://github.com/Fatihmaull/evergreen/pull/57), which merging [#53](https://github.com/Fatihmaull/evergreen/pull/53) closed.)*

## Task status — one meaning in both channels

Evergreen is tracked in the repo (canonical) and mirrored to Notion. The `BACKLOG.md` checkbox and the Notion `Status` select must mean **exactly** the same thing, or they will agree syntactically while diverging semantically.

| `BACKLOG.md` | Notion `Status` | Means |
|---|---|---|
| `[ ]` | Pending | Not started |
| `[~]` | In progress | Started, not finished |
| `[x]` | Done | Full definition of done: works against testnet, unit tests with fixtures, `pnpm check` green, docs updated, evidence recorded |
| `[!]` | Blocked | Cannot proceed. Requires an open Issue |
| `[-]` | Dropped | Cut. Reason required in `Notes` and `STATUS.md` |

**"Done" never means "code written."** If the definition of done is not fully met, it is `In progress`. Fatih and Rakha trust Notion's "Done" without checking, so it must never overstate.

**Recurring work is `[~]`, not `[ ]`.** A task that runs repeatedly until a date — the twice-weekly drift check, for instance — is *started and not finished*, which is exactly what `[~]` means. Leaving it `[ ]` understates it. There is deliberately no separate "ongoing" state; five states is the whole vocabulary.

### Coordination between sessions belongs in the repo, not in messages between agents

When two agent sessions work one repo, a rule, a scope boundary or a handoff goes into a **file** — `docs/STATUS.md` for state, `BACKLOG.md` for ownership — never only into a message from one session to another.

**A directive that lives in one session's context window expires silently.** It does not survive a restart, it cannot be read by a third session that joins later, and it can be delivered to the wrong recipient — peer sessions are not always distinguishable by name, and sending a scope directive to an unknown recipient is worse than sending none.

The repo wins on all three axes: it cannot be misdelivered, it survives restarts, and `STATUS.md` is already the first file every session reads. This is *documentation at the point of use* applied to process rather than to code.

**Established 2026-09-10**, when S2 was told to message S1 about scope and instead wrote the boundary into `STATUS.md` — four indistinguishable `evergreen-*` peers were listed, and none could be identified as S1 with enough confidence to message.

The occasion was `#66` landing tagged `[W2-D10-01]`, a task owned by the other session. That was **not careless**: accepting an ADR that changes behaviour necessarily lands the code for that behaviour, so S1 could not amend ADR-006's exit-code scheme without touching `exitCodeFor`. The two-session rule had assumed a cleaner separation than the work allows. Its cost was a task row that meant nothing — `W2-D10-01` sat `[ ]` while half of it was merged, the state that produces either duplicated work or a silently dropped remainder.

**So: when a session boundary turns out to be wrong, fix it in the file rather than by asking people to be more careful.**

### Notion operational backlog and weekly narrative

**User-confirmed 2026-09-08:** Evergreen Tasks is the primary operational backlog in Notion; repo `BACKLOG.md` and `docs/STATUS.md` remain the source for synchronization. The separate [Task Tracker](https://www.notion.so/3d2e2030b2ce81c48b03ebbe4f27e4b5) is a readable narrative snapshot, refreshed **one week at a time at that week's closing review**, not on every commit. Preserve the existing database sync at session/merge boundaries.

Each weekly snapshot states its refresh date, outcomes, task IDs, formal owners, statuses and remaining work. Validate presence as well as owner/status against the repo and Evergreen Tasks. Distinguish finished work from pending publication, and retain In progress for recurring work. Future-week drafts are labeled as unreviewed; readers use Evergreen Tasks for current operational state. A completed personal allocation does not imply all shared week-gate tasks are Done.

### Identifiers in documentation — precision goes where it is acted on

**The rule covers quoting someone else's identifier, not just producing your own.**

*2026-09-17.* A task ID `W4-D29` was named in a report, relayed into a prompt, and
assigned as work. **It does not exist** — zero occurrences in `BACKLOG.md`. The real
rows are `W4-D25-01/-02/-03`, and they belong to a different owner.

Three parties handled that string and none looked it up. The only reason no work was
wasted is that it was checked before being absorbed, at the fourth handling.

A relayed identifier feels verified precisely *because* someone else wrote it — it
arrives with the authority of having already been used. **It has not been checked; it
has been repeated.** `grep -c` costs nothing and is the whole of the fix.

The same session produced the same shape twice more: a stale `W4-D27-00` status was
reported as open, relayed, and acted on — 2FA was enabled again on something already
done since Sep 12 — and a `## ✅ closed` section still said *"Currently disabled"*.
**Look up the row, not the sentence about the row.**


**An identifier a reader must act on has to be complete and exact. An identifier a reader must avoid can be abbreviated.**

These are opposite requirements and the instinct gets them backwards, because the dangerous ones *feel* like they deserve the full string. A warning marker reads fine as `CCYGO7KQ…LTTQ`. Anything someone will type, paste, or compare against must be the whole thing, cross-checked against [`SETUP.md`](SETUP.md), which is the source of truth for contract IDs and public keys.

*(Found 2026-09-05: `ONBOARDING.md` gave the two contracts you must never touch in full, and the one you are required to verify against truncated **and** mistyped. Precision distributed exactly backwards.)*

### Querying the Notion mirror — one silent trap

**`SELECT ID` returns Notion page UUIDs, not task IDs.** The Tasks database has a property literally named `ID`, which collides with Notion's own page identifier. The query does not error — it returns a plausible-looking column of wrong values.

Always select `"userDefined:ID"`:

```sql
SELECT "userDefined:ID" AS task_id, Status FROM "collection://..." WHERE Week = 'W1'
```

This belongs in the same family as the testnet guard that refused everything and the local gate that was weaker than CI: **a check that fails in the safe-looking direction, silently.** Anyone writing an ad-hoc query later will hit it.

### Quoting a retired task ID — strike it through

`pnpm check:task-ids` fails on any doc reference to a task ID not registered in `BACKLOG.md`. But documenting a rename *necessarily* names the old ID, and that is not a dangling reference — it is the record of why the new one exists.

Mark it with strikethrough:

```markdown
| ~~W3-D18-02~~ | superseded by `W3-D16-02` when Week 3 was restructured |
```

Semantically exact — "this no longer applies" — and it reads correctly to a human as well as to the checker.

**Only for an ID that genuinely no longer exists.** Reaching for the marker to silence the check on a *live* reference converts a caught bug into a hidden one, which is worse than never having the check.

### A row in the mirror with no task in the repo — the provenance test

Two different things look identical in Notion, and they need opposite handling. **Ask one question: did this ID ever exist in `BACKLOG.md`?** `git log --all -S'<ID>' -- BACKLOG.md` answers it.

| Answer | Treatment |
|---|---|
| **Yes** — it existed and was retired | **Mark it `Dropped`, do not delete.** Put the retirement reason in the row. |
| **No** — it never existed | **Delete it.** There is no history to preserve, and preserving a fiction is not preserving a record. |

**Why a retired ID stays visible in the mirror.** The whole point of *retire, never repurpose* is that a retired ID remains legible so nobody reuses it. If the repo shows a retired ID and the mirror shows nothing, the mirror has stopped mirroring — and it has removed the very warning the retire rule exists to display. A `Dropped` row carrying its reason is the mirror doing its job.

*(Applied 2026-09-10 to three rows. ~~W3-D18-02~~ had six commits behind it and was kept as `Dropped`; ~~W3-D21-03~~ and ~~W4-D23-04~~ had zero commits ever and are build errors, marked for deletion. Deleting is the correct treatment for those two and the Notion integration exposes no delete capability, so they were retitled unmistakably and left for a human — a partial execution reported as partial, not quietly recorded as done.)*

### Retire a task ID, never repurpose it

`BACKLOG.md` says IDs are frozen. The rule has a second half that only became visible when it was broken: **an ID must keep meaning the same work, not merely keep existing.**

*Learned 2026-09-08.* Restructuring Week 3 into two stages moved the day contents but reused the IDs. `W3-D16-01` stopped meaning "policy-signer e2e" and started meaning "bump execution"; `W3-D19-03` stopped meaning "alert emails" and started meaning the spike. Every ID still resolved, so nothing looked broken — while `EVIDENCE.md` quietly filed six rows against the wrong tasks, and `POLICY-SIGNER.md` claimed a due date belonging to the slack-ledger reconciliation.

**This is worse than a dangling reference, because a dangling ID is detectable and a repurposed one is not.** A script can check that every referenced ID exists; nothing cheap can check that it still means what the referrer thought.

So: when restructuring, **retire the old IDs and mint new ones.** A gap in the sequence costs nothing. A silently re-pointed ID costs an evidence row filed against the wrong proof, discovered when someone goes looking for it.

## 🔍 The report named no subject — the pattern, and its members

**Every one of these was a report that stated a result without saying what the result was *about*.** Not a wrong answer — an answer to an unasked question, read as the answer to the one being asked. They looked like unrelated incidents until enough of them accumulated to show the shape; they are one failure, and it recurs because the safe-looking direction is silence or a stale green.

| The report | What it named | What was actually being asked | How it was caught |
|---|---|---|---|
| A testnet guard passing | *that it ran* | whether it permits valid input | exercising it in the permitting direction |
| `pnpm check` green | four gates | whether it matches CI's six | comparing the script against the workflow |
| `pnpm check && echo PASS` printing nothing | *nothing at all* | pass or fail | CI failing on a branch that "passed" |
| Cloudflare: *"Initializing build environment"* | a build from minutes ago | whether the deploy is live | loading the URL |
| `gh pr view` reporting CI SUCCESS | **a commit no longer being merged** | whether *this head* is green | comparing the check's SHA to the PR head |
| Six green gates + `npm publish --dry-run` | **the monorepo, where `workspace:*` resolves** | whether a stranger can install it | packing and installing into an empty directory |

**The last one is the most expensive of the six, because unlike the others it would have shipped.** `npx @evergreen-stellar/cli` would have returned a hard 404 for every user: `cli` and `core` both declare `@evergreen-stellar/shared-types` as a runtime dependency, and only two packages were going to be published. Every local gate was green throughout, and `--dry-run` would not have caught it either — **it packs without resolving.** Scheduled discovery was `W4-D27-02` on Sep 29, day 27 of 30, with the fix requiring a third package published into a scope we could not publish to yet. Actual discovery: day 7, by running the install.

> **A check that never leaves the monorepo cannot answer a question about strangers.** `workspace:*` is the specific trap — it resolves silently in development and is rewritten to a version that may not exist at publish time — but the shape is general. Anything verified only from inside the thing being verified is measuring the inside.

That is also the argument for moving verification earlier, settled empirically rather than by preference: the same check, thirteen days sooner, paid for itself within hours of being written.

**The rule, in the general form: a result is only about the subject it names.** Before acting on any green, bind it to the thing you are about to act on — the commit, the URL, the input, the gate list. If the report does not name its subject, it is not evidence about yours.

Concretely, before every merge:

```bash
gh pr view <n> --json state,headRefOid,statusCheckRollup
```

**Check `state` is `OPEN` and that the check you are trusting ran on `headRefOid`.** Not `mergeable` — `mergeable` was `MERGEABLE` throughout the Sep 9 incident, while `state` was `CLOSED`, the head was two commits stale, and the green belonged to someone else's commit. A closed PR receives no `synchronize` webhook, so pushes to it run no CI at all and the last green stands unchallenged.

*(The narrower rule this replaces — "re-check state after any merge that deletes a branch" — described only the path that happened to bite us. Any code path can serve a result about the wrong subject.)*

### The reported state and the actual state diverge — check the actual one

Four instances this sprint, same shape every time: **something reported a state, the real state differed, and only the real state was checkable.** Naming it as a pattern rather than collecting anecdotes, because the fifth one will look novel until you have the list.

| What reported | What was true | How it was caught |
|---|---|---|
| A testnet guard passing | It refused *everything* | Exercising it in the permitting direction |
| `pnpm check` green | Weaker than CI — missing `format:check` | Comparing the script against the workflow |
| `.prettierignore` valid, suite green | Conflict markers made it match nothing | A human reading the file |
| Cloudflare: *"Initializing build environment"* | Deploy had succeeded 94 seconds earlier | Loading the URL |
| `pnpm check && echo PASS` printing nothing | The check had **failed**; `&&` short-circuited | CI failing on a branch that "passed" locally |

> **Never verify with `cmd && echo PASS`.** On failure it prints *nothing*, and absence reads as noise rather than as failure. Use `cmd; echo "exit=$?"` — a number is always printed, so there is no silent case. *(This exact idiom hid a real failure on 2026-09-08; CI caught what the local run had reported as nothing at all.)*

**The rule: check the thing, not the report about the thing.** Load the URL, run the command, exercise the guard in both directions, compare the script to the workflow it claims to mirror.

The reports are not lying — they are measuring something adjacent and presenting it as the answer. A green suite means *the checks that ran* passed; it says nothing about checks that silently stopped applying. **If a fourth-shaped thing appears, add it to this table** rather than treating it as a fresh surprise.

### Run it, don't only read it — execution surfaces intent

Reading a diff tells you what code does. **Running it puts you in the file, next to the comments, in contact with what the author was trying to do.**

*Learned 2026-09-08.* Static reading of the persistence spike said `claim()` can never take over a `pending` row — true, and reported as a deadlock bug. Executing it against a local Postgres meant opening `persistence-store.mjs`, where `prepare()`'s own comment reads *"Pending work never expires into a new send."* The non-reclaimability was **deliberate and fail-closed**, working exactly as designed against its own goal.

That changed the finding in three ways, and every one of them mattered:

- **Accuracy** — "you missed line 116" would have been wrong.
- **The fix changes kind** — a lease timer, the obvious repair for a deadlock, would reintroduce precisely the double-send the design prevents. Only `getTransaction()` reconciliation respects the intent.
- **How it lands on a person** — it would have made a teammate defend a decision they made on purpose.

Same family as the testnet guard that refused everything and the local gate weaker than CI: **the mistake is trusting a reading over an observation.** Run the thing before you report on it, especially when the report will redirect someone's work.

### A green result about the wrong subject — the variant staleness does not cover

The recorded stale-CI rule says: *before merging, verify the green result is for the head SHA you are about to merge.* That covers a **stale** result for the **right** subject. There is a second shape it does not cover.

**A result can be fresh, green, and about someone else's work entirely.**

*Observed 2026-09-10.* A PR number was **inferred** from the previous one rather than read from the create output. The real PR was `#74`; `#73` belonged to the other session. The CI wait then polled `#73` and reported two green checks — genuinely green, genuinely current, and about a completely different branch. Caught by verifying the head SHA against the intended PR.

That is the more dangerous version, because staleness at least has a timestamp to interrogate. A fresh green result offers nothing to be suspicious of.

**The rule:** a PR number, run ID, job URL or commit SHA is an identifier **you act on**, so it must be **read from the tool that created it, never inferred from a neighbour.** Identifier precision goes where it is acted on — and "which PR am I merging" is as load-bearing as any contract address.

Its cousin, same day: `$?` read after a pipe reports the **last** command's status. `node check.mjs | tail -2` followed by `$?` gives `tail`'s exit code, not the checker's — a result about a subject you did not name. A real bug was nearly diagnosed from that broken instrument, and it would have been wrong in the reassuring direction.

### A disclaimer containing a closing keyword still closes the issue

*2026-09-16.* #181's body ended with, in as many words:

> This PR does not close #140/#141 automatically

**Merging it closed #140 two seconds later.** GitHub's linked-issue parser matches
`close #140` and does not read the negation in front of it. The sentence written
specifically to promise no auto-close is what performed the auto-close.

Only #140 went. The `/#141` spelling put no keyword next to the second number, so
the parser saw one pair, not two — which is also why this is easy to miss: the
outcome is *half* of what the sentence describes, and looks like an unrelated
inconsistency rather than a parser behaviour.

**The rule:** never put `close`/`closes`/`fixes`/`resolves` adjacent to an issue
reference unless you mean it, negation included. To mention an issue you are *not*
closing, write the bare reference — `see #140`, `acceptance requested in #140` — and
keep the verb out of the sentence.

**The shape, not the instance:** a statement *about* a token contains the token, and
the machine reading it does not read the disclaimer. It happened twice in one
session — the other was `check-cadence-quotes.mjs` rejecting a parenthetical that
explained which figure had been removed by naming the figure. Assume anything that
scans for a pattern will match your explanation of the pattern.

### A watcher must check its own continuity at the cadence it claims to run at

*2026-09-21.* The guinea-pig B watcher polled every ten minutes and checked its own
log for gaps **only at each slot's T−7** — roughly every six hours. It therefore had a
**six-hour blind spot by construction**, whatever else it verified.

It used that blind spot. Between 10:49 and 15:17 the machine slept and the poll loop
lost **268 minutes**, covering B's expiry and the capture slot. The next continuity
check was scheduled for 11:53 and did not run, because the wake timer was suspended
with everything else. The gap was discovered at 16:34, four hours after the event.

**The rule was already written down.** The day before: *"treat a gap as a finding, not
as missing data — it tells you the watcher was not watching."* The rule existed, the
instrument existed and was correct, and nothing read it often enough to matter.

**`caffeinate` is the worked example of why this must be an outcome check.** It held
all three assertions — `PreventSystemSleep`, `PreventUserIdleSystemSleep`,
`PreventUserIdleDisplaySleep` — continuously, on one pid, across 29 hours that
included several sleeps. `pmset -g assertions` reported it holding the entire time.
`pmset -g log` showed `Entering Sleep state due to 'Maintenance Sleep' ... Using Batt`.
**The mechanism was working and the outcome was not**, which is the exact distinction
commissioning exists to draw — and I verified the mechanism.

**The rule:** a watcher's continuity check runs at its own poll cadence, not at the
cadence of whatever consumes it. A ten-minute loop that self-checks every six hours is
a six-hour loop wearing a ten-minute label.

### Redundancy earns its keep on failures nobody predicted

The second capture machine was added for **availability** — so a missed slot would not
lose unrepeatable evidence. It has since covered two failures, and **neither was the
one it was added for**:

| | what happened | what actually saved it |
|---|---|---|
| the crossing | the primary watcher read `EXIT_BELOW_THRESHOLD=1` as a broken scan and went blind **at the moment B crossed** | the second machine captured at ledger 4,776,408, one ledger below the threshold |
| the expiry | the primary machine slept through the event and its wake timer slept with it | the second machine captured at 12:00:35, 12:02:24 and 12:04:29 |

An exit-code misreading and a sleeping host. Neither was foreseen, and no amount of
thinking about *availability* would have produced either as a scenario.

**That is the argument for redundancy that does not depend on enumerating failure
modes.** The value was not in predicting what would go wrong; it was in there being a
second observer whose failure was uncorrelated with the first's. Two processes on one
machine are one machine — which is what the expiry proved, since both watchers on the
primary host gapped together while the second machine was unaffected.

### A non-zero exit from our own tooling is usually a finding, not a failure

*2026-09-20, 12:00:29Z.* The watcher polling guinea-pig B logged three consecutive
`SCAN_FAIL`s starting seconds after B crossed its alert threshold. **The chain was
fine the entire time.** `EXIT_BELOW_THRESHOLD = 1`, and the poll loop was written as

```bash
if node packages/cli/dist/bin.js scan "$B" --json > last.json; then   # wrong
```

so any non-zero exit read as a broken scan. **The instrument went blind precisely
because the event it existed to detect had occurred.** The CLI was reporting the
crossing, in the exit code, and the loop had been written to hear that as breakage.

Cost: the crossing time had to be reconstructed from ledger arithmetic instead of
observed, and the capture ran six minutes late. The evidence survived only because a
second operator was capturing independently — his bundle caught B at `remaining`
17,279, one ledger below the threshold, while this watcher was reporting failure.

**Our exit codes are a vocabulary, not a health bit:**

| | |
|---|---|
| `0` | ok |
| `1` | **below threshold** — the thing the tool exists to tell you |
| `2` | a real error, or verification failed / does not qualify |
| `3` | incomplete — a key was asked for and not found |

`1` and `3` are the tool having something to say. Only `2` and above are breakage.

**The discriminator is output shape, not the exit code.** During the diagnosis the
answer was already on disk and unread: `last.json` held 2,768 bytes of valid JSON and
`last.err` was empty. **A finding produces well-formed output; a break does not.** That
is checkable, so it beats remembering which codes mean what:

```bash
node …/bin.js scan "$B" --json > out.json 2>err.txt; rc=$?
if [ "$rc" -eq 0 ] || [ "$rc" -eq 1 ] || [ "$rc" -eq 3 ]; then …
```

**Sweep, same day.** `.github/workflows/engine-cron.yml` had the sibling defect in the
opposite direction — `pnpm engine:run | tee` exiting with `tee`'s status, so a failing
unattended run reported success. Already fixed by `shell: bash`, which GitHub runs with
`-eo pipefail`; the comment there records the first cron run dying invisibly. The
`execFileSync` call sites wrap `git`, `tsc`, `gh` and `esbuild`, where non-zero genuinely
is failure, and are correct as written.

**The pair worth noticing.** The same day, the same area, opposite outcomes. The poll
loop called `node …/bin.js` directly rather than `pnpm cli` — which happens to skip a
rebuild and so protected a runtime fingerprint the whole weekend depended on. That was
**luck, not judgement**; it was not chosen for that reason. The exit-code handling in the
same loop was not lucky. **One accident in each direction, in code written in the same
five minutes** — which is the argument for checking a property rather than trusting that
the person writing it had the property in mind.

### A checker's output shape bounds what it can report

Distinct from *"suspect the instrument when the result surprises you"*, and harder,
because **this result will not surprise you.**

*2026-09-17.* `scripts/check-policy-constants.mjs` held its copy sites in a map keyed
by the owned value:

```js
const copies = { thresholdLedgers: pick(drift, …), secondsPerLedger: pick(ttl, …) };
```

**One copy per value, by construction.** Three copies of the action threshold existed;
it reported one. The checker was not broken — it ran correctly, inside a shape that
could not represent the problem it was written to find. Meanwhile `scan.ts` carried a
comment saying it was pinned by that checker, which had never opened the file.

A map keyed by owner, reporting one entry per owner, **looks exactly like a correct
answer**. There is nothing anomalous to investigate. That is why this needs its own
name: the instrument rule is triggered by surprise, and this failure produces none.

`#154` is this defect having already reached production — `scan` reporting `HEALTHY`
for guinea-pig B while the engine reported `WARNING`, minutes apart, on identical
chain state.

**The membership test, which generalises past this repo:** *can the check's output
shape represent the failure it is looking for?*

- a count that cannot exceed one cannot report duplication
- a boolean cannot report *undetermined* — the reason `sharingStatus` is a string
- **a map keyed by the thing you are deduplicating cannot report duplicates**

It is a different question from *"does this check work"*, and the checks that pass the
first question are exactly the ones that hide the second.

**Audit, 2026-09-17.** Every checker was put to that question. Reported honestly,
because inflating it would make the next audit worthless:

| Checker | Shape | Verdict |
|---|---|---|
| `check-policy-constants` | map keyed by owner | 🔴 **the instance** — now a list |
| `check-crossing-evidence` | `Map` keyed by bundle path | ✅ a memo cache; findings go to an array |
| `check-evidence-hashes` | `Map` keyed by hash → first file | ✅ the hash is the subject; one location suffices to find it |
| `check-cadence-quotes` | array, but `exec` per line | ⚠️ under-**counted** a line holding two figures. Not blind — the line was still named and the build still failed. Fixed to `matchAll`, which `check-task-ids` already used |
| `check-locale-pinning`, `check-conflict-markers` | array, one finding per line | ✅ line-summary by design; the line is the unit of fix |
| the rest | arrays | ✅ |

**One true instance.** The distinction between *blind* and *under-counting* is the
whole point: a blind checker reports success while the defect exists; an
under-counting one fails the build and names the place, and cannot go green until the
last instance is gone.

### A guard that covers one copy looks identical to a guard that covers all of them

`scripts/check-policy-constants.mjs` exists because *"a comment saying 'matches
X' is documented intent, not an enforced link"*. **Its own data structure allowed
exactly one copy per owned value** — a `{ owner: copy }` map — so when a second and
third copy of the action threshold appeared in TypeScript, neither was checked and
the check kept passing.

*Measured 2026-09-17, not assumed:* moving `DEFAULT_CRITICAL_LEDGERS` to 15,000 left
the check **green**. So did moving the CLI's `DEFAULT_THRESHOLD_LEDGERS`. And
`scan.ts` carried the comment *"pinned by scripts/check-policy-constants.mjs"* —
the exact false claim the checker was written to eliminate, in a file the checker
did not read.

The cost is on the record. #154 fixed `scan` reporting `HEALTHY` for guinea-pig B
while the engine reported `WARNING`, minutes apart, on identical chain state: two
thresholds that had to agree, with nothing making them.

**The rule:** a pinning check's coverage is a **list**, never a map keyed by the
owner. The moment its shape assumes one copy, a second copy is invisible rather
than wrong. When adding a constant that restates a policy, add the copy site to the
check in the same commit — and drive the check by moving the new literal, because a
check that has never failed for that site has not been shown to cover it.

### An API that can prove acceptance cannot prove placement

*2026-09-15.* The weekend alert channel had to be shown to work after a message
once landed in spam. The provider returns a receipt — `accepted`, with an id. It
**cannot** say where the message came to rest.

The honest shape, and the one shipped: the receipt keeps
`receivedInInbox: "unverified"`, and a **separate artifact** records the human
confirmation with `location: "inbox"`. Two claims, two sources, neither borrowing
the other's authority.

The tempting shape is a single `deliveredToInbox: true` filled in from the receipt,
because the receipt is right there and the field reads better. It would be a claim
nothing supports — and it is exactly the failure this project exists to avoid,
since the one incident it is meant to rule out is invisible to the API.

**Same discipline as `sharingStatus: "undetermined"`** in the scanner: Soroban
cannot enumerate reverse dependencies, so a single-contract scan says it does not
know rather than reporting `false`. **Absence is not health**, and an unverifiable
field says `unverified` rather than guessing in the reassuring direction.

**The rule:** before a field asserts something, ask which source produced it and
what that source is capable of observing. When the answer is *"not this"*, the
field's value is `unverified` and the real check gets its own artifact. The next
integration will offer the same temptation, and the receipt will always be the
thing already in hand.

### A test that cannot fail is worse than no test

An unfailable test **occupies the slot a real test would sit in, and reports success from it.** No test at all is at least honest about the gap.

**Two this week, both in assertions written to demonstrate a correct behaviour:**

- A lossless-sum test asserted `Number(total) !== 18014398509481986`. The literal itself parses to `…984`, so both sides were the same float and the assertion could never fail. Rewritten to compare **strings**, where the difference is real.
- The guinea-pig B simulation computed its own `remaining < THRESHOLD` instead of calling `needsAction`, so it agreed with itself. It only failed later, and only because the policy moved.

Neither was caught by the suite — a green suite is exactly what an unfailable test produces. **Both were caught by mutation testing or by looking closely at what the assertion actually compares.** So: when an assertion exists to prove a subtle property, break the code on purpose and watch that specific test go red. If it stays green, it was never testing what its name says.

Special suspicion for assertions involving **float literals, `.not.toBe(...)`, and any value the language may coerce before comparing** — those are where an assertion most easily becomes a tautology while reading as a claim.

### A flag that decides *advice* must not widen what text is allowed out

The `safeRunCode` rule is: surface only our own literal strings, never interpolated
text, because an RPC or driver error can carry a URL, a key or a password.

*2026-09-16.* Fixing `run-save-proof.mjs`, the catch gained a second flag —
`missingManifest` — answering a different question: *was anything written before this
failed?* Both flags then fed one expression:

```js
(refused || stateful ? `\n  Reason: ${error.message}` : '')   // ← wrong
```

`refused` now included `missingManifest`, so a **raw Node `ENOENT` message** printed on
the `Reason:` line. The allowlist was still there and still correct; it had simply been
routed around by a flag that was never about disclosure.

Caught by driving the branch, not by reading it — the same commissioning pass that had
just found the original defect.

**The rule:** the predicate gating disclosure is `allowlist.has(error?.message)` and
nothing else. Any other flag — what advice to print, which exit code, how to categorise
— gets its own name and never appears in that condition. Two questions, two predicates,
even when the answers usually coincide.

### Sample at the boundary, or one pass proves nothing

*2026-09-15, #177.* A watcher policy had to be shown to warn at 420 minutes and go
critical at 540. It was verified at **419, 421 and 541** — not at 400 and 600.

That is why a single pass settled it. Convenient points confirm that a threshold is
*roughly* where you think; an off-by-one, a `<` that should be `<=`, or an inclusive
bound read as exclusive all survive them intact and all show up at the boundary. An
independent reproduction of a convenient-point check merely agrees with it; an
independent reproduction of a boundary check **extends** it.

**The rule:** when a number is a threshold, the test inputs are the number itself
and its two neighbours. State which side is inclusive, and assert it.

### A test can defend a bug — say whether it asserts intent or behaviour

An unfailable test asserts nothing. A test that **faithfully encodes current behaviour** is worse in one specific way: it turns a defect into a requirement, so every future change that fixes it arrives as a regression.

*Observed 2026-09-10.* Five tests asserted `isShared: false` and `blastRadius: 1` for a code entry seen from a single contract. That is unknowable by construction — the chain does not index reverse dependencies from one contract query — so the suite was not silent about the defect. **It was defending it.** 318 green tests, and the green was the problem.

**The habit, since there is no tool for this:** when a test is updated to match a change, state in the diff whether it was asserting *intent* or asserting *behaviour*. A test written from the observed output is a description, not a claim, and should never be cited as evidence that behaviour is correct.

Its tell is the shape of the update: if fixing a bug required changing a test's expected value, ask why the old value was there. Sometimes the answer is "the behaviour changed on purpose" — the `<` to `<=` threshold move, where the test was corrected and said so. Sometimes it is "nobody had asked whether that value was right."

### The published artifact is its own security surface

Source rules do not cover it. The repo forbids secrets in source and the config loader refuses a seed anywhere in a config file — but **a bundle is a new artifact class: a tarball strangers download**, and a bundler ships whatever the import graph reaches. A fixture read at module scope, a constant added while debugging, a helper pulled in through a barrel export.

*First inspection, 2026-09-10, was not clean.* It found our own testnet account hardcoded as the `--cost` simulation source. Not a secret — but it put our account in every user's traffic and would have broken `--cost` for everyone the day that account went away. Removed entirely: simulation turns out not to need a real account at all, so the artifact carries no identity now.

`scripts/check-bundle-secrets.mjs` runs in `pnpm check` and **fails closed** — an artifact that cannot be built for inspection is not assumed clean.

**Commissioning it produced a lesson of its own.** The first two mutations — planting a public key, planting a seed — both *passed*, and the gate looked broken. It was not: esbuild **tree-shakes**, the planted constants were unused, and they never reached the bundle. The instrument was wrong again.

Two things follow. **Dead code cannot leak**, which is a real and useful property of bundling. And **a bundle gate must be commissioned with live code** — plant the secret somewhere reachable, or the test proves nothing. Re-run that way, both mutations fired.

### Cross-package tests read `dist`, not `src`

`packages/cli/test/*` imports `@evergreen-stellar/core`, which resolves through `package.json` `main` to **`dist/`**. So a change to `core/src` is invisible to CLI tests until a build runs.

*Demonstrated 2026-09-10:* `coverageIssues` was mutated to return `[]` — a change that should break three tests — and `vitest run` reported **9 passed**. Rebuilt, the same mutation failed three tests correctly.

`pnpm check` was always safe, because `typecheck` runs `tsc --build --force` ahead of the tests. **The inner loop was not**: `pnpm test` and a bare `vitest run` could both pass against stale `core`. `test` now builds first.

The sharper version of the hazard is that it corrupts *mutation testing across the package boundary*: a mutation that does not reach `dist` reads as "no test covers this", which is the reassuring answer and the wrong one.

### A reproduction is not evidence until fixing the bug makes it stop reproducing

The rule above covers a **negative** result — "not caught", which is usually the
instrument. This is its third shape, and it is the dangerous one: **a positive
result that confirms a real defect for the wrong reason.**

2026-09-23, `#194`. core returned zero entries in a browser because it validated
ledger keys with Node's global `Buffer`. The reproduction deleted `globalThis.Buffer`
and called `scanContract(A, reader)` — and got zero entries, and was reported as
*"reproduced #194 exactly in Node."*

The real signature is `scanContract(reader, { id }, dataKeys)` — **reader first**.
The call was malformed, so it returned zero entries *regardless of `Buffer`*. The
bug was real, the diagnosis was right, the fix was correct, **and the evidence was
worthless.**

That is worse than being wrong, because **nothing prompts you to check a result
that agrees with what you already believe.** A failing test that fails for the
reason you expected feels like confirmation; it is only confirmation if the
expectation is what produced it.

**What caught it was commissioning the fix afterwards.** Mutating the fix back out
forced the test to be re-run against a tree where only `Buffer` differed — and the
call signature had to be right for that comparison to mean anything.

So the practical form, and it costs one extra run:

> **Confirming the symptom is half. The other half is watching the symptom
> disappear for the reason you claim.** A reproduction you have never seen stop
> reproducing is a coincidence you have not ruled out.

Two doors down, same session: a mutation disproved a claim written in a test's own
comment — that its strictness cases would catch a lenient base64 check. They do
not; a second guard refuses those inputs. **The comment was corrected rather than
left.** A comment a mutation has disproved is a false statement sitting next to
true code, and it will be believed, because it is adjacent to something that works.

### A "not caught" result is a hypothesis about the instrument

**Every negative mutation result this project has produced has been an instrument failure. Five for five.**

| What was mutated | Why it reported "not caught" |
|---|---|
| `check-policy-constants` renames | unescaped parens in the `perl` regex — the mutation never applied |
| bundle-gate secret plants ×2 | esbuild tree-shook the unused constants — they never reached the bundle |
| `coverageIssues` → `[]` | CLI tests resolved `core` to a stale `dist` |

Zero real coverage gaps. That inverts the default reading.

**So: when a mutation is not caught, suspect the mutation before suspecting the tests.** Confirm the change actually reached the code under test — grep the mutated file, check the build, check the resolution path — and only then conclude that nothing covers it.

The asymmetry is what makes this safe to adopt: **a "caught" result is still trustworthy**, because something genuinely failed. Only negatives are suspect. So an audit after discovering a broken instrument only has to re-check the negatives, which is a much smaller job than redoing the work.

*(Audited 2026-09-10 after the stale-`dist` discovery: every `packages/core/test/*` file imports `../src/`, so all in-package mutation results — including the `W2-D13-01` config-loader guards — stand unchanged. Only the four CLI tests that import `@evergreen-stellar/core` were affected, and they have since been re-commissioned.)*

### A rule with a judgement clause has a hole shaped like the judgement

**When a rule has failed more than twice, check whether it contains a judgement.
If it does, remove the judgement or build the tool.**

*Five instances, same rule, escalating fixes.* Backticks in a shell-quoted GitHub
comment body get command-substituted, so a filename vanishes from the sentence
naming it. After the second, the rule became *"use `--body-file` for anything with
backticks."* The fifth happened anyway — on a message classified as **short**,
where nobody looked for backticks.

The failure landed exactly at the judgement, which is where every conditional rule
fails: **the moment you decide it does not apply is the moment you stop looking.**

The same hole is in *"never tidy the output of a step whose failure you need to
see"* — it requires judging which steps you depend on. That one has four
instances and will get a fifth for the same reason.

Three levels of fix, and only the third is durable:

| | Depends on | Survives |
|---|---|---|
| a note | remembering | nothing |
| a rule with a condition | remembering **and** judging | the easy cases |
| a tool with no other path | nothing | everything |

For this one the tool is a shell function:

```bash
ghcomment() { gh issue comment "$1" --body-file "$2"; }
```

There is then no inline path to take. That is the same move as `--body-file`
removing the class, taken one step further — **a fix that depends on you, versus
one that does not.**

### Would this still be true on a machine that is not this one?

Three members in one week, each **invisible on the machine that produced it, by
definition**:

| | Symptom elsewhere |
|---|---|
| locale rendering | `120,909` becomes `120.909`, or `1 682 586` with a U+202F separator |
| timezone parsing | git's `+07:00` read as UTC — a four-hour error |
| absolute paths | a config that only starts on the machine that wrote it |

The third is the one that nearly cost something: a weekend watcher config with
`stateRoot: /home/<user>/…`, where the whole point of naming a fallback operator
is that **somebody else** runs it. The provision would have failed at the moment
it was needed.

None of these can be caught by testing on the machine that wrote them — that is
the definition of the class, not a gap in diligence. **The membership test is the
question itself: would this still be true on a machine that is not this one?**

Locale is now gated by `check-locale-pinning.mjs`. Timestamps are all
`toISOString`. Paths are still a judgement, and the rule is: **anything an
operator other than the author might run takes a repo-relative path.**

### Before injecting a fault, ask what else your injection changes

**Three times now, the thing done to create a test condition created a different
condition, and the different one fired first.**

| What was injected | What else it changed | What fired instead |
|---|---|---|
| a scenario's upstream failure | — | shadowed the two barriers below it |
| a hand-built ledger key | the key was invalid | a different clause threw before the guard |
| an error thrown from a source file | the working tree became dirty | the dirty-tree guard, before the error |

Same shape every time, and the third one bit a test **of a fix** rather than of
the code — the most expensive place for it, because a shadowed result reads as
"the fix works".

So it is a pre-check, not a diagnosis. **Before injecting, ask what else the
injection method changes, then ask what guards read that.** Deleting a tracked
file dirties the tree. Editing one dirties the tree. Hand-building an input
produces an invalid input. Raising a threshold moves two comparisons, not one.

Answering that before the run costs a sentence. Answering it afterwards means
re-reading a result you already believed.

### Never tidy the output of a step whose failure you need to see

**Four instances, and the motive was tidiness every single time:**

| Construct | What it hid |
|---|---|
| `>/dev/null` on `gh pr merge` | a merge that did not happen, reported as done |
| `grep` over an empty directory | a secret scan that scanned nothing, reported clean |
| `$?` after a pipe | `head`'s exit status, not the command's — reported 0 for an exit 3 |
| `tail -3` on merge output | three unmerged files, leading to a `commit` that could not run |

Each of these is **fine in a step you are not depending on** and a hazard in a
step you are. Pipes replace exit codes, redirects discard errors, `head` and
`tail` truncate, and an empty glob matches nothing silently.

So the rule is a condition rather than a prohibition: **if you are about to act on
whether a step succeeded, do not put anything between it and you.** Redirect to a
file and read the file; capture `PIPESTATUS`; count what you globbed before
trusting that it matched nothing.

The related positive habit: **prove the instrument on a known-positive first.**
A secret scanner gets a planted decoy before its clean result is believed — a
clean result and a broken instrument are identical output.

### A surviving mutant is not automatically a gap

The rule above says a negative usually means the mutation never landed. There is
a **second** reason a mutation can survive with the instrument working perfectly:
**the property is defended more than once.**

*Found 2026-09-14 in `scripts/run-journal.mjs`.* Two mutations survived
individually — `open(…, 'wx')` → `'w'`, and adding `recursive: true` to the run
directory's `mkdir`. Neither is a missing test. Each is **separately sufficient**
to reject a reused run ID: one fails on the directory, the other on the file.
Removing **both together** fails the test. That is defence in depth, and mutation
testing reports it identically to missing coverage.

**The discriminating test: remove every redundant layer at once.**

- something fails → the property was covered, and the individual survivors were
  redundancy
- nothing fails → a real gap

Both outcomes have happened on the same day. In `packages/engine/src/alerts.ts`,
dropping `safeRunCode` from the diagnostic loop survived, and removing *both*
sanitizing calls did fail — redundant, as expected. But the loop's call turned out
to be load-bearing for something else entirely: **deduplication**. Two different
unknown codes both collapse to `RUN_FAILED`, so keying on the raw code emits two
alerts carrying one event id, and the journal's exclusive create then turns the
second into a `STORAGE_FAILED`. Redundant for one purpose, load-bearing for
another, in the same expression.

So the question is not *"is this line covered"* but *"what does this line do that
nothing else does"* — and the answer can be narrower than the line looks.

**This is the counterweight to the layered-defence rule, and the two are easy to
confuse.** That one says inner layers are untested by construction when an outer
layer rejects first. This one says a layer that *looks* untested may be a
redundant one. Both are true, and the all-layers-removed check tells them apart.

### Two numbers that must stand in a relation — enumerate them, then enforce them

Three defects of this exact class landed in one week, and each looked like a
different bug until they were put side by side:

| Pair | Failure when unenforced | Now enforced by |
|---|---|---|
| workflow `timeout-minutes` vs cron interval | a run outlives its own schedule and laps itself | `check-workflow-timeouts.mjs` |
| action threshold vs measured scheduler gap | the engine cannot fire enough times before expiry | `MIN_SAFE_ACTION_WINDOW_LEDGERS` |
| watcher `criticalMinutes` vs worst observed gap | alarms on observed-normal behaviour; fatigue hides the real outage | `assessScheduler` policy validation |

The shape is always the same: **two numbers whose correctness is a relation
between them, each individually plausible, with nothing checking the relation.**
Reviewing either number alone finds nothing, because neither is wrong.

They are also the defects most likely to be discovered by an operator rather than
a test, because a plausible wrong value behaves *almost* correctly — the watcher
with `criticalMinutes: 30` does alert, constantly, which reads as a noisy tool
rather than a misconfiguration.

**When one of these is found, list the others rather than fixing the one.** The
ones still unenforced, recorded so the list is a worklist and not a boast:

- **fee cap vs observed fee** — a cap below what a real extend has cost refuses
  every write, and looks like an RPC problem
- **action threshold vs `max_entry_ttl`** — a threshold above the ceiling can
  never be satisfied by any extension
- **artifact retention vs the dates evidence must outlive** — 90-day retention
  against an Oct 2 submission is fine; against a claim that must survive review
  afterwards it is not, and the artifact expires silently

A useful test for whether a pair belongs here: **can you write down a value for
each that is individually defensible and jointly wrong?** If yes, nothing but an
explicit check will catch it.

**And a second test, for pairs that go wrong without anyone touching them: can
this pair drift apart while both values stay exactly as written?** If one side is
a measurement of a moving world, it can.

*This happened within nine hours.* `WORST_OBSERVED_SCHEDULER_GAP_MINUTES` was
recorded as 331 on 2026-09-14 and enforced as the watcher's floor. Re-measuring
on 2026-09-15 gave **369** — nobody edited anything, and the relation was already
wrong. A running maximum over a growing sample only ever goes up.

The repair is not a faster update cadence. **It is to split the measurement from
the policy:**

| | Changes when | Must be |
|---|---|---|
| measurement | anyone measures | *true* |
| floor | someone decides | *cleared*, with headroom |

`WORST_OBSERVED_SCHEDULER_GAP_MINUTES` is now free to rise; `SCHEDULER_GAP_FLOOR_MINUTES`
is 480 with a stated review trigger at 80% of the floor rather than automatic
tracking. A floor derived from the measurement thrashes: every fresh measurement
retroactively invalidates fixtures and fails configurations that were correct the
day before, which turns a routine measurement into a breaking change.

**Symptom to watch for:** a constant whose doc comment contains both a date and a
rule. That is one constant doing two jobs.

### A file that is evidence AND configuration has two opposite update rules

*Found 2026-09-15, five days before it would have mattered.*

`docs/evidence/2026-09-15-readiness/watch.json` looked like a record: absolute
timestamps, a machine-specific path, inside a checksummed bundle. **Decoding its
window is what disproved that** — it runs 2026-09-18T00:00Z to 2026-09-21T18:00Z,
covering guinea-pig B's crossing *and* its expiry. It was the live weekend watcher
configuration, shipped with `warnMinutes: 30` against a measured median several
times larger — so it would have warned on every gap the scheduler has ever
produced.

The hazard is that **each role hides the other**. A reviewer sees a checksummed
record and does not think to check whether it is correct; an operator sees a
config and does not think it is frozen. Evidence must never change; configuration
must be right. Both cannot be satisfied by the same file.

**The resolution is not to edit the record.** Rewriting a record to match a later
decision is the one thing this repo does not do. Instead: enforce the correct
value in code so the stale config fails loudly, and hand the operator a
replacement. The record stays true about what was configured; the code makes that
configuration unrunnable.

**Shape, not content, is the wrong classifier.** Absolute timestamps and
machine-specific paths say "record" and are compatible with "live config". The
discriminating question is: **does anything read this file, or is any date in it
still in the future?**

#### The inventory, as of 2026-09-15

| Evidence file | Read by | Defended? |
|---|---|---|
| `2026-09-14-bc-control-verification/data-keys-{B,C}.json` | `crossing-capture-common.mjs` — the Sep 20/25 capture | **yes** — owner derived from `PROTECTED_ENTRIES`, shape validated, hash pinned in the capture manifest |
| `2026-09-12-manual-extend-proof/simulation/06-getLedgerEntries-response.json` | `rpc-preload.mjs`, used by the rehearsal harness | offline fixture; rehearsal only |
| `2026-09-15-readiness/watch.json` | the operator, for the weekend window | **was not** — fixed by flooring `warnMinutes` in code |

Re-run the sweep when adding anything under `docs/evidence/`: grep the code for
references into that tree, then check whether any date inside is still ahead.

### A fixture calibrated to a literal stops testing when the literal moves

The quietest member of the family. Not a test that cannot fail — **a test that
silently stopped testing anything while still passing.** Nothing reports it: the
suite stays green and the count does not move.

*2026-09-15:* flooring `warnMinutes` at 369 made several watcher fixtures vacuous.
They positioned a job "40 minutes old against a warn of 30" — once warn moved, the
same job was healthy and the lateness assertion proved nothing.

**The repair is to express the fixture relative to the policy**, not to a literal:
`const late = (policy.warnMinutes + 10) * 60000`. It then keeps testing lateness
whichever side the floor moves to.

**Assertions are the opposite and should stay literal.** `expect(WORST_OBSERVED).toBe(369)`
*should* fail when the number moves — that is the point. The distinction:

- **calibration** — the literal positions a scenario. Moving it changes what is tested, silently
- **assertion** — the literal is the claim. Moving it fails loudly

Roughly a dozen calibration sites remain, mostly `const THRESHOLD = 17_280` in CLI
tests. Those are lower risk than the watcher case: if the default moved they would
still test the same behaviour, just no longer *at the production default*. Not yet
individually triaged — recorded here so the list is a worklist rather than a claim.

### Superseding a document means editing the superseded one

**Twice in two days**, a new operational document referenced an older one and the
older one gained no link back:

| | |
|---|---|
| 2026-09-14 | `W3-D18-03-CAPTURE.md` → `SEP-20-PREFLIGHT.md`, no return link |
| 2026-09-15 | `W3-SEP18-READINESS.md` → `SEP-20-PREFLIGHT.md`, no return link |

It is structural rather than careless. **The new page's author knows the old page
exists. The old page's author did not know the new one would be written.** So the
link that gets written is the one nobody needs, and the link that matters is the
one requiring someone to go back and edit a document they are not working in.

The operator then opens the *older* page — because it is the one that has been
referenced longest — and it describes a tool that is no longer primary. On
2026-09-15 that page still told a reader to commit probe text output, while the
gate had since gained a verified-bundle path that a rehearsal cannot satisfy.

**Enforced by `scripts/check-reciprocal-links.mjs`.** The rule was written as
prose on 2026-09-14 and a fresh instance appeared the next day, in the same
document, from a different author — which is this file's most-repeated finding
arriving again. Prose did not hold, so a check does it.

Scope is narrow on purpose: only pages someone opens *on a day*. Demanding
reciprocity everywhere would require `SETUP.md` to link back to every narrative
page citing it, and `STATUS.md` references everything by design.

The membership test, when deciding whether a page belongs on that list: **if
someone follows this page literally today, do they use the current tool?**

### A summary table restating the sections below it is a second source of truth

The reciprocal-link rule above is about two documents. **This is the same failure
inside one.**

*2026-09-15.* A §5b was added to `SEP-20-PREFLIGHT.md` naming Rakha as the Sunday
watcher, while the handoff table three screens above still named Fatih. The page
contradicted itself about who was watching, on the one document where that question
has a date attached. Caught in review.

*2026-09-16.* The full extent: **four documents held the schedule and gave three
answers.** Two operational pages — the ones an operator opens on the day — still
read *"Fatih remains primary operator; Rakha is the backup"*, the inverse of what
had been agreed, because Rakha's confirmation arrived after they were written.

The mechanism is not carelessness. **Whoever edits a section has no reason to scroll
up**, and no reason at all to open a different file. The table is nonetheless what
people read — it is above the fold and it is a grid — so the stale copy is the one
that gets acted on.

Rewriting the tables would have fixed four instances and nothing else. So: **the
schedule now has one source, [`ops/crossing-schedule.json`](../ops/crossing-schedule.json),
every table is generated from it by `scripts/render-crossing-schedule.mjs`, and
`pnpm check:schedule` fails the build if a rendered block drifts.** Prose sections
explain *why* and are forbidden from restating who or when.

**The membership test:** if a fact appears in a table in more than one place, and
being wrong about it costs something on a specific date, it needs one source and a
check — not a rule asking people to remember to update both.

### Before arming a gate, prove its demand can be satisfied by the allowed path

**A gate whose demand is unsatisfiable is not strict. It is broken — and it
breaks on exactly the day it was built for.**

*`check-crossing-evidence.mjs`, armed 2026-09-12, found 2026-09-14, two days before
it would have fired.* It fails `pnpm check` from guinea-pig B's alert threshold
onward until a committed file contains `REFUSED BY WRITE GUARD` for B. Three
things had to hold for that to be obtainable, and one did not:

- `docs/SEP-20-PREFLIGHT.md` said to leave B in `_doNotWatch` because *"the engine
  still scans and decides, the guard still refuses"*
- `_doNotWatch` is **documentation** — `config.ts` says so — and `runEngine`
  iterates `contracts`
- measured against the real dogfood config: **2 decisions, A's instance and the
  shared code entry, B absent, no refusal anywhere**

So the cron could never emit the line, the pre-flight's §6 forbade the config edit
that would produce one, and `pnpm check` would have been red from Sep 20 with no
legal way to make it green — on the single unrepeatable date in the sprint.

It was found by **measuring the path rather than reading the document that
described it**. The document was confident and wrong, and had been for two days.

So, when arming any date- or state-triggered gate: **run the allowed path and
watch the artifact appear, before the gate is armed.** Not the intended path —
the one the rules actually permit.

### The fix for a check can defeat the check

*Same day, immediately after the above.* The repair for the crossing gate was an
in-memory probe that produces the refusal without moving B into `contracts`. Its
rehearsal output was committed as evidence — and that file contained B's contract
ID and the string `REFUSED BY WRITE GUARD`, which **was the entire matching rule.**
The gate went green for 2026-09-20 while the real crossing was still six days away.

A gate that cannot tell a rehearsal from the event reports success for the event
without it happening, quietly, on a green check nobody re-reads.

Repaired with two independent rules — the evidence directory must be dated on or
after the threshold, **and** a file carrying the rehearsal marker never counts —
commissioned in four directions, including the case that broke it.

**After changing a check, re-run the case the check exists to catch.** A check is
not a test of itself, and the most likely thing to disarm it is the commit that
was trying to help it.

### Publish exactly one package

`core` and `shared-types` are **bundled into the CLI and never published**. They stay `private: true` permanently and live in the CLI's `devDependencies`, not its `dependencies`.

Three defects in two days came from workspace packages reaching a published artifact:

| | Defect | What a user would have got |
|---|---|---|
| Sep 9 | `shared-types` declared at runtime, never published | `E404` |
| Sep 10 | `npm pack` left `workspace:*` literal | `EUNSUPPORTEDPROTOCOL` |
| Sep 10 | the rehearsal supplied `core` from a sibling tarball | a false pass over both |

Publishing `core` obliges publishing `shared-types` — three packages, three immutable version numbers, and a two-step publish window that leaves someone 404ing whichever order is chosen. **Bundling removes the class rather than sequencing around it.**

`scripts/check-publish-safety.mjs` asserts it in `pnpm check`, because a decision in a document is one somebody can undo without noticing. The runtime dependency is pinned exactly: the SDK is now the only thing between the CLI and the outside world, and a loose range lets someone else's release break installs of a version of ours that worked yesterday.

### A check that has never failed has not been shown to be a check

*Observed 2026-09-10, in the guard built to catch the previous instance.* The pack-and-install rehearsal reported success twice while **supplying a dependency the registry does not have** — all three tarballs were installed together, so the CLI's `core@0.0.0` resolved from a sibling file rather than from npm. The stranger it existed to simulate would have got a 404.

It was only trusted because it had passed. Passing was the whole of its evidence.

**So: before relying on a new check, produce the failure it is meant to catch and watch it fail.** For an install rehearsal that means the isolated case — top-level package only, fresh directory, clean cache, no siblings, no workspace above it. For anything else it means the same shape: construct the bad input on purpose.

This generalises the mutation-testing habit from code to *procedures*, which is where it had not been applied.

### Rules catch patterns you are looking for; implausibility catches the ones you are not

Documented rules do not fire at the moment of action. **Attention does.**

*Observed 2026-09-10, sharply.* The `$?`-after-a-pipe trap was written into this file, and then repeated **within the hour** while measuring a CLI exit code. Having written the rule down changed nothing at the keyboard. What actually caught it was the answer being **implausible** — `exit=0` for a command already known to have failed.

That is a real limit on every rule in this document, and it has a practical consequence rather than a counsel of despair:

**Report the numbers that surprise you, and stop when one does.** Surprise is the only detector that works on failure modes nobody has enumerated — including the ones no rule here covers yet. A result that is merely *wrong* looks like every other result; a result that is *implausible* announces itself, but only to someone who has a prior about what it should be.

**Two catches in one day, and both were QUANTITIES.** `exit=0` for a command known to have failed; `2.0 XLM` for an extension that should have cost a fraction of that — the second was a single target applied across entries with different remaining TTL, and **no test caught it.** That is a pattern worth pointing attention at: **numbers you can sanity-check against a rough expectation are the cheapest detector available.** They cost nothing to print and nothing to glance at, and they catch classes of error no rule anticipates.

So: **print the quantity, and look at it.** A total, an exit code, a count, a duration. Not because you will check every one carefully, but because an order-of-magnitude error is visible at a glance and a behavioural error usually is not.

Which is also the argument for stating expected values before running something, rather than reading the output and deciding it looks fine.

### Guards get written by someone already thinking about the pattern — elsewhere

**A guard built to detect a failure mode frequently contains that same failure mode.** This has now recurred four or five times in one week, each instance sitting inside the guard for the previous one:

- `check-policy-constants.mjs`, written to catch a copied constant, **threw an uncaught stack trace when a constant was renamed** — a check that stops matching rather than failing. The divergent-ID failure, inside the guard against divergence.
- The guinea-pig B simulation, written to prove the liveness alarm fires, **restated the rule it was testing** — validating its own copy.
- The `no-restricted-syntax` rule, written to forbid hand-written comparisons, **fired on `threshold < 0`** — validation, not policy.

At some point that stops being coincidence and becomes a property of how guards get written: **the guard is code, and code written to detect a pattern is written by someone currently thinking about that pattern in a different place.** Attention is spent on the thing being guarded, not on the guard.

**So: exercise a new guard in its failing direction before trusting it**, including its degenerate cases — a renamed input, a missing file, an empty collection. A guard only ever observed passing is indistinguishable from one that cannot fail.

### A divergent ID is worse than a wrong status

A wrong status is a **visible mismatch** — the diff catches it and someone fixes it. A divergent ID does not fail; it **quietly stops matching.** The row falls out of scope entirely while the diff still reads green, so the one row that most needed checking is the one no longer being checked.

Two rules follow, both in [`AGENTS.md`](../AGENTS.md) § Dual-channel sync:

- **Row IDs come from `BACKLOG.md`, never inferred from a naming pattern.** The repo registers the ID; Notion copies it.
- **Diff on presence, not only on status.** A divergent ID appears as a phantom on one side and a missing row on the other, which a status-only diff will not see.

*(Learned the hard way on 2026-09-05: guinea-pig C existed as ~~W1-D4-04d~~ in Notion and `W1-D4-07` in the repo — a divergence in the join key created on the same day the key was declared frozen.)*

Full workflow, including the session-start validation and the discrepancy rules, is in [`AGENTS.md`](../AGENTS.md) § Dual-channel sync.

## TypeScript

- Strict mode on, everywhere. No `any` without a comment explaining why.
- Shared types live in `packages/shared-types` — never redefine a `ScanResult` locally.
- Exported functions get explicit return types.
- Errors: throw typed errors (`EvergreenError` subclasses) with actionable messages. The CLI turns them into human-readable output; never let a raw stack trace reach a user.
- No default exports (except where a framework demands it).
- Async: `async/await`, no floating promises, no `.then()` chains.

## A lesson written as prose cannot prevent its own recurrence

**When you write down a lesson, ask what would execute it.** If the answer is
"someone reads the file it happens to sit in", the lesson is not protected — it
is documentation next to code that happens to be right, with no way to run when
someone opens a different file.

This project has now paid four times for one rule that lived in one place and
was copied into a second, then a third, then re-derived from scratch:

| when | the rule | how it failed |
|---|---|---|
| 2026-09-08 | four separate task-ID patterns | diverged; #73 collapsed them to one |
| 2026-09-10 | ID suffix class `[0-9a-c]` | `W3-D21-01d/e` invisible in both directions |
| 2026-09-10 | the threshold comparison | a longhand copy did not move when the policy became a floor (`<=`); the engine alarmed while CI reported a clean pass |
| 2026-09-12 | ID shape, again | the Sep 10 lesson was a **correct comment** in `check-task-ids.mjs`; a new file re-invented the identical bug **two hours after it was written**, silently dropping 22 rows |

The last one is the proof. The prose was right, current, and in the repo. It
did not fire, because prose cannot.

**So: a lesson is finished when something executes it.** In order of strength:

1. **A shared implementation** — one module, imported. `scripts/task-id.mjs`,
   `needsAction()` in `ttl.ts`, `coverageIssues()` for both output channels.
2. **A name the compiler enforces** — `alertThresholdOn` and `expiresOn` cannot
   collide the way two things both called "crossing" did.
3. **A check that fails**, commissioned by watching it fail. Note that this is
   weaker than it looks: `check-task-ids.mjs` narrows on *both* sides at once,
   so it can never detect its own class being too narrow.
4. **A comment.** Necessary for the *why*. Never sufficient for the *rule*.

A comment that says "don't do X elsewhere" is a bug report filed against the
future. If X is worth preventing, export it.

### Reclassify a false positive; do not suppress it

When you remove a false positive, **ask what the check can no longer see.**
Suppression trades a blind spot for a blind spot. Reclassification keeps both
the silence and the coverage.

2026-09-12, ~~W3-D18-02~~. It was reported as a mirror phantom on every sync run.
The easy repair was to ignore that one ID and enjoy the quiet — which would have
removed the noise *and* the coverage, because an ID genuinely appearing where it
should not would then also be silent.

What it actually was: an **intentionally retired ID**, documented at
`CONVENTIONS.md` and deliberately kept `Dropped` so the ID is never reused. So
it became a third category alongside checkbox rows and standing obligations —
and the category is **checked**, not muted: a retired ID that does not read as
`Dropped` is now a reported finding, because a retired ID not reading as retired
is the reuse hazard itself.

Two details worth copying:

- **Source a new category from an existing documented marker**, never a new
  hand-kept list. The retired set is derived from the strikethrough convention
  already in this file. A second list would have been a fresh divergence source
  inside a mechanism whose whole purpose is eliminating divergence sources —
  the fix would have carried the disease.
- **Find out which it is.** The answer was already written down in the repo; the
  binary "restore it or delete it" was a false choice offered before anyone
  looked.

### Testing a guard means testing that it refuses AND that it is reached

**A guard has two failure modes: it fails to refuse, or it is never invoked.**
A unit test of the guard covers the first and is *structurally blind* to the
second — the guard's own test file passes identically whether or not anything
calls it.

2026-09-13: `write-guard.test.ts` proved `assertWriteAllowed` refuses
guinea-pigs B and C. Nothing proved the CALL SITE existed inside
`planExtension`. Deleting the call left 620 tests green — and that is the CLI's
manual extend path, **the one the live transaction in #105 was signed through on
Sep 11**. Nothing bad happened, but that was established by reading the chain
afterwards, not guaranteed by the code beforehand.

So "the guard is tested" is an ambiguous claim and should stop being made.
**The invocation needs its own test, at the call site, and it exists only if
someone writes it deliberately.** A mutation inventory across every call site is
the cheap way to find the ones nobody wrote.

### A substring assertion is a proxy, and proxies fail hardest near the requirement

When the requirement is about what the system **does or offers**, assert on
behaviour or structure — not on whether a word appears.

2026-09-14: a notification template must never offer to restore a temporary
entry, because temporary data is DELETED at expiry. The test banned the
substring `restore` — and failed on the correct sentence, *"It cannot be
restored."*

That is the general failure: **correct copy mentions the forbidden thing
precisely in order to rule it out**, so a textual proxy rejects exactly the
sentence you most want to keep. The assertion became "does not contain
`RestoreFootprintOp`" plus "does contain `cannot be restored`" — two statements
about what is offered rather than one about vocabulary.

Distinct from the wrong-oracle and compound-clause rules. Those are about a test
encoding the wrong specification or never reaching its branch; this one is about
a test encoding the *right* specification through the wrong kind of evidence.

### A test of one clause must satisfy every other clause

When a test targets one clause of a compound condition, **the fixture must
satisfy all the others** — otherwise a different clause throws first, the
assertion passes, and the branch under test is never reached. It looks exactly
like coverage.

2026-09-13: a payer-agreement test passed while deleting the clause it was
written for changed nothing, because the payer chosen was also undeclared and
`!Object.hasOwn(config.payers, …)` threw first. Green, isolating nothing.

The check is mechanical: delete the clause the test names and confirm that test
— specifically that one — fails.

### Mutation testing cannot see a wrong oracle

**Mutation testing proves that tests detect change. It cannot prove that tests
encode correct intent.** A commissioned check is only as good as the thing it is
commissioned against, and nothing in the commissioning loop ever looks at the
contract.

2026-09-13, the engine's target arithmetic. The correct semantics were written
in the type annotation being imported — `extendToLedgers` is *"Target lifetime
relative to execution, not an absolute ledger number"*, and `BumpDecision.payer`
says *"Never choose the first shared contract implicitly."* A comment was
written asserting the opposite, the opposite was encoded into a test, a second
comment was added defending it, and then the whole thing was mutation-tested.
**Every mutation passed, reporting perfectly on a specification that was already
wrong.**

The two methods are not substitutes:

- **commissioned checks verify the MECHANISM** — does this fail when it should
- **reading the contract verifies the INTENT** — should it fail here at all

This project is strong at the first and has no habit for the second. Rakha has
now found two classes of defect by reading the authority — the
`extendTo <= maxEntryTtl - 1` ceiling from stellar-core's validator, and these
from our own type annotations — and both times our tooling was green.

**The cheap habit: when you import a type, read its annotations before writing a
comment about what it means. If your comment and the annotation disagree, the
annotation wins until proven otherwise.**

### Every inner layer of a layered defence is untested by construction

An inner guard is **shadowed by the layer above it**, so nothing naturally
exercises it — and it exists precisely for the case where the outer layer
failed. The untested layers are exactly the ones that matter once something has
already gone wrong.

2026-09-13: deleting `assertWriteAllowed` from the engine's execution plan left
all 619 tests green, because `decideBumps` refuses guinea-pig B upstream. A
mutation inventory across all eight guard call sites then found **three**
decorations, including the guard call inside `planExtension` — the CLI's manual
extend path, the one the live transaction in #105 was signed through. The guard
FUNCTION was well tested; its CALL SITE was not.

**So test each layer by bypassing the one above it.** Hand the inner function
the input the outer layer would have blocked. And when the inventory says a
layer is covered, check that the test isolates *that clause*: one of the three
new tests passed while deleting the clause it was written for changed nothing,
because a different clause in the same `if` threw first.

### Dates come from the clock, never from prose

Any date written into the repo is read from the system clock. Not from a
message, a plan, or a conversational "Monday" or "tomorrow" — those are framing,
not authority.

2026-09-13: twenty-two dated claims across `BACKLOG.md`, `CONVENTIONS.md`,
`W2-REVIEW.md` and two evidence directory names said Sep 14 for work that landed
Sep 12. In this repo `crossesOn`, `expiresOn`, evidence directory names and the
drift-check cadence are all dated claims that other work depends on.

An evidence directory's date is a factual claim about when the observation was
taken, so a rename is part of the correction — leaving the name disagreeing with
the content is the same collision that got `crossesOn` renamed.

### A converged reconciler cannot be verified by running it

*Commission a checker by watching it fail* assumes there is something to fail on.
**A reconciler in the state it is supposed to produce has nothing to detect, so a
passing run carries no information at all — not weak evidence, none.**

The only way to verify one is to give it something to find: **manufacture the
condition it exists to handle, then check the correction landed.**

2026-09-12, the Notion sync. The mirror was already in parity because a human had
reconciled it by hand, so a green run would have proved auth and read and said
nothing whatsoever about the `PATCH`. One row was set to a deliberately wrong
status, the job dispatched, and the row **read back**:

```
W4-D24-04  Status: Pending → Dropped       (the planted drift, corrected)
W2-D14-03  Status: Blocked → Done          (a real one nobody had noticed)
```

This generalises well past Notion. **Any idempotent or reconciling mechanism —
a migration, a drift corrector, a repair job, a cache invalidator, a restore —
is unverifiable in the state it is meant to produce.** It has to be tested
against the state it is meant to fix.

Two details that made the verification real rather than ceremonial:

- **Read the artefact back, not the exit code.** A green job is precisely the
  evidence that has misled this project repeatedly.
- **Confirm the negative.** `Notes`, `Owner`, `Day`, `Kind`, `Week` and `Task`
  were checked *unchanged*, so "writes Status and Owner only" is demonstrated in
  practice rather than asserted in the code.

### A manual sweep that was performed can still be incomplete

The mirror was in parity on 2026-09-12 because Rakha had reconciled it by hand.
It still carried `W2-D14-03` at `Blocked` while `BACKLOG.md` said `Done`, and
nobody knew.

That is a harder fact than "hand-syncing does not converge". **The sweep was
performed, by someone careful, and was incomplete** — which is the actual reason
the mirror is derived rather than maintained. Notion is safe as a mirror
precisely because nothing depends on a human keeping it right.

### An ad-hoc instrument reports on itself

A **negative** result is a hypothesis about the instrument until the instrument
is shown to work on that input. That was too narrow. The same applies to
**positive** findings: a defect apparently discovered by a throwaway script is a
statement about the script until it is reproduced through the product's real
entry point.

**Specifically: a script that opts out of the project's own guarantees cannot be
evidence about code that relies on them.**

2026-09-12: an ad-hoc `.mjs` called `scanContracts` directly and reported exit 0
with zero entries for three live contracts. That was written up as a product
defect and a requirement was attached to it. The CLI was never affected —
`scanIsDegraded` already covers `entries.length === 0` and exits 3. The script
had bypassed TypeScript, which is exactly how its wrong call shape survived, and
it never touched `exitCodeFor` at all.

Before reporting behaviour, ask which instrument produced it. If the answer is
"a script I wrote to look at this", reproduce it through the real entry point
first.

### Implausibility produces signals, not verdicts

The detector below is the most productive one this project has. That is precisely
how a heuristic gets promoted to a verdict without anyone deciding to promote it.

**An implausible quantity tells you to look. It does not tell you what you will
find.** 2026-09-12: exactly 24.0h between two instruments read as an off-by-one
and was a constant. A fee of ~11,700 stroops is a *signal* the target may be
wrong; it is not proof of a no-op — Rakha proved the extension the right way, by
showing absolute expiry rose after inclusion, not by reasoning from the fee.

The failure mode of a very good detector is that people stop checking behind it.

### Advice already sent does not correct itself

When a review teaches you how something actually works, **check what you have
already told someone that it contradicts.** It is sitting in an issue with your
name on it, being followed.

2026-09-12: an issue told Rakha to "pick N large enough to clear the existing
remaining" — in a document that also, correctly, said the CLI resolves
`--ledgers N` to `current + N`. Two contradictory instructions, one document. A
day later the `#86` review read `const requested = base + additionalLedgers` and
mutated it to prove the guard fires. The correct answer was held twenty-four
hours after the wrong one was sent, and nothing connected them. Rakha caught it.

### Detection: arithmetic on a quantity

Worth recording because the hit rate is lopsided. Six of the last eight findings
were caught by a number being implausible, against zero caught by a rule
looking for them:

- three rows marked done, two moved → 22 dropped task IDs
- coverage floor set to 99.9% and the suite passed → the floor was never wired
- 9,349 stroops of "rent" for an extend needing none → right number, wrong mechanism
- exactly 24.0h between two instruments → a constant, not drift

**Rules catch the patterns you are looking for; implausibility catches the ones
you are not.** When a count, a cost, or a date looks slightly off, that is the
cheapest signal available — spend the five minutes.

## Naming

- Ledger-related values always carry their unit in the name: `remainingLedgers`, `observedAtLedger`, `endsAtLedger`. TTL bugs come from confusing ledgers with seconds — the names should make that impossible. `endsAtLedger` is the final live ledger; `endBehavior` distinguishes archival from deletion. Wall-clock estimates are display-only.
- Money/fee values carry the unit too: `estimatedRentStroops`, never bare `cost`.
- Booleans read as assertions: `isArchived`, `shouldBump`, `hasPolicySigner`.

**⚠️ `remainingLedgers` and `threshold*` are matched by a lint rule.** `eslint.config.js` identifies hand-written TTL policy comparisons by *identifier name*. Renaming these silently disables a safety guard — the rename succeeds, every test passes, and the rule simply stops matching anything.

That is the divergent-ID failure again: a check that stops checking rather than failing. If you rename them, update the selectors in `eslint.config.js` in the same commit, and confirm the rule still fires by planting a deliberate copy and watching lint reject it.

## Testing

- Test runner is **Vitest** (ADR-003). `pnpm test` runs unit tests only.
- Unit tests never touch the network. Use fixtures in `packages/core/test/fixtures` and the mock RPC client.
- Integration tests that hit testnet live in `*.integration.test.ts`, are excluded from the default `pnpm test`, and are run manually.
- Every bug fix gets a regression test reproducing the bug first.
- Coverage target: meaningful coverage on `core` math/cost/decision logic (~80%). Don't chase 100% on glue code.
- Test names describe behavior: `keeps an entry live at zero remaining ledgers`.

### One home for a policy — call the predicate, never restate it

**A rule lives in exactly one function. Every other place calls it.** Writing `remaining < threshold` by hand where `needsAction(remaining, threshold)` exists creates a *copy*, and copies do not move when the original does.

This is a member of the [report-named-no-subject family](#-the-report-named-no-subject--the-pattern-and-its-members) with a different surface. The copy agrees with the original right up until they diverge, and that agreement is exactly what makes it invisible until then.

**Enforced by lint, not by discipline.** `eslint.config.js` forbids hand-written TTL threshold and expiry comparisons everywhere except `packages/core/src/ttl.ts`, which is the one home. A copy is now a CI failure at the moment it is typed, rather than a defect found by whoever thinks to grep.

#### Two real catches, 2026-09-10, from a single policy change

Both happened when the threshold became a floor (`<` → `<=`). They are recorded together because **the difference between them is the argument for the rule.**

**Catch 1 — a test carried its own copy. It failed loudly.** The guinea-pig B simulation computed *when the engine acts* as `remaining < THRESHOLD` instead of calling the predicate. It broke the moment the policy moved, and was fixed in minutes.

**Catch 2 — `exitCodeFor` carried the same longhand. It did not fail at all.** Nothing compared the CLI gate to the engine, so there was no signal to miss:

```
remaining= 17281  needsAction=false  engine.isAlarm=false  cli.exit=0  agree
remaining= 17280  needsAction=true   engine.isAlarm=true   cli.exit=0  *** DIVERGE ***
remaining= 17279  needsAction=true   engine.isAlarm=true   cli.exit=1  agree
```

At exactly the threshold, `evergreen-check` reported a **clean CI pass** while the engine alarmed. That exit code is the Action's entire contract with strangers' CI: someone else's pipeline would have gone green while their contract sat on the last ledger of its margin, and green is the answer nobody investigates. Same shape as the npm packaging defect — wrong in the direction nobody checks.

**The honest tally: one caught by accident of a policy change, one caught by a grep prompted by that accident. Neither by design.** That is why the rule is now a lint rule. Grep found the third copy; grep cannot prove there is no fourth.

### An `eslint-disable` for a policy rule needs the same bar as changing the policy

The policy modules carry **zero** inline disables today. That property does not survive a deadline unless it is written down, because every individual disable looks justified at the moment someone writes it — and a rule with scattered disables has decayed into documentation that happens to run.

**So: silencing the one-home rule requires the same scrutiny as changing the threshold semantics itself.** Not a reviewer's shrug; a decision, with a reason recorded in `STATUS.md`.

The rule already fired once on legitimate code — `threshold < 0` in `assertLiveness`, which was *validation, not policy*. The right response was not a disable. It was `isValidThreshold`, which is clearer code and left the exception count at zero. **Expect that to be the usual outcome:** when this rule fires on something legitimate, the code generally wants to be clearer anyway.

### Agreement is not correctness

When two modules consume one policy, pin their agreement in a test — `packages/cli/test/gate-agreement.test.ts` walks across the boundary asserting the CLI gate and the engine give the same answer.

**But assert that both match the predicate, not merely each other.** Two consumers agreeing on a wrong answer is still a wrong answer, and a pure agreement test would pass happily while both were wrong together. The agreement pattern invites exactly this failure, so the guard against it belongs beside it.

Note the limit, too: an agreement test protects the consumers it knows about. A call site added later is not covered by it — which is the other reason the lint rule exists.

### A test must call the thing it tests, never restate it

A test that reimplements its subject is **not a weak test — it is a test of a different thing that happens to usually agree.** It validates its own copy and asserts nothing about the code.

The guinea-pig B simulation computed *when the engine acts* as `remaining < THRESHOLD` rather than calling `needsAction`. It passed for as long as the two matched.

**It failed only because the policy changed.** Had `<` stayed, that duplicated logic would have sat green indefinitely, asserting nothing. The failure was luck, not detection — which is the part worth remembering, because next time the policy may not change.

Its cousin is already here: the [rent fixture](../packages/core/test/fixtures/README.md) pins *relationships* rather than a formula, and a test asserts that so nobody fits a coefficient to three points. Same instinct — the test must not encode the answer it is checking for.

## Secrets and keys

- `.env` is gitignored. `.env.example` is committed with placeholder values and a comment per variable.
- Real secrets live only in: the developer's local `.env`, GitHub Actions secrets, and the hosting platform's env store.
- Never paste a secret into a doc, an issue, a PR description, a commit message, or a chat log.
- Testnet keys are still treated as secrets — they're not valuable, but the habit is what protects the mainnet keys later.
- If a secret leaks: rotate first, then clean history, then note it in STATUS.md.

### Where each secret lives — one row per surface

Every secret has exactly one home per surface. If you find yourself copying a value into a second place, that is the bug.

| Secret | Local dev | GitHub Actions | Hosting platform |
|---|---|---|---|
| `EVERGREEN_SIGNER_SECRET` (bot Ed25519, **testnet only**) | `.env`, gitignored | repository secret | platform env store |
| `EMAIL_API_KEY` | `.env` | repository secret | platform env store |
| `SOROBAN_RPC_URL`, `STELLAR_NETWORK_PASSPHRASE` | `.env` | workflow env — **not secret**, but env-driven so a testnet reset is a config edit | platform env |

**Rules that follow from the table:**

- **Nothing but `.env.example` is committed**, and it holds placeholders with a comment per variable — never a real value, not even a testnet one.
- **A secret never travels through a PR body, an issue, a commit message, a log line, or a chat.** If a workflow needs one, it reads it from the secret store at run time.
- **The scheduler workflow deliberately needs no secret.** It performs public reads only. Keep it that way as long as possible: a workflow with no credential cannot leak one, and the read path is exactly where we do not need authority.
- **Rotation is the first move, not the last.** A leaked testnet key is worth nothing; rotating it anyway is what keeps the reflex intact for the key that will one day matter.

## Transactions

- Every code path that can submit a transaction defaults to dry-run/simulation.
- Live submission requires an explicit flag (`--submit`) or config field. No exceptions.
- Log the tx hash on every submission, at info level, in a greppable format: `submitted tx=<hash> contract=<id> op=extendTTL`.
- Copy every meaningful hash into `docs/EVIDENCE.md` the day it happens — **with all three artifacts**: the hash, the full unedited JSON RPC response, and an explorer screenshot. Testnet resets make explorer links dead, and a hash pointing at a chain that no longer exists proves nothing. One minute per transaction now; unrecoverable later.

## Documentation

- Any user-facing behavior change updates the relevant doc in the same PR.
- Code comments explain *why*, not *what*. The what is the code.
- Public exports get a short JSDoc line — the CLI's `--help` and the README are generated from real behavior, so keep them honest.

## Why some of these rules exist

Three decisions that look arbitrary from the outside, recorded so nobody spends an afternoon re-litigating them.

**Prettier doesn't touch markdown.** Our docs are unusually table-heavy — `BACKLOG.md`, `EVIDENCE.md`, and `PRD.md` are largely tables, and `STATUS.md` is edited nearly every session. Prettier reflows tables and rewrites emphasis markers, so every future docs diff would be unreadable at exactly the moment docs diffs matter most: when a reviewer or a future agent session is trying to see what actually changed. It cost 381 lines of churn on day 3; by Week 3 it would have been constant.

**TypeScript stays on 5.x for this sprint.** TypeScript 7 is a rewritten compiler. Adopting it in a 30-day sprint, immediately before integrating a Stellar SDK whose behavior under it nobody has tested, is exactly the avoidable variance this document exists to prevent. Other tooling is kept current — ESLint 9 was out of support and got bumped to 10 — but the compiler stays boring.

**Conventions are lint rules wherever that's cheap.** A convention that lives only in a document is advisory, and in agent-assisted development a future session may not read it carefully or at all. Mechanically enforced, it holds regardless of who or what is writing the code. So: no default exports, no `any`, explicit return types on exports, and no floating promises are ESLint errors, not paragraphs. **Prefer a rule that fails CI over a sentence in a doc** — apply this anywhere else it's cheap.

## Formatting

- Prettier formats TypeScript, JSON, and YAML. `pnpm format` writes, `pnpm format:check` runs in CI.
- **`pnpm check` runs exactly what CI runs** — `check:conflicts`, `check:task-ids`, `typecheck`, `lint`, `format:check`, `test`, in that order. **This is the one canonical enumeration; don't copy it elsewhere.** If you add a gate to CI, add it here too — and note that this list itself drifted once, dropping the two `check:*` gates while still claiming to match CI, which is the same failure it warns about one clause later. A local `check` that is weaker than CI is worse than no local check: it teaches you to trust a green that doesn't mean anything. (This bit us once already: `format:check` was in CI but not in `check`, and a PR went red on generated files that passed locally.)
- Tool-generated files are not formatted. `contracts/**/test_snapshots/` is regenerated by `cargo test` on every run, so formatting it means Prettier and Cargo overwrite each other forever.
- **Markdown is excluded on purpose.** Prettier reflows tables and rewrites emphasis markers, which buries a real docs change under formatting churn — and these docs are read by a grant reviewer, not only by us. Format markdown by hand.
- Lint rules enforce the TypeScript section above (no default exports, no `any`, explicit return types on exports, no floating promises). If a rule blocks good work, change it in a PR rather than sprinkling disables.

## Dependencies

- Prefer the standard library and the official Stellar SDK. Every new dependency is weight a reviewer has to trust.
- Pin exact versions for Stellar tooling — Soroban's surface moves, and a silent minor bump can break TTL semantics.
- No dependency added in Week 4 unless it's fixing a release blocker.
