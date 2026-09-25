### READY.md fresh-machine run — 2026-09-25 (`W3-D21-01b`)

Run from a directory that had never seen this repository. **Nothing was fixed in this sitting** — the row requires that, so each failure below is a finding to act on separately.

| # | A stranger can… | Verdict | What happened |
|---|---|---|---|
| 1 | Install the CLI and scan a real contract | **PASS** | installed @evergreen-stellar/cli@0.1.0 into a clean directory and scanned; exit 0 (1 = below threshold, a successful read) |
| 2 | Open the dashboard and check any contract's TTL | **PASS** | https://evergreen-stellar.pages.dev/dashboard/ accepts a contract (5839 bytes) and https://evergreen-stellar.pages.dev links to it |
| 3 | Add `evergreen-check` to their own repo's CI, and see it pass AND fail | **HUMAN** | action.yml exists — the remaining half is human: add it to a scratch repo and confirm BOTH a green run and a red one. Guinea-pig D is the intended failure fixture (W4-D25-01b). |
| 4 | Self-host the engine against their own contract | **HUMAN** | not automated on purpose — see the block printed below. Automating it would measure this script rather than the documentation. |

Outcome 4 is recorded as a human call by design: automating it would measure the harness rather than the documentation. 0 of the four are failing as of 2026-09-25 — failing now is information, failing on Oct 1 is a crisis, and that gap is why this was moved earlier.
