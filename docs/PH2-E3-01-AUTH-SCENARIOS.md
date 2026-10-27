# E3 part A: login and sign-out scenarios (PH2-E3-01)

API-level scenarios for the sign-in journey, with what to watch by hand on preview. The tests are `apps/api/test/auth-e3a-scenarios.test.ts`. They run through the Worker's `handle()` over `MemoryAuthStore`, an injected clock and an injected `fetch`: no network, no database.

**Source of the labels.** The stages A1 to A7 below are **this document's own labels, not WEBF's step numbers**. They were built from `docs/API.md` §3 and §4, ADR-008 and `BACKLOG.md` `PH2-E3-01`, before the manual checklist was in the repo. That checklist is now `docs/PH2-E3-LOGIN-CHECKLIST.md` (steps 1 to 5 and 9 are part A, login and sign-out). The mapping, matched by content, is in the next section. A test name begins with its stage label.

Preview facts (values live in `docs/API.md` §3 and `apps/api/src/auth/config.ts`, and are configuration, so preview may differ): code lives 10 minutes, 8 digits, 5 wrong guesses void it; 3 code requests per address per 15 minutes; 20 per IP per hour; cookie `__Host-evergreen_session`; rotate after 24 h with a 60 s grace window; 30-day absolute limit.

## Mapping to WEBF's checklist steps

Matched by what each step checks, against `docs/PH2-E3-LOGIN-CHECKLIST.md` at `0b36d94`. The checklist's step numbers are the ones to quote to Tih; the A labels are only for finding tests. The two lists do not line up one to one: there are 7 labels and 6 part A steps.

| Stage | WEBF checklist step | Match |
|---|---|---|
| **A1 · Request a code** | Step 2, "Ask for a code" | Match. Step 2 expects `POST /auth/email/start` to answer 202 and an 8-digit code by mail. Step 2 also covers the 503 and 429 answers, which are not A1. |
| **A2 · Verify, cookie set** | Step 5, "Sign in with the right code" | Partial. Step 5 checks the "Signed in as …" note, not the cookie flags. Step 4 only says the page keeps nothing in Local Storage or Session Storage and that the cookie's visibility in devtools is undetermined. So the cookie attributes in A2 (`HttpOnly`, `Secure`, `SameSite`, `Path`) have **no checklist step**. |
| **A3 · /me** | Step 1 (signed out) and the reload in step 5 (signed in) | Partial. Both steps depend on `GET /me`, but neither names it as a check. The 401 `UNAUTHENTICATED` case is step 1's "You are not signed in." and the 200 case is the reload in step 5. One label maps to two steps. |
| **A4 · Rotation** | None | **Undetermined.** No checklist step covers rotation, and it needs more than 24 hours. |
| **A5 · Sign out** | Step 9, "Sign out" | Match for sign-out and the reload. Replaying the old cookie, signing in again to the same account and a second browser are not in step 9. |
| **A6 · Rate limits** | None as a step | Step 2 lists the 429 note ("Too many codes asked for…") as an "Other answer" and the checklist says not to click repeatedly. No step triggers it, so 429 is **not exercised by hand**. |
| **A7 · Wrong, expired, reused code** | Step 3, "Enter a wrong code, once" | Partial. Step 3 covers the wrong code only. A reused code is touched once, in step 5 (submitting the same code again). An expired code and the 5-guess limit have **no checklist step**. |

Steps with no A label: **Step 4** (what the page keeps in browser storage) is a page-side check; no stage here has a matching test, because the API tests cannot see browser storage. It is the nearest thing to A2's "token never in the body", but it checks something else.

Steps 6, 7, 8 and 10 are part B (watchlist) and have no A label.

### Why the gaps are not in Tih's manual checklist

The gaps above are **deliberately** not manual steps. They are not overlooked. Each one is covered by the automated tests of #426 (`apps/api/test/auth-e3a-scenarios.test.ts`), checked against the file on main:

