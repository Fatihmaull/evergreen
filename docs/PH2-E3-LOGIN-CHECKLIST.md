# PH2-E3-01 / PH2-E3-02 — manual test checklist for Tih

**Status: draft for Fatih's review.** Written from `origin/main` at `f3b5701`. Every on-screen string below is quoted from the code at that commit; where the code does not say, the step says `undetermined`.

Run on the preview site, `https://preview.evergreen-stellar.pages.dev/login/`, in a normal browser window. This checklist does not touch the production site. Stellar testnet only.

## Read first

- **Which email works.** On preview the sign-in code is sent from `onboarding@resend.dev`, which delivers only to the email of the Resend account owner (`docs/API.md` §1). Use **the email of your own Resend account**. Any other email is expected to fail at step 2 with the "could not send" message below. The cause of that failure is **not proven**; do not report one. This is a limit of the preview, not a defect to file.
- **Rate limits.** `POST /auth/email/start` allows 3 sends per address per 15 minutes and 20 per IP per hour (`docs/API.md` §3). A code lives 10 minutes, works once, and is void after 5 failed attempts. Do not click "Email me a code" repeatedly.
- **Numbering.** The steps keep the numbers of the ten-step list: 1, 2, 3, 4, 5, 9 are **part A** (login and sign-out) and are runnable now. 6, 7, 8, 10 are **part B** (watchlist) and are blocked (see the end). The text of the original ten-step list is not in the repo, so the step titles below are this document's own; the numbers are the ones to quote back.
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

**Expect, if the email is not your Resend account's.** The note **"The service could not send the code, nothing was sent."** with the small line **"HTTP 503 UPSTREAM_UNAVAILABLE."** and no code form. This is the known preview limit above, and the cause is unproven.

**Other answers the page can show.**
- **"Too many codes asked for. Try again in `N` min."** (or, with no wait given, "Too many codes asked for. Wait, then try again."): rate limit. Wait, and report it.
- An `undetermined` panel headed "Whether a code was sent.": the page could not read the API's answer. The small line says what it received.

**Pass.** Your Resend email: the "on its way" note, the code form, and the email arriving. Any other email: the "could not send" note.

**Fail.** Your Resend email gets the "could not send" note, a rate-limit note on the first click, or an `undetermined` panel. Also a fail: the "on its way" note with no email arriving after a few minutes (check spam first).

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
- The "The code from the email" form **stays visible** (the code does not hide it). That is the page's behaviour, not a failure. Submitting the same code again should give the "That code did not work…" sentence, because a code is single use.
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

**Blocked until `PH2-E2-05`.** The API's `/watchlist` routes are not on `origin/main` (`apps/api/src/router.ts` serves the health route, the auth group and a JSON 404 only). Do not run these steps yet, and do not report results from them. What the pages say today is described so that the block can be recognised.

| Step | What it will test | What it shows today, from the code | Runnable |
|---|---|---|---|
| 6 | On `/dashboard/scanner/`, scan a contract and click "Add to watchlist" | The API answers `404 NOT_FOUND` and the page shows an `undetermined` chip with **"We could not establish whether this was added."** Which contract to use is undetermined here. | After `PH2-E2-05` |
| 7 | `/dashboard/watchlist/` lists it, binding expiry first | The page shows an `undetermined` box with **"We could not establish this."** | After `PH2-E2-05` |
| 8 | Click "Remove" on the row | Nothing to remove. A failed removal shows **"The API did not remove this (`<code>`, HTTP `<status>`). It is still on your watchlist."** | After `PH2-E2-05` |
| 10 | While signed out, open `/dashboard/watchlist/` | **"A watchlist belongs to a signed-in session, and this browser has none. Nothing is shown."** — this needs `GET /watchlist` to answer `UNAUTHENTICATED`, which the router does not do yet. | After `PH2-E2-05` |

Steps 6 to 8 also need the sign-in from part A, and step 10 needs step 9 first.

## Things in the UI that are stale or misleading

These are findings, not test failures. Do not mark a step failed because of them.

1. **The `undetermined` panel on `/login/` says "The account service (`/api/v1`) answers these when it is deployed; until then this page cannot tell."** The API is deployed on preview, so "when it is deployed" is stale there, and the sentence is wrong whenever the cause is something other than a missing service. The panel appears for a 404, an HTML reply, a network error, or an unknown code (`apps/web/src/pages/login.ts`, `undetermined()`).
2. **The page's own header comment says "The API this page calls (`PH2-E2-04`) does not exist yet"** (`apps/web/src/pages/login.mjs`). Not shown on screen, but out of date.
3. **Wrong-code wording differs from the spec.** The page says "That code did not work. It may be wrong, used or expired. Ask for a new one." The spec's table (`docs/API.md` §9a) says "That code did not work. Request a new one."
4. **Rate-limit wording differs from the spec.** The login page says "Too many codes asked for. Try again in N min." The spec says "Too many attempts. Try again in N minutes." The spec also says the control is disabled for that long with a countdown; the login page only disables the button while the request is in flight.
5. **The code form stays on screen after a successful sign-in** (step 5).
6. **The 503 note says "nothing was sent"** and shows only "HTTP 503 UPSTREAM_UNAVAILABLE." It claims no cause, as intended. It also does not tell a person that the preview sender is limited to one email, so someone who is not the Resend account owner has no way to learn that from the page.
7. **The lead sentence on `/login/` says a wallet "is linked by signing a sign-in challenge"**, and the page offers wallet linking. This checklist does not test wallet linking; no step in the list covers it.

## What this checklist could not ground

- The text of the original ten-step list (steps 1 to 10 as Tih or the PM wrote them). The step titles here are inferred from the numbers and the scope given; map them back before running.
- Whether the email lands in the inbox or in spam.
- The cookie's visibility in the browser tools (step 4).
- Which contract to scan for step 6.
- Anything about how the live API behaves: nothing here was run against the live site. Expected texts come from the code at `f3b5701`, and the preview may be running a different build.
