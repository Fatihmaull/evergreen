# Conventions

Rules an agent or human can follow without asking. If something here blocks good work, change the rule in a PR — don't silently deviate.

## Git

**Branches:** `<type>/<task-id>-<slug>` — e.g. `feat/W2-D8-01-ttl-math`, `fix/W3-D18-02-idempotency`.

**Commits:** Conventional Commits, with the task ID in the subject.

```
feat(cli): add scan command [W1-D7-01]
fix(engine): prevent double-bump across overlapping runs [W3-D18-02]
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

### Identifiers in documentation — precision goes where it is acted on

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

### Retire a task ID, never repurpose it

`BACKLOG.md` says IDs are frozen. The rule has a second half that only became visible when it was broken: **an ID must keep meaning the same work, not merely keep existing.**

*Learned 2026-09-08.* Restructuring Week 3 into two stages moved the day contents but reused the IDs. `W3-D16-01` stopped meaning "policy-signer e2e" and started meaning "bump execution"; `W3-D19-03` stopped meaning "alert emails" and started meaning the spike. Every ID still resolved, so nothing looked broken — while `EVIDENCE.md` quietly filed six rows against the wrong tasks, and `POLICY-SIGNER.md` claimed a due date belonging to the slack-ledger reconciliation.

**This is worse than a dangling reference, because a dangling ID is detectable and a repurposed one is not.** A script can check that every referenced ID exists; nothing cheap can check that it still means what the referrer thought.

So: when restructuring, **retire the old IDs and mint new ones.** A gap in the sequence costs nothing. A silently re-pointed ID costs an evidence row filed against the wrong proof, discovered when someone goes looking for it.

### The reported state and the actual state diverge — check the actual one

Four instances this sprint, same shape every time: **something reported a state, the real state differed, and only the real state was checkable.** Naming it as a pattern rather than collecting anecdotes, because the fifth one will look novel until you have the list.

| What reported | What was true | How it was caught |
|---|---|---|
| A testnet guard passing | It refused *everything* | Exercising it in the permitting direction |
| `pnpm check` green | Weaker than CI — missing `format:check` | Comparing the script against the workflow |
| `.prettierignore` valid, suite green | Conflict markers made it match nothing | A human reading the file |
| Cloudflare: *"Initializing build environment"* | Deploy had succeeded 94 seconds earlier | Loading the URL |

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

### A divergent ID is worse than a wrong status

A wrong status is a **visible mismatch** — the diff catches it and someone fixes it. A divergent ID does not fail; it **quietly stops matching.** The row falls out of scope entirely while the diff still reads green, so the one row that most needed checking is the one no longer being checked.

Two rules follow, both in [`AGENTS.md`](../AGENTS.md) § Dual-channel sync:

- **Row IDs come from `BACKLOG.md`, never inferred from a naming pattern.** The repo registers the ID; Notion copies it.
- **Diff on presence, not only on status.** A divergent ID appears as a phantom on one side and a missing row on the other, which a status-only diff will not see.

*(Learned the hard way on 2026-09-05: guinea-pig C existed as `W1-D4-04d` in Notion and `W1-D4-07` in the repo — a divergence in the join key created on the same day the key was declared frozen.)*

Full workflow, including the session-start validation and the discrepancy rules, is in [`AGENTS.md`](../AGENTS.md) § Dual-channel sync.

## TypeScript

- Strict mode on, everywhere. No `any` without a comment explaining why.
- Shared types live in `packages/shared-types` — never redefine a `ScanResult` locally.
- Exported functions get explicit return types.
- Errors: throw typed errors (`EvergreenError` subclasses) with actionable messages. The CLI turns them into human-readable output; never let a raw stack trace reach a user.
- No default exports (except where a framework demands it).
- Async: `async/await`, no floating promises, no `.then()` chains.

## Naming

- Ledger-related values always carry their unit in the name: `remainingLedgers`, `observedAtLedger`, `endsAtLedger`. TTL bugs come from confusing ledgers with seconds — the names should make that impossible. `endsAtLedger` is the final live ledger; `endBehavior` distinguishes archival from deletion. Wall-clock estimates are display-only.
- Money/fee values carry the unit too: `estimatedRentStroops`, never bare `cost`.
- Booleans read as assertions: `isArchived`, `shouldBump`, `hasPolicySigner`.

## Testing

- Test runner is **Vitest** (ADR-003). `pnpm test` runs unit tests only.
- Unit tests never touch the network. Use fixtures in `packages/core/test/fixtures` and the mock RPC client.
- Integration tests that hit testnet live in `*.integration.test.ts`, are excluded from the default `pnpm test`, and are run manually.
- Every bug fix gets a regression test reproducing the bug first.
- Coverage target: meaningful coverage on `core` math/cost/decision logic (~80%). Don't chase 100% on glue code.
- Test names describe behavior: `keeps an entry live at zero remaining ledgers`.

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
- **`pnpm check` runs exactly what CI runs** — typecheck, lint, format:check, test, in that order. If you add a gate to CI, add it here too. A local `check` that is weaker than CI is worse than no local check: it teaches you to trust a green that doesn't mean anything. (This bit us once already: `format:check` was in CI but not in `check`, and a PR went red on generated files that passed locally.)
- Tool-generated files are not formatted. `contracts/**/test_snapshots/` is regenerated by `cargo test` on every run, so formatting it means Prettier and Cargo overwrite each other forever.
- **Markdown is excluded on purpose.** Prettier reflows tables and rewrites emphasis markers, which buries a real docs change under formatting churn — and these docs are read by a grant reviewer, not only by us. Format markdown by hand.
- Lint rules enforce the TypeScript section above (no default exports, no `any`, explicit return types on exports, no floating promises). If a rule blocks good work, change it in a PR rather than sprinkling disables.

## Dependencies

- Prefer the standard library and the official Stellar SDK. Every new dependency is weight a reviewer has to trust.
- Pin exact versions for Stellar tooling — Soroban's surface moves, and a silent minor bump can break TTL semantics.
- No dependency added in Week 4 unless it's fixing a release blocker.