| Gap | Covered by (test name, in the `describe` named) |
|---|---|
| Cookie attributes in A2 (`HttpOnly`, `Secure`, `SameSite=Lax`, `Path=/`, no `Domain`, `Max-Age`) | `answers 200 { user } and sets one __Host- cookie with the ADR-008 attributes` (`A2 · verify the code: the session cookie`) |
| Expired code in A7 | `expires at 10 minutes: valid at 599 s, refused at 600 s` (`A7 · wrong, expired and reused codes`) |
| 5 wrong guesses in A7 | `is void after 5 wrong guesses, even for the right code, until a new code is requested` (`A7 · wrong, expired and reused codes`) |
| Rate limits in A6 | `allows 3 per address in a 15-minute window, then 429 with Retry-After to the window end`, `opens again when the window rolls over, and a refused request does not extend it`, `counts per address, case and spaces ignored, and leaves other addresses alone`, `counts per IP across addresses: 20 an hour, then 429; another IP is unaffected` and `is checked before the address is looked at: a limited IP gets 429 even for a malformed address` (`A6 · rate limits on requesting a code`) |

Every gap has at least one test. None was found uncovered. These tests run offline through `handle()` with an injected clock, so they check what the real cookie header and the limits do in the Worker, but not what a browser shows or what the real database counts (see "Undetermined" below).

The reason for not adding manual steps: for A6, a manual check means pressing "send" four times in a row and hitting the limit; for the expired code and the 5 wrong guesses, it means more sends or a 10-minute wait on top. Each extra manual step would make Tih press send repeatedly and run into the per-address and per-IP limits, which would spoil the checklist's own sign-in steps for the next 15 minutes.

**A4 (rotation) stays undetermined** by hand: it needs more than 24 hours, so no manual step can check it. Only the automated tests (`A4 · rotation during a signed-in day`) cover it, with an injected clock.

## Stage → test → what to observe on preview

Browser devtools, Network tab, filter `api/v1`. UI wording is WEBF's and is not asserted here.

| Stage | Tests in `auth-e3a-scenarios.test.ts` | Observe on preview |
|---|---|---|
| **A1 · Request a code** | `A1 · request a code` (4 tests): 202 with empty body, one 8-digit code mailed to the lower-cased address, only a MAC stored; same 202 for known and unknown addresses; 202 and no mail for a malformed address; a new code replaces the old | `POST /auth/email/start` answers `202` with no body. One mail arrives with an 8-digit code. Asking twice: only the second code works. A made-up address also answers `202` (no mail will come; that is correct). |
| **A2 · Verify, cookie set** | `A2 · verify the code: the session cookie` (3 tests): `200 { user }`, one cookie with `HttpOnly; Secure; SameSite=Lax; Path=/`, no `Domain`, `Max-Age` 30 days; token never in the body; case-insensitive address, one address one account | `POST /auth/email/verify` answers `200` with `{ "user": { id, email, createdAt } }`. Application tab: cookie `__Host-evergreen_session`, HttpOnly and Secure ticked, SameSite Lax, Path `/`, no Domain. JavaScript cannot read it (`document.cookie` does not list it). |
| **A3 · /me** | `A3 · GET /me` (3 tests): user, empty wallets, CSRF token; `401 UNAUTHENTICATED` with no cookie, a malformed cookie or an unknown token | `GET /me` answers `200` with `user`, `wallets: []` and `csrfToken`. In a private window (no cookie) the same URL answers `401` with `error.code` `UNAUTHENTICATED`. |
| **A4 · Rotation** | `A4 · rotation during a signed-in day` (4 tests): none inside 24 h; one rotation after 24 h; old token valid for the 60 s grace window, same CSRF token, then `401`; new sign-in revokes the cookie it sent; session ends 30 days after login | **Not practical by hand**: it needs a day. If a session is left open for more than 24 h, the next `GET /me` carries a fresh `Set-Cookie` and the page keeps working. A second sign-in in the same browser invalidates the first cookie. |
| **A5 · Sign out** | `A5 · sign out` (7 tests): `204`, cookie cleared with `Max-Age=0`, row deleted, `/me` then `401`; a second sign-out `401`; without a session `401`; without CSRF `403` and the session survives; another browser's session survives; after a rotation both tokens are revoked; the same address signs in to the same account afterwards | Sign out: `POST /auth/logout` answers `204` and the response clears the cookie. Reload: `GET /me` answers `401`. Replaying the old cookie (copy it before signing out) answers `401`. Sign back in with the same email: same `user.id`. A second browser stays signed in. |
| **A6 · Rate limits** | `A6 · rate limits on requesting a code` (5 tests): 3 per address, then `429 RATE_LIMITED` with `Retry-After` to the window end; reopens at the window boundary and refused requests do not extend it; address counted after normalising; 20 per IP per hour, another IP unaffected; the IP check comes first | Request a code 4 times in a row for one address: the 4th answers `429`, `Retry-After` is the seconds to the end of the current 15-minute window (the window is fixed and aligned to the clock, so it can be much less than 900). After that time the request works again. The UI should show the wait, and `error.retryable` is `true`. |
| **A7 · Wrong, expired, reused code** | `A7 · wrong, expired and reused codes` (8 tests): wrong code `401 CODE_INVALID`, no cookie; the right code still works before the limit; void after 5 wrong guesses until a new code is requested; valid at 599 s, refused at 600 s; single use; bound to its address; every refusal has the same body; pasted spaces tolerated | A wrong code answers `401` and `error.code` `CODE_INVALID`, with no cookie. After 5 wrong guesses the right code is refused too: ask for a new one. An old code (more than 10 minutes), a used code and a wrong code all show the same message by design. |

