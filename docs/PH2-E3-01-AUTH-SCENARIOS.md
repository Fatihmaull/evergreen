# E3 part A: login and sign-out scenarios (PH2-E3-01)

API-level scenarios for the sign-in journey, with what to watch by hand on preview. The tests are `apps/api/test/auth-e3a-scenarios.test.ts`. They run through the Worker's `handle()` over `MemoryAuthStore`, an injected clock and an injected `fetch`: no network, no database.

**Source of the steps.** The E3 checklist WEBF works from (a group-chat message) is not in the repo, in `BACKLOG.md`, in `phase-2/` or in any issue or PR comment I could search. So the stages A1 to A7 below are **not WEBF's step numbers**. They are built from `docs/API.md` §3 and §4, ADR-008 and `BACKLOG.md` `PH2-E3-01`. Mapping them to WEBF's steps 1 to 5 and 9 is **undetermined** until someone pastes the checklist. A test name begins with its stage.

Preview facts (values live in `docs/API.md` §3 and `apps/api/src/auth/config.ts`, and are configuration, so preview may differ): code lives 10 minutes, 8 digits, 5 wrong guesses void it; 3 code requests per address per 15 minutes; 20 per IP per hour; cookie `__Host-evergreen_session`; rotate after 24 h with a 60 s grace window; 30-day absolute limit.

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

- **WEBF's checklist numbering** (see above).
- **Account deactivation and reactivation by email** (`docs/API.md` §10). No route on main deactivates an account. Reactivation exists only as SQL in `PgAuthStore.upsertUserByEmail` (`ON CONFLICT … deactivated_at = NULL`), covered by `pg-store.test.ts` against a fake SQL client, not by a journey. That autopilot stays off after reactivation cannot be tested: the watchlist API (`PH2-E2-05`) is not on main.
- **Mail delivery on preview.** The tests prove the Worker asks Resend for a mail, not that a mail arrives. What the preview sender may reach depends on the Resend account: undetermined.
- **Real database behaviour.** Rate-limit counters, the `users_email_uq` index and row deletion run against the in-memory store here. `pg-store.test.ts` checks the SQL text with a fake client. Atomic counters on Neon are not exercised offline.
- **Requests with no `cf-connecting-ip`.** `clientIp` falls back to the literal `unknown`, so such requests would share one per-IP bucket. Behind Cloudflare the header is always set. Whether the shared bucket is the intended fallback is not stated in the spec, so no test asserts it.
- **Rotation by hand on preview** (needs more than 24 h) and the **7-day idle timeout** (`SESSION_IDLE_TIMEOUT`): the idle timeout is already covered by `auth-routes.test.ts` (`expires after the idle timeout and deletes the row`) and is not repeated here.
- **Wallet linking** is part B or a separate stage and is not covered here beyond the existing suite.
