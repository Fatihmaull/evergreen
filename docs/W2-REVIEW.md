# Week 2 review — 2026-09-12

Week 2 shipped the CLI's analytical surface: cost quoting, blast-radius health,
storage advice, config loading, the guarded manual extend, and a write guard
that refuses to spend an unrepeatable proof. It is **not** a complete week.
One deliverable-bearing item is unfinished and named as such below.

This report covers `W2-D14-03` and the Week 2 close. It does not mark the
engine, dashboard or publication deliverables complete.

## Review basis

- Merged baseline: `main` at `c3ba97b`, 26 PRs merged Sep 10–12 (#72–#101).
- **W2: 26 tasks — 18 done, 3 pending, 3 in progress, 1 blocked, 2 dropped.**
- W1 remains 50/50. Backlog total 146 tasks.
- Evidence: [snapshot #2](evidence/2026-09-12-w2-review/README.md), captured by
  running the commands at ledger ~4,625,132.

## Coverage — and an honest regression

`pnpm check` at close: **443 tests**, up from 309 at `W2-D14-01`.

| | `W2-D14-01` (Sep 10) | close (Sep 12) | |
|---|---|---|---|
| statements | 93.24% | **94.08%** | ↑ |
| branches | 85.29% | **88.94%** | ↑ |
| lines | 94.57% | **95.78%** | ↑ |
| functions | 97.64% | **93.75%** | ↓ **regressed** |

Three axes improved and one got worse. The drop is concentrated in
`packages/cli/src/extend.ts` at **37.5% functions** — the guarded extend landed
in #86 with its command-level state machine tested and its wiring functions not.
A reader comparing against the committed `W2-D14-01` evidence would otherwise
see a number move backwards with no explanation, so it is stated here rather
than left to be discovered.

The floor itself is now real. It was not on Sep 10.

### The coverage floor was never enforced

`pnpm check` ran `vitest run` **without `--coverage`**, so every threshold in
`vitest.config.ts` was inert. Proven by setting `statements: 99.9` and watching
the suite pass.

This was a claim I had made on Sep 10, and it had reached a funder-facing deck.
The deck is corrected. `--coverage` is wired into `pnpm test`, per-file floors
guard `ttl`/`rent`/`rent-quoter`/`health`/`liveness`/`config`/`network-config`/
`cost`, and the gate was commissioned three ways — a global floor, a per-file
floor, and a deleted test each fail it.

**A threshold nobody has watched fail is a decoration.** That is now the rule
for every gate in this repo.

## What Week 2 established

### Blast radius is a property of the key, not the contract

A, B and C are built from one Wasm and share **one** `ContractCode` ledger entry.
Severity follows the key: a shared entry at three days is not one contract at
three days, it is N contracts at three days.

Demonstrated on live chain at close — same key, same ledger, different inputs:

| scan input | consumers | sharing | blastRadiusAtLeast |
|---|---|---|---|
| A alone | 1 | `undetermined` | 1 |
| A + B + C | **3** | **`shared`** | **3** |

This is why `sharingStatus` has three states rather than a boolean. `false` from
the first row would be **unverifiable by construction on that path** — the chain
does not index reverse dependencies from a single query.

### The JSON channel was asserting what the human channel admitted it did not know

The human output printed *"code may have consumers outside this scan"* while the
JSON reported `issues: []`, `isShared: false`, `blastRadius: 1`.

**The code that acts got the confident version; the person who does not act got
the honest one.** Backwards, and in exactly the field the product exists to
surface. Both channels now derive from one `coverageIssues()` source, so they
cannot disagree — rather than merely agreeing today.

### Rent is a difference, not a formula

`extendTo` is an **absolute target remaining-TTL, not a delta**, verified on
chain: targets at or below current remaining price identically and change
nothing. So rent is the difference between two simulations of the same
operation — the fixed cost cancels and no fitted constant survives.

An earlier version subtracted a measured constant and reported 9,349 stroops of
"rent" for an extend that needed none. Right answer, wrong mechanism, which is
worse than no mechanism because it survives casual checking.

Corollary worth having at the keyboard: **a cost near ~11,700 stroops means the
target was computed wrong, not that you got a bargain.**

### The write guard, and the fact that my first one had the bug it was built to catch

`assertWriteAllowed` refuses writes that would touch B, C, or the shared code
entry. The first version keyed on **consumer lists** — and a single-contract
scan reports A's code entry with one consumer, so `extend A --include-code`
passed the guard cleanly. The guard had the precise hazard it existed to prevent.

It now protects the shared entry **by ledger key**, because that is the thing a
consumer list cannot see.

A second defect followed: the refusal was swallowed by the generic handler and
printed *"Extension preparation failed. Check Testnet RPC…"* — sending an
operator to debug their network while the real message was that this write would
spend an unrepeatable proof. A safety event wearing a generic failure.

## ⛔ What is not done

**`W2-D11-02` — the live `extendTTL` transaction.** Required SOW evidence for
Deliverable 2. The CLI merged (#86) and the unsigned simulation passed, but **no
live transaction has ever run.** It needs a signing key, so it is Rakha's:
[#103](https://github.com/Fatihmaull/evergreen/issues/103). `W2-D11-01` stays In
progress until live behaviour is proved, which is correct rather than pessimistic.

**`W2-D14-02b` — the publish rehearsal**, reopened. It passed while testing the
wrong thing: all three tarballs were installed together, so the CLI's `core@0.0.0`
resolved from a **sibling file on disk** rather than the registry. A stranger has
no such file. Closed as a class by bundling one package with `core` and
`shared-types` permanently `private: true`.

**`W2-D10-04` — engine wiring.** The decision rule landed with 18 tests; the
engine loop is `W3-D15-01`.

**`W2-D10-01c` — the CLI cannot follow its own advice**, found during this
review. `scan` prints *"pass them together to see the real blast radius"* and
accepts exactly one contract ID. The capability exists in core; only the
argument parser is singular.

## The pattern worth carrying into Week 3

Four of Week 2's findings are the same shape: **something reported success while
the thing it named had not happened.**

- coverage thresholds enforcing nothing, reported green
- a pack rehearsal resolving from disk, reported as a registry install
- `isShared: false` where sharing was unknowable, reported as fact
- a task-ID parser dropping 22 rows, reporting `✓ parsed 124 task rows`

The last one was mine, two hours old, in the script written to stop exactly this
class. It was caught by **arithmetic, not by a check** — three rows were marked
done and only two moved. And `check-task-ids.mjs` already carried the lesson in
a comment, from Sep 10, when a `[0-9a-c]` class hid `W3-D21-01d/e`.

A rule kept in a comment gets re-invented. It now lives in `scripts/task-id.mjs`
and is imported, and `parseBacklog` measures its own coverage: a row occupying an
ID slot that does not parse is a hard failure naming the rows.

Two working rules came out of this week:

1. **A negative result is a hypothesis about the instrument until the instrument
   is shown to work on that input.** Five "not caught" mutation results this week
   were instrument failures — unescaped perl parens twice, tree-shaken dead code
   twice, a stale `dist` once. It happened again during this review.
2. **Implausibility catches what rules do not.** Rules catch the patterns you are
   looking for. `$?` after a pipe reports `tail`'s status, and that one recurred
   within an hour of being written down — twice more during this review.

A corollary earned in this review: a discrepancy of *exactly* 24.0 h between two
instruments is not drift, it is a constant. `THRESHOLD_LEDGERS = 17_280` is one
day, and the drift check projects the alert threshold while the CLI projects
expiry. Both were right. **"Crosses" names two events a day apart** — and the
later one, expiry, is the unrepeatable one.

## Notion stops being maintained by hand

Three reconciliation sweeps in three days did not converge, and the cause is
structural: two agents and a human write one mirror with no serialisation point,
so every sweep fixes an already-stale snapshot. Some "anomalies" were just lag.

The mirror is now **derived** from `BACKLOG.md` in CI after merge (#102). It
writes Status and Owner only, never creates a row, never deletes one. A task in
Notion with no backlog row is a phantom and gets reported, because papering over
a disagreement removes the only evidence the two sides disagree.

## Handoff to Week 3

Rakha owns `W3-D15` → `W3-D19`, briefed in
[#104](https://github.com/Fatihmaull/evergreen/issues/104). Three dates do not
move: **`W3-D17-04` and `W3-D17-05` due Fri Sep 18**, `W3-D18-00` before it. And
two the chain sets: **B's threshold Sep 20 / expiry Sep 21**, **C's Sep 25 / 26**.

The engine must call `assertWriteAllowed`. The CLI's guard does not cover the
engine path.