## Guard-removal coverage for every write path

`AUTH_WRITE_ROUTES` (`apps/api/src/auth/routes.ts`) lists six write routes. The existing suite already had a guard-removal test per route, so none was missing:

| Route | Guard | Existing test |
|---|---|---|
| `POST /auth/logout`, `POST /wallets/challenge`, `POST /wallets`, `DELETE /wallets/{account}` | session, CSRF token, `Origin`, expiry | `auth-mount.test.ts` (`guard removal through the router: every write path`: no session 401, no CSRF 403, foreign Origin 403, expired 401) and `auth-routes.test.ts` (`every write path is guarded`, which adds a wrong CSRF token 403) |
| `POST /auth/email/start` | per-address rate limit | `auth-mount.test.ts` and `auth-routes.test.ts` |
| `POST /auth/email/verify` | the code | `auth-mount.test.ts` and `auth-routes.test.ts` |

What this PR adds on top, through the router: the per-IP guard, the IP-before-address order, window rollover, the failure limit and the expiry boundary.

**Proof the new tests test something.** Each guard was removed in `apps/api/src` one at a time, the new file was run, and each removal failed at least one test (a failing count in brackets). Sources were restored afterwards. Removed: the rate-limit check itself (5), the per-IP refusal (2), the per-address refusal (3), the failure limit (1), expiry `>=` to `>` (2), the single-use check (2), address lower-casing (3), logout's row deletion (4), the CSRF refusal (1), revoking the cookie a sign-in sends (1), the rotation trigger (2), the grace-window cut (1).

## Undetermined: not tested, not invented

- **Mapping gaps** (see the mapping section): A4, A6 and the A2 cookie attributes have no checklist step; the expired-code and 5-guess cases of A7 have none either; step 4 has no stage. Whether WEBF will add steps for them is undetermined. The checklist itself says its step titles are inferred, because the original ten-step list is not in the repo.
- **Account deactivation and reactivation by email** (`docs/API.md` §10). No route on main deactivates an account. Reactivation exists only as SQL in `PgAuthStore.upsertUserByEmail` (`ON CONFLICT … deactivated_at = NULL`), covered by `pg-store.test.ts` against a fake SQL client, not by a journey. That autopilot stays off after reactivation cannot be tested: the watchlist API (`PH2-E2-05`) is not on main.
- **Mail delivery on preview.** The tests prove the Worker asks Resend for a mail, not that a mail arrives. What the preview sender may reach depends on the Resend account: undetermined.
- **Real database behaviour.** Rate-limit counters, the `users_email_uq` index and row deletion run against the in-memory store here. `pg-store.test.ts` checks the SQL text with a fake client. Atomic counters on Neon are not exercised offline.
- **Requests with no `cf-connecting-ip`.** `clientIp` falls back to the literal `unknown`, so such requests would share one per-IP bucket. Behind Cloudflare the header is always set. Whether the shared bucket is the intended fallback is not stated in the spec, so no test asserts it.
- **Rotation by hand on preview** (needs more than 24 h) and the **7-day idle timeout** (`SESSION_IDLE_TIMEOUT`): the idle timeout is already covered by `auth-routes.test.ts` (`expires after the idle timeout and deletes the row`) and is not repeated here.
- **Wallet linking** is part B or a separate stage and is not covered here beyond the existing suite.
