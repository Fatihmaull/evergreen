# PH2-E3-01 / PH2-E3-02 — manual test checklist for Tih

**Status: ready for Tih's run. Part A is done (2026-10-26 10:04 WIB); part B (steps 6 to 8 and 10) is runnable now — `PH2-E2-05`'s routes are deployed.** First written from `origin/main` at `f3b5701`; `main` has moved since. The login page text was re-verified against the head of the pull request that last changed this file (the login follow-up, `PH2-E3-01`), by reading `apps/web/src/lib/login-view.ts`, `lib/login.ts` and `pages/login.ts`. Part B was rewritten on 2026-10-26 against `origin/main` at `ab74675` and **against the deployed preview API**, not only the code. Every on-screen string below is quoted from `apps/web/src/lib/watchlist-view.ts` and `lib/watchlist.ts`; where the code does not say, the step says `undetermined`.

**Which build preview runs, and how that was established.** There is no commit marker on `/api/v1/health`, so this was derived rather than read: the last `API deploy` run that targeted preview was from branch `docs/PH2-E2-04-migration-refs` at `746d6908`, and `git diff 746d6908 ab74675` is **empty across the whole tree**. So preview runs code whose tree is identical to `main`. Merging to `main` deploys **production**, not preview (`.github/workflows/api-deploy.yml`: preview on every same-repo pull request, production on merge to `main`), so **a new pull request from anyone can replace the preview build at any time**. Re-check the deploy list immediately before and after a run before calling any result evidence about `main`.

Run on the preview site, `https://preview.evergreen-stellar.pages.dev/login/`, in a normal browser window. This checklist does not touch the production site. Stellar testnet only.

## Read first

- **Which email works.** On preview the sign-in code is sent from `onboarding@resend.dev`, which Resend documents as delivering only to the account owner's own email (`docs/API.md` §1; documented by Resend, not yet observed by us). Use **the email of your own Resend account**. For any other email, step 2 is expected to show one of two notes: the "could not be sent to that address" note (the API answered `502 EMAIL_NOT_SENT`) or the "could not send the code" note (`503 UPSTREAM_UNAVAILABLE`). Which one you get is undetermined until someone observes it; the page claims no cause for either, and neither should you. This is a limit of the preview, not a defect to file.
- **Rate limits.** `POST /auth/email/start` allows 3 sends per address per 15 minutes and 20 per IP per hour (`docs/API.md` §3). A code lives 10 minutes, works once, and is void after 5 failed attempts. Do not click "Email me a code" repeatedly.
- **Numbering.** The steps keep the numbers of the ten-step list: 1, 2, 3, 4, 5, 9 are **part A** (login and sign-out), run on 2026-10-26. 6, 7, 8, 10 are **part B** (watchlist) and are runnable. The text of the original ten-step list is not in the repo, so the step titles below are this document's own; the numbers are the ones to quote back.
- **There is no link to `/login/` in the site's navigation** (checked in `apps/web/src/chrome.mjs`). Type or paste the URL.
- **Screenshots.** Send a screenshot of the whole browser window, with the address bar, for steps **3, 5 and 9**.
- **Times.** For any step that shows `undetermined` or an error, send the time in WIB (UTC+7) when it happened, to the minute, so it can be matched to logs. Send the exact text on screen too.

## Part A — login and sign-out

### Step 1 — Open the page while signed out

**Do.** Open `https://preview.evergreen-stellar.pages.dev/login/` in a window that has no Evergreen session (a private window is simplest).

**Expect.**
- The heading is "Sign in" and the eyebrow is "Account · Stellar testnet".
- The session area first reads "Checking whether you are signed in…", then settles on the note **"You are not signed in."**
- Two sections follow: "1 · Email", with a field "Email address", a button "Email me a code", and the line "A one-time code, valid for a limited time and usable once."; and "2 · Wallet", with the buttons "Connect Freighter" and "Link this wallet".
- The "The code from the email" form is **not** visible yet.

