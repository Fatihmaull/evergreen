# The minimum dashboard — what D3 needs by Oct 2

**For the web agent.** Written by the CLI/engine agent on 2026-09-22, because the
blocker under it was in `packages/core` and that is not the web agent's path.

**This is a floor, not a specification.** The full product spec is
`web-reference/EVERGREEN-PRODUCT-AND-DESIGN-SPEC.md` and nothing here replaces
it. This says only what has to be true for the grant, and what changed today
that makes it buildable.

---

## Why this is now the largest exposure on the board

SOW §6.2 grades **three rows, one per deliverable**, each *Evidence Present /
Partial / Missing*, assessed by one person to a standard §6 states outright:
*"easy to review with minimal technical expertise."*

**D3 is 2 of 5.** Its five evidence types are the dashboard URL, the GitHub
Action, the demo video, the docs, and the npm links. **One missing type pulls
the whole deliverable down**, so breadth beats depth: something real in every
type is worth more than excellence in any one.

The live URL resolves today and serves a 2,356-byte static placeholder. To the
assessor that is a **Missing** dashboard, not a partial one.

---

## The blocker is gone as of 2026-09-22

[#194](https://github.com/Fatihmaull/evergreen/issues/194) — a scan in a real
browser returned **zero entries and a rent of `"0"`, with no error**.

Cause: `scan-contract.ts` validated every ledger key with Node's global
`Buffer`, which does not exist in a browser. Every key raised a
`ReferenceError`, was caught, and surfaced as *"RPC returned a malformed ledger
key"*. `estimateRent` then priced an empty scan and returned `"0"` — the same
root cause, not a second bug.

Fixed in [#229](https://github.com/Fatihmaull/evergreen/pull/229) with a
canonical-base64 check on `atob`/`btoa`. The Stellar SDK was never the problem —
it carries its own `Buffer`. `packages/core/test/browser-no-buffer.test.ts`
deletes the global for its duration and is commissioned: revert the fix and it
fails with the browser symptom.

> 🔴 **Rent is still NOT browser-safe.** `estimateRent`'s *quoter* goes through
> the write path (`extensionKey`, `extend-rpc`), which still uses the Node
> global. Deliberately untouched — changing validation used by signing code
> needs its own mutation proof and buys nothing for a read-only page.
>
> **So the minimum dashboard must not render a rent figure.** Show it as
> *unavailable*, never as `0`. A silent zero is the exact failure #194 was.

---

## The floor

One page. One contract at a time. No wallet, no signup, no account — that is
`READY.md`'s outcome 2 and it is also the whole product thesis.

1. **An input for a contract ID**, and a scan on submit.
2. **Render the scan honestly:**
   - every entry, by **ledger key** — never rolled up per contract. Contracts
     built from one Wasm share a single `ContractCode` entry; a contract-shaped
     view cannot represent that and will report N contracts healthy right up
     until they die together.
   - remaining TTL **in ledgers**, with wall-clock only as a derived estimate
     and labelled as one.
   - the health verdict, using core's own tiers — do not re-derive them.
   - **`PARTIAL` when coverage is partial.** A scan without declared data keys
     reads only the instance and code entries. *"Everything I was asked to check
     is healthy"* is not *"this contract is healthy"*, and the page must say
     which one it means.
3. **Honest empty and error states.** RPC down, unknown contract, malformed ID.
   An error must never render as a zero or an empty healthy state.

**Not in the floor:** bump history, a contract list view, rent figures, mobile
polish, sharing visualisation. All are `W4-D23`/`W4-D24` and all are depth.

## What it must not do

- **Never render a number it did not get.** No `0` standing in for a failed
  read. This is the repository's oldest failure mode and the reason for §6's
  "minimal technical expertise" clause: a wrong number is worse than a gap,
  because the assessor cannot tell.
- **Never scan guinea-pig B or C from a scheduled or automatic path.** A
  user-typed scan is read-only and fine; nothing automatic should touch them.
- **Never re-implement core's grading.** See
  [#195](https://github.com/Fatihmaull/evergreen/issues/195) — several
  presentation rules still live in the CLI and are not importable from a
  browser. Where one is unreachable, render less rather than a second
  implementation that drifts.

## Verification, and it cannot be Node

[#194](https://github.com/Fatihmaull/evergreen/issues/194) was invisible to every
Node test — jsdom still has a global `Buffer`, so 466 tests passed while the bug
shipped. The web app's regression
test has to run in a **real browser** against the built bundle
([#197](https://github.com/Fatihmaull/evergreen/issues/197)). `.github/workflows/`
is not the web agent's path: **say when the scaffold exists and the CI job is
mine to add.**

> ⚠️ **The web track's task IDs are not in the plan.** Issues #194–#198 each cite
> a late `W4-D22` row that exists only in
> [#199](https://github.com/Fatihmaull/evergreen/pull/199), open and conflicting
> since 2026-09-17. `pnpm check:task-ids` refuses a bare reference to any of the
> five — *"an ID that appears in a doc but nowhere in the plan is work nobody is
> tracking"* — so this page cites issue numbers instead, and does not name them
> even to explain itself. **Landing #199 registers all five.**

## Dates

| | |
|---|---|
| Blocker cleared | **2026-09-22** (#229) |
| Earliest live | **2026-09-24** — Cloudflare Pages auto-deploys `main`, so it is live the moment a real page lands |
| Wanted by | **2026-09-28**, so the demo can show it |
| Hard stop | **2026-10-01** |

The demo video is the highest-leverage artifact in the submission — it is the
only thing that makes all three deliverables reviewable by a non-technical
reader in one sitting — and it needs the dashboard standing before it is
recorded.
