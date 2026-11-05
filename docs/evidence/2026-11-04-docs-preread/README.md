# Docs pre-read: landing page to a watchlist item on testnet, 2026-11-04

**This is not the `B-D31-03` / DoD-2 cold read.** DoD-2 needs an external beta user. This walk was done by the web agent (WEBF), who knows the repository, so it can find gaps but cannot prove there are none. `B-D31-03` stays open.

**What was read, on which build.** Production `https://evergreen-stellar.pages.dev` on 2026-11-04 (`/api/v1/health` commit `b8f69e4`, read the same day): `/`, `/dashboard/`, `/dashboard/watchlist/`, `/login/`, `/allowance/`, `/about/`, `/docs/`, `/docs/quickstart/`, `/docs/engine/`, `/docs/engine/config/`, `/docs/engine/notifications/`, plus `README.md` and the scan panel source. The quickstart scan was run against testnet with the local build of CLI 0.2.0 (`node packages/cli/dist/bin.js scan <guinea-pig A>`), exit 0. The published package itself was not run.

**What was not done.** Nothing signed in: the emailed code is Fatih's. The signed-in half (add a contract, see the row) is read from source (`scan-panel.ts`, `watchlist.ts`, `watchlist-view.ts`) and from the production runs in `docs/evidence/2026-10-29-e3-partB/`. No wallet prompt was exercised.

## The path, and where it breaks

| Step | What a reader does | Finding |
| --- | --- | --- |
| 1 | Lands on `/` | Scan path is clear (button, `npx` line). The "Watch" paragraph said "each entry you configure" and gave no way to. **Fixed:** it now links `/docs/engine/config/`. Neither the landing page nor `/docs/` mentions accounts, sign-in, the watchlist or the allowance. |
| 2 | Opens `/dashboard/` | Works. The overview showed "Reading the chain…" for about 15 s in the browser pane (seven sequential RPC reads of 4 to 6 s each). Slow, not broken; whether it is typical is undetermined. |
| 3 | Scans a contract | Works. The sample output on the landing page and quickstart is the committed 2026-09-12 capture; the published 0.2.0 prints `expires ~:` where the sample says `approx:`, and a last line that names both thresholds. **Fixed:** the provenance line says so. The evidence file is untouched. |
| 4 | Presses "Add to watchlist" | The note did not say it needs a sign-in, and the signed-out answer ("Not added. A watchlist belongs to a signed-in session…") had no link. **Fixed:** both link `/login/`. |
| 5 | Opens `/dashboard/watchlist/` signed out | Same: no link to sign in (only the sidebar's "Sign in"). **Fixed.** |
| 6 | `/login/` | Nothing says a wallet is optional for watching. **Fixed:** "You can add contracts to your watchlist with the email sign-in alone. A linked wallet is needed only for autopilot and allowances." (Step 6 of the E3 checklist answered "added" on production on 2026-10-29, a day before any wallet was linked on 2026-10-30; [record](../2026-10-29-e3-partB/README.md).) |
| 7 | Gets the code by email | Whether a **stranger's** address receives it is undetermined: every production run so far used Fatih's address. The page has a "could not be sent to that address" note for a refusal. |
| 8 | Watchlist row | Honest: "Not checked by the engine yet. The expiry beside it is this browser reading the chain now." No engine observation exists, so every row is in that state. |
| 9 | Wants autopilot | **No control on the site.** The API has `PATCH /watchlist/{network}/{contractId}`, which answers `503 UPSTREAM_UNAVAILABLE` until `THRESHOLD_FLOOR_LEDGERS` is configured (`docs/API.md` §6). |
| 10 | Wants to grant an allowance | **No approve flow anywhere.** `/allowance/` explains what an allowance is and offers only a disabled "Revoke allowance" ("The engine's spender address is not published yet"). |
| 11 | Wants to run the engine himself | `/docs/engine/config/` names `evergreen.config.example.json` without linking it and `pnpm engine:execute` without saying it needs a checkout (there is no npm engine package, `docs/ENGINE-SETUP.md`). **Fixed.** |

## By owner

**WEBF (this lane), fixed in this change:** steps 1 (link), 3, 4, 5, 6, 11. One thing left: no docs page describes the account, the watchlist or the allowance (step 1). It is written separately so it can be reviewed on its own.

**WEBR / Rakha (the XLM screens, not touched):**
- `/allowance/` defines an allowance for a reader who cannot create one. The page is honest about the missing spender, but nothing says an approve step is not built yet.
- A disabled "Revoke allowance" sits against `web-reference/design-language/claims-and-copy.md` row "Wallet connect, sign-in, accounts…", which says a disabled control standing in for an unshipped feature never appears, and against the "no disabled controls" line in `apps/dashboard/README.md`. Revoke is built; the disabled state is a missing configuration, not a missing feature. Whether that is inside the rule is Fatih's call.
- `PH2-E3-07` follow-ups (K17) before `/support/` is registered.

**CEF / Rakha (API and engine):**
- Autopilot cannot be turned on until `THRESHOLD_FLOOR_LEDGERS` is configured and the engine's spender address is published (`PH2-E4-02`, `PH2-E4-04`).
- Nothing inserts into `observations`, so no row can ever show an engine read (`PH2-E3-02`).

**DevOps:**
- Deliverability of the sign-in code to an address that is not the owner's, from the production sender domain: not tested with a stranger.
- A first `pnpm check` run failed twice in three on the PGlite timeout in `packages/engine/test/db-grants-0008.pglite.test.ts` ("refuses when a role does not exist", 5 s limit; the file takes about 15 s in a full run). It passes alone. Not a docs finding; recorded because it will cost someone a rerun.

**Fatih / PM:**
- `README.md` § "Scope boundaries (v1)" says "no hosted billing … we do not run infrastructure on anyone's behalf". Production now stores accounts and watchlists and runs a heartbeat scheduler that extends nothing. The section is scoped to "this grant", so it is not false, but a reader of it would not learn that an account exists. Decision: leave it, or add a phase-2 paragraph.
- Hosted tier landing copy waits on `PH2-E4-02` (`PH2-BL-05`, draft #480).
- `/about/` still tells the phase-1 story (grant dates 3 September to 2 October). Not wrong; says nothing of the account.

**Stale "30 days" wording, from the previous round:** `packages/core/src/scheduler-gap.ts:30` (CEF, a code comment: "reset restarts its 30 days"). *Correction, 2026-11-05:* this record first also listed `docs/ops/backup-and-restore.md:51` (DevOps). That was wrong or already fixed: the PM verified the file says 14 days (#585, #591), and a search of `docs/ops` on `96fabde` finds no "30-day" line.