**Pass.** "You are not signed in." is shown and the code form is hidden.

**Fail.** Any other session text. In particular, an `undetermined` panel headed "Whether you are signed in." is a fail for this step; it means `GET /me` did not return the API's own signed-out answer.

**Send back.** Nothing if it passes. If it fails: the exact text, and the WIB time.

### Step 2 — Ask for a code

**Do.** Type your Resend account email into "Email address". Click "Email me a code". Click once.

**Expect, on success.**
- The note: **"If `<your email>` can receive mail, a code is on its way. The answer is the same whether or not an account exists."**
- The form "The code from the email", with a button "Sign in", appears.
- An email arrives from `onboarding@resend.dev`, subject **"Your Evergreen sign-in code"**, body **"Your Evergreen sign-in code is `<code>`. It expires in 10 minutes. If you did not ask for it, ignore this email."** (`apps/api/src/auth/mount.ts`). The code is 8 digits by default (`docs/API.md` §3). Whether the email lands in the inbox or in spam is undetermined.
- Under the hood the page expects HTTP 202 from `POST /auth/email/start`. The page does not show the status; it shows the note above.

**Expect, if the email is not your Resend account's.** One of these, with no code form and no email:
- **"The code could not be sent to that address. Nothing was sent. Trying again will not help; use a different address."** The API answered `502 EMAIL_NOT_SENT`, which is not retryable. No further line is shown. Do not click again.
- **"The service could not send the code, nothing was sent."** with the small line **"HTTP 503 UPSTREAM_UNAVAILABLE."**

Neither note says why, and neither says a code was sent. This is the known preview limit above, and the cause is unproven.

