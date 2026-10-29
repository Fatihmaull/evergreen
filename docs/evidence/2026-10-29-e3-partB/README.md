# PH2-E3 login test, Part B — 2026-10-29

Run by Fatih on 2026-10-29, reported at 18:03 WIB. Recorded by WEBF from the screenshots (01–08) and from reads made on 2026-10-29 between 18:00 and 18:06 WIB (09–10, curl, GitHub API). Checklist: [`docs/PH2-E3-LOGIN-CHECKLIST.md`](../../PH2-E3-LOGIN-CHECKLIST.md).

## Which host and which commit

- The login screenshot (02) shows `evergreen-stellar.pages.dev/login/` in the address bar. That is the **production** Pages host: production `DASHBOARD_ORIGIN` is `https://evergreen-stellar.pages.dev` (`apps/api/wrangler.jsonc`, `docs/ops/secrets.md`), and preview is only `preview.evergreen-stellar.pages.dev`. A session cookie is per host, so steps 6–10 ran on the production host. Screenshots 03–08 do not show the address bar.
- Screenshot 01 shows `/health` answering `"environment":"preview","commit":"626823fe03a8eac4998984cc2e6d9c0d344c3521"`. Its address bar is not in the image.
- `626823f` (merge of #493) was deployed to both Workers by API deploy run 40856711687: preview 17:23:56–17:24:24 WIB, production 17:24:37–17:25:13 WIB. Run 40861087873 (`main` @ `62d8100`) redeployed **preview** at 17:53:25–17:53:51 WIB; its production job is waiting for approval.
- So at 18:03 WIB production served `626823f` and preview served `62d8100`. Screenshot 01 (preview at `626823f`) was therefore taken before 17:53 WIB, and it is not a read of the host the test ran on. Read at 18:05 WIB: production `/api/v1/health` → `environment: production`, `commit: 626823fe…`; preview → `environment: preview`, `commit: 62d81009…`.
- **Result: Part B ran against production at `626823f`.** The exact time of each step is undetermined.

## The watchlist table in the production database

The watchlist table (`watch_items`) is created by `apps/api/db/schema.sql`, not by a numbered migration (`0002` is `jobs_daily_limit_per_user`). Evidence that production has it: step 6 answered **added**, then **already there** on the production host while signed in. The page shows those only for the API's success answers, which need the table. DevOps' log also says `schema.sql` + `0002`–`0005` were applied to the Neon `production` branch at 17:01 WIB. [`docs/ops/neon-migrations.md`](../../ops/neon-migrations.md) still says production has nothing applied, so that page is out of date (DevOps' file).

## Steps

| Step | Screenshot | Result |
|---|---|---|
| health | `01-health-preview-626823f.png` | preview, `626823f` (see above: not the tested host at 18:03) |
| 5 sign in | `02-login-signed-in-prod-host.png` | "Signed in as … No wallet linked." with Sign out. PASS |
| 6 add | `03-step6-added.png`, `04-step6-already-there.png` | **added** "CANZNT…XL6L is on your watchlist."; second click **already there** "…Nothing changed." PASS |
| 7 watchlist | `05-step7-watchlist-row.png` | row `CANZNT…XL6L`, binding expiry `undetermined`, health `undetermined` "Not scanned yet.", last observed "—", coverage "Instance and code only". Honest (no state without an observation), but **not** the checklist's pass text: no binding expiry is shown because the engine has not observed the entry yet |
| 8 remove | `06-step8-removed-empty.png` | "Signed in. Nothing watched yet." PASS. The second removal ("Nothing to remove for this account.") is not in the screenshots: undetermined |
| 9 sign out | `07-step9-signed-out.png` | "You are not signed in." PASS |
| 10 no session | `08-step10-watchlist-no-session.png` | "A watchlist belongs to a signed-in session, and this browser has none. Nothing is shown." and the scanner link. PASS |

## Scan, read by WEBF (no session)

`09-webf-scan-prod-…png` and `10-webf-scan-preview-…png`: headless Chromium, `/dashboard/scanner/`, guinea-pig A, 18:05 WIB. Both hosts: **healthy**, "The contract code entry expires first, on ~April 12, 2027, at ledger 8,297,162.", PARTIAL with 2 issues (shared code, no data keys), and the "Add to watchlist" section.

## Card outcome

- `PH2-E3-03` (scan + add, verified against the deployed API): **done**. Scan read on both hosts; add/already-there by a signed-in user on production.
- `PH2-E3-02`: **not ticked**. Add, list, remove and the no-session view work, and undetermined is never shown as healthy. "Binding expiry first" has not been seen with a real observation, because no engine observation exists for the row.
- `PH2-E3-01`: **not ticked**. Email sign-in and sign-out work on production. Wallet linking is in the card's title, and no step covers it.

(drafted with Fatih's PM assistant)
