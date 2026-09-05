# CLAUDE.md

**[`AGENTS.md`](AGENTS.md) is the operating manual and it is canonical.** Read it, and read [`docs/ONBOARDING.md`](docs/ONBOARDING.md) if you are new to this repo.

This file exists only because Claude Code loads `CLAUDE.md` by name. It deliberately contains no rules of its own — two manuals would drift apart within a week, which is the same failure the duplicate `Evergreen-PRD.md` caused and the same reason the repo/Notion split has exactly one canonical side.

**If you are about to add a rule here, it belongs in `AGENTS.md` instead.**

## Claude Code specifics

Only things with no general equivalent. Everything else is in `AGENTS.md`.

- **Commit attribution is off.** `.claude/settings.json` sets `attribution` to empty strings so commits and PRs carry no AI co-author trailer. Committed rather than personal, so it applies to every clone. Don't reintroduce the deprecated `includeCoAuthoredBy` key. See `docs/CONVENTIONS.md` § Git.
- **Notion MCP is already connected** via claude.ai connectors at `https://mcp.notion.com/mcp`. Do not run `claude mcp add` for it — that creates a duplicate server pointed at the same endpoint. Check `claude mcp list` first.
- **Querying the Notion mirror:** `SELECT ID` returns Notion page UUIDs, not task IDs, and does *not* error. Always select `"userDefined:ID"`. See `docs/CONVENTIONS.md`.
