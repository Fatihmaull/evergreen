# Contributing to Evergreen

Evergreen is built during a 30-day Stellar Instawards engagement by [Apex](README.md#team), with heavy agent assistance. Context lives in files rather than in anyone's head, so the repo should be legible to someone who has never spoken to us.

## Start here

1. [`docs/ONBOARDING.md`](docs/ONBOARDING.md) — orientation: what Evergreen is, the five things that will bite you, how work gets done.
2. [`AGENTS.md`](AGENTS.md) — the operating manual: session ritual, hard rules, repo map. Canonical for every agent tool; written for agents, useful for humans.
2. [`docs/STATUS.md`](docs/STATUS.md) — what's actually happening right now. Read first, write last.
3. [`BACKLOG.md`](BACKLOG.md) — the plan, with stable task IDs.
4. [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — style, commits, testing, secret handling.

If `docs/STATUS.md` and `BACKLOG.md` disagree, STATUS is more recent. Fix the disagreement before starting work.

## Setup

```bash
git clone <repo-url> && cd evergreen
pnpm install
cp .env.example .env    # fill in locally — never commit
pnpm check              # typecheck + lint + test
```

Node version is pinned in `.nvmrc`. Use `nvm use` (or your equivalent) rather than whatever is on your PATH.

## Task IDs, branches, commits

Task IDs like `W2-D8-01` are **stable identifiers, not dates** — `D8` means "the eighth task-day in sequence." Never renumber one; they're referenced in commits, branches, `docs/EVIDENCE.md`, and `docs/STATUS.md`.

```
branch:  feat/W2-D8-01-ttl-math
commit:  feat(cli): add scan command [W1-D7-01]
```

Types: `feat` `fix` `docs` `test` `refactor` `chore` `ci`. Scopes: `cli` `core` `engine` `dashboard` `types` `action` `repo` `docs`.

One task per PR. CI green before merge. `main` is protected.

## Rules that aren't negotiable

These exist because breaking them is expensive, not because we like rules. Full list in [`AGENTS.md`](AGENTS.md).

- **Testnet only.** No mainnet path — not a flag, not a branch.
- **No secrets anywhere in the repo.** Not in code, docs, tests, commit messages, or issue descriptions. Testnet keys included; the habit is what protects the real ones later.
- **Never invent a Soroban API.** Check [`docs/SOROBAN-PRIMER.md`](docs/SOROBAN-PRIMER.md), then the official docs. "I need to verify this" is a fine thing to say.
- **Dry-run is the default.** Live submission requires an explicit flag.
- **Tests never hit the network.** Unit tests use fixtures; integration tests are `*.integration.test.ts`, excluded from `pnpm test`, and never in CI by default.
- **Evidence is a deliverable, and a hash alone is not evidence.** Every testnet transaction needs the hash, the full JSON response, _and_ an explorer screenshot — testnet resets make explorer links dead.

## Definition of done

- Works against the guinea-pig testnet contract (ID in [`docs/SETUP.md`](docs/SETUP.md)).
- Unit tests cover the logic, using fixtures rather than live RPC.
- `pnpm check` green.
- Docs updated if user-facing behavior changed.
- `BACKLOG.md` checkbox flipped, `docs/STATUS.md` updated, evidence recorded if applicable.

## Blocked?

Mark the task `[!]` in `BACKLOG.md`, write the blocker in `docs/STATUS.md` with what you tried, and say so out loud. A blocked task nobody knows about is the most expensive thing in a 30-day sprint. Don't sit on it for more than an hour.