**Other answers the page can show.**
- **"Too many codes asked for. Try again in `N` min."** (`N` is the wait from the server's `Retry-After`, rounded up to whole minutes; "1 min" for the last minute). While it shows, the "Email me a code" button is **disabled**. The sentence changes when the minute count drops, and when the wait ends the note clears and the button works again. If the server gave no usable wait, the note is **"Too many codes asked for. Wait, then try again."** and the button stays enabled. Do not try to trigger this on purpose; if it appears, wait, and report what you saw.
- An `undetermined` panel headed "Whether a code was sent.": the page could not read the API's answer. The small line says what it received.

**Pass.** Your Resend email: the "on its way" note, the code form, and the email arriving. Any other email: one of the two "could not be sent" notes above.

**Fail.** Your Resend email gets either "could not be sent" note, a rate-limit note on the first click, or an `undetermined` panel. Also a fail: the "on its way" note with no email arriving after a few minutes (check spam first).

**Send back.** Pass or fail. For any error or `undetermined`: the exact text and the WIB time. Whether the email arrived and about when (WIB).

### Step 3 — Enter a wrong code, once

**Do.** In "The code from the email", type `00000000` (any 8 digits that are not your code) and click "Sign in". Do this **once**; five failures void the code.

**Expect.** **"That code did not work. It may be wrong, used or expired. Ask for a new one."** The session note still reads "You are not signed in."

**Pass.** That sentence appears and you are still signed out.

**Fail.** Signed in, or an `undetermined` panel headed "Whether you are signed in."

**Send back.** **Screenshot of this step.** For a fail: the exact text and the WIB time.

### Step 4 — Check what the page keeps

**Do.** Open the browser's developer tools, Application (or Storage) tab. Look at Local Storage and Session Storage for `preview.evergreen-stellar.pages.dev`. Do not paste any value you find.

**Expect.** No Evergreen entry in either. The page's code says it keeps nothing in `localStorage`, `sessionStorage` or IndexedDB, and the session is an `HttpOnly` cookie it cannot read (`apps/web/src/pages/login.ts`, `docs/API.md` §9c). The cookie name in the code is `__Host-evergreen_session`; whether the browser's tools show it, and whether it is set before sign-in, is undetermined.

**Pass.** No sign-in data in Local Storage or Session Storage.

**Fail.** Any email, token or session value there.

**Send back.** Pass or fail, and the names (not values) of any keys found.

### Step 5 — Sign in with the right code

**Do.** Type the 8-digit code from the email and click "Sign in". Then reload the page.

**Expect.**
- The session note: **"Signed in as `<your email>`. No wallet linked."** and a button **"Sign out"**. A wallet appears as "Linked: …" only if one is linked; none should be.
- The area under the email form that showed the wrong-code sentence is empty.
- The "The code from the email" form **disappears**, and the field is emptied. The "Email me a code" form stays.
- After the reload, the page reads "Checking whether you are signed in…" and then the same "Signed in as …" note, because the page asks `GET /me` on every load.

**Pass.** "Signed in as `<your email>`." appears after the code, and again after a reload.

**Fail.** The wrong-code sentence for the correct code; an `undetermined` panel headed "Whether you are signed in."; or "You are not signed in." after the reload.

**Send back.** **Screenshot of the "Signed in as …" note, before the reload.** For a fail: the exact text and the WIB time. You may blur your email in the screenshot.

### Step 9 — Sign out

**Do.** Click "Sign out". Then reload the page.

**Expect.**
- The session note becomes **"You are not signed in."**
- After the reload, the same note.
- If the page was left open too long: **"This page was open too long. Reload and try again."** Reload and click again.
- If the API did not answer: an `undetermined` panel headed "Whether you are signed out."

**Pass.** "You are not signed in." right after the click and again after the reload.

**Fail.** The "Signed in as …" note still showing after the reload, or the `undetermined` panel.

**Send back.** **Screenshot of the page after the click.** For the `undetermined` panel or any error: the exact text and the WIB time.

## Part B — watchlist (steps 6, 7, 8, 10)

**Runnable.** `PH2-E2-05`'s routes merged on 2026-10-24 (#427) and are deployed. Verified without a session on 2026-10-26, which is safe and costs no email quota:

```
GET https://preview.evergreen-stellar.pages.dev/api/v1/watchlist
→ 401 {"error":{"code":"UNAUTHENTICATED","message":"Sign in first.", …}}
```

That is the answer step 10 needs, and it is no longer a 404.

**Sign in first (part A, steps 2 and 5).** Steps 6 to 8 need the session; step 10 needs step 9's sign-out. **Do not ask for a second code if the first still works** — the limit is 3 sends per address per 15 minutes, and a 429 spends email quota for nothing (§7.7 of the handoff). Nobody tests the countdown by triggering it.

**Which contract to scan, for step 6:** `CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L` — guinea-pig A, the project's own working subject. Checked on 2026-10-26: its shared code entry is live until ledger 8,297,162 against a latest ledger of 5,392,724, so the scan returns a healthy contract rather than an archived one. The scanner prefills it, so you can leave the field alone.

**Autopilot is not part of any step.** `THRESHOLD_FLOOR_LEDGERS` has no default and the engine has not published one (`apps/api/src/watchlist/mount.ts`), so autopilot cannot be turned on. If a control for it is visible and does anything, that is a finding — report it rather than using it.

| Step | What to do | Pass | Fail |
|---|---|---|---|
| 6 | On `/dashboard/scanner/`, scan, then click **"Add to watchlist"** | A **healthy** chip reading **added**, with "`CANZNT…XL6L` is on your watchlist." Clicking it a second time is also a pass: **already there**, "…was already on your watchlist. Nothing changed." | An `undetermined` chip reading **"We could not establish whether this was added."** — which means the API answered something the page did not recognise. Also fail: **"Not added. A watchlist belongs to a signed-in session, and this browser has none."** while you are signed in |
| 7 | Open `/dashboard/watchlist/` | The contract listed, and **the binding expiry leading** — the earliest entry, which for guinea-pig A is the shared **code** entry, not the instance. Its observation (the ledger it was read at) is shown beside the state | **"Signed in. Nothing watched yet."** after a successful step 6. Or a state shown with no observation beside it: §9a makes that a P0, not a display bug. Or the binding naming the instance when the code entry ends sooner |
| 8 | Click **"Remove"** on the row | The row goes. A second removal of the same row shows **"Nothing to remove for this account."** — that is the API's `404 NOT_FOUND`, and it is correct, not a fault | **"The API did not remove this (`<code>`, HTTP `<status>`). It is still on your watchlist."** with the row still there |
| 10 | Sign out (step 9), then open `/dashboard/watchlist/` | **"A watchlist belongs to a signed-in session, and this browser has none. Nothing is shown."** and a link saying the scanner needs no session | Any contract still listed, or the "route is not available on this API yet" box — that box belongs to the old build and seeing it means preview is not running `main`'s tree |

**One documented limitation, so it is not filed as a bug** (#445, `docs/API.md` §6). `DELETE` for an item you do not have answers `404 NOT_FOUND`, and so does a path the API does not serve at all; they differ only in `message`, which is not part of the contract. A client branching on code and status cannot tell them apart. The page says "Nothing to remove for this account." for both. That is known and deliberate.

**Send back.** For steps 6, 7 and 8: a screenshot of the whole browser window including the address bar. For step 10: the same. For anything reading `undetermined`, or any error: the exact text on screen and the WIB time to the minute.

## Findings from the first read, and where they stand

These were findings, not test failures. Do not mark a step failed because of them. Items 1 to 5 are fixed in the follow-up pull request; items 6 and 7 are not, by design.

1. **Fixed.** The `undetermined` panel said the account service "answers these when it is deployed; until then this page cannot tell." It now ends "This page cannot tell from that." and says nothing about deployment.
2. **Fixed.** The header comment in `apps/web/src/pages/login.mjs` said the API "does not exist yet". It now says the API is implemented in `apps/api/src/auth` and what the page does when the API is not configured or cannot be read.
3. **Fixed, on the spec side.** The wrong-code sentence on the page and in `docs/API.md` §9a now match word for word, and a test fails if they drift.
4. **Fixed.** The rate-limit sentence matches the spec ("Too many codes asked for. Try again in N min."), and the button is disabled for the server's `Retry-After` with a countdown, as §9a says.
5. **Fixed.** The code form no longer stays on screen after a successful sign-in.
6. **Not changed, by design.** The 503 note says "nothing was sent" and shows only "HTTP 503 UPSTREAM_UNAVAILABLE." The 502 note says "use a different address". Neither tells a person that the preview sender is limited to one email, because the page claims no cause. Someone who is not the Resend account owner cannot learn that from the page.
7. **Not covered.** The lead sentence on `/login/` mentions linking a wallet by signing a challenge, and the page offers it. No step in this list covers wallet linking. The stages the automated tests cover that no step reaches (rotation, the cookie's attributes, expired and five-guess codes, rate limits by hand) are mapped in `docs/PH2-E3-01-AUTH-SCENARIOS.md`.

## What this checklist could not ground

- The text of the original ten-step list (steps 1 to 10 as Tih or the PM wrote them). The step titles here are inferred from the numbers and the scope given; map them back before running.
- Whether the email lands in the inbox or in spam, and the cookie's visibility in the browser tools (step 4).
- **Part A's expected texts** come from the code, not from a run against the live site. Part B's were checked against the deployed preview API for the one thing that can be read without a session (`GET /watchlist` → `401 UNAUTHENTICATED`); the on-screen strings are still quoted from code.
- **The 429 countdown stays `undetermined` on purpose.** Triggering it spends email quota, so nobody tests it (§7.7).
- Which of the two "could not be sent" notes a non-owner email gets on preview, and whether the preview API answers `502 EMAIL_NOT_SENT` at all yet.
- Whether production's auth routes answer `503 UPSTREAM_UNAVAILABLE`. This checklist is for the preview site only.
