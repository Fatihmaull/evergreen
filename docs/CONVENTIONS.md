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

## TypeScript

- Strict mode on, everywhere. No `any` without a comment explaining why.
- Shared types live in `packages/shared-types` — never redefine a `ScanResult` locally.
- Exported functions get explicit return types.
- Errors: throw typed errors (`EvergreenError` subclasses) with actionable messages. The CLI turns them into human-readable output; never let a raw stack trace reach a user.
- No default exports (except where a framework demands it).
- Async: `async/await`, no floating promises, no `.then()` chains.

## Naming

- Ledger-related values always carry their unit in the name: `remainingLedgers`, `liveUntilLedgerSeq`, `projectedArchiveDate`. TTL bugs come from confusing ledgers with seconds — the names should make that impossible.
- Money/fee values carry the unit too: `estimatedRentStroops`, never bare `cost`.
- Booleans read as assertions: `isArchived`, `shouldBump`, `hasPolicySigner`.

## Testing

- Test runner is **Vitest** (ADR-003). `pnpm test` runs unit tests only.
- Unit tests never touch the network. Use fixtures in `packages/core/test/fixtures` and the mock RPC client.
- Integration tests that hit testnet live in `*.integration.test.ts`, are excluded from the default `pnpm test`, and are run manually.
- Every bug fix gets a regression test reproducing the bug first.
- Coverage target: meaningful coverage on `core` math/cost/decision logic (~80%). Don't chase 100% on glue code.
- Test names describe behavior: `returns 0 remaining ledgers when entry is already archived`.

## Secrets and keys

- `.env` is gitignored. `.env.example` is committed with placeholder values and a comment per variable.
- Real secrets live only in: the developer's local `.env`, GitHub Actions secrets, and the hosting platform's env store.
- Never paste a secret into a doc, an issue, a PR description, a commit message, or a chat log.
- Testnet keys are still treated as secrets — they're not valuable, but the habit is what protects the mainnet keys later.
- If a secret leaks: rotate first, then clean history, then note it in STATUS.md.

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
- **Markdown is excluded on purpose.** Prettier reflows tables and rewrites emphasis markers, which buries a real docs change under formatting churn — and these docs are read by a grant reviewer, not only by us. Format markdown by hand.
- Lint rules enforce the TypeScript section above (no default exports, no `any`, explicit return types on exports, no floating promises). If a rule blocks good work, change it in a PR rather than sprinkling disables.

## Dependencies

- Prefer the standard library and the official Stellar SDK. Every new dependency is weight a reviewer has to trust.
- Pin exact versions for Stellar tooling — Soroban's surface moves, and a silent minor bump can break TTL semantics.
- No dependency added in Week 4 unless it's fixing a release blocker.
