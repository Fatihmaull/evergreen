# PH2-E3-01 — step 5c (unlink the wallet) on production, 2026-11-04

- **Result: PASS**, reported by Tih (Fatih) on the production host `https://evergreen-stellar.pages.dev/login/`. The click was shortly before **12:21 WIB (UTC+7), 2026-11-04**; the exact minute of the click was not recorded.
- **Wallet:** Stellar **testnet** account `GC7YKP…YZ2IIL`, linked in step 5b ([evidence](../2026-10-30-e3-step5b/README.md)). Only the shortened form was reported. The signed-in email is written here as `<email>`.
- **Steps run:** [`docs/PH2-E3-LOGIN-CHECKLIST.md`](../../PH2-E3-LOGIN-CHECKLIST.md), step 5c: "Unlink", then the link to `/allowance/`, then a reload of `/login/`.
- **Moved nothing, revoked nothing:** unlinking calls `DELETE /api/v1/wallets/{account}`. No XLM was involved and no transaction was signed.

## Production commit

| Reading | Value |
| --- | --- |
| `GET /api/v1/health` `commit`, read at 12:21 WIB (after the click) | `4210757` |
| `GET /api/v1/health` `commit`, read before the click | undetermined: not recorded with the run |
| `GET /api/v1/health` `commit` when this record was written (2026-11-04, later) | `b8f69e4` |

The checklist asks for a reading before the first step and one after the last; only the later one was taken, so "the API did not change during the run" is not shown by this record. The unlink control is web-only (#574, `9c1ad2b`) and was already in `/assets/login.js` on 2026-11-02, before the run. The `DELETE /wallets/{account}` route is the one the page called; whether the API deploy that moved production from `4210757` to `b8f69e4` touched it is not something this record establishes. The pass is a statement about `4210757` and the bundle served at 12:21 WIB.

## What was recorded (Tih's report)

| Item | Status |
| --- | --- |
| After "Unlink", the page read "Unlinked `GC7YKP…YZ2IIL` from this account. Unlinking does not revoke an allowance. It stays on the chain until you revoke it or it expires." | PASS |
| That text carried the link "Revoke it on the allowance page" | PASS |
| The link opened `/allowance/`; the page claims no revoke and shows the disabled "Revoke allowance" control with "The engine's spender address is not published yet: it waits on the engine key work." | PASS |
| After a reload of `/login/` (address bar visible), the session note read "Signed in as `<email>`. No wallet linked." | PASS |
| Any sentence saying the allowance was revoked, cancelled or made safe | none seen |
| Screenshots: unlink result, `/allowance/`, `/login/` after the reload | undetermined: Tih has said he will send three; none were in this folder when this record was written |
| Whether an allowance for this wallet existed on chain during the run | undetermined: not stated. The "Unlinking does not revoke" sentence is what was checked, not an allowance |
| 409 (wallet pays for a watch item) and 404 (not linked) answers on production | not exercised here; driven only against a local build with `fetch` stubbed (#574), which is not production evidence |

## Wallet linking and the card: what was left

From the 5b record, `PH2-E3-01` listed five items:

1. Link by signing a challenge: done (5b).
2. Linked wallet shown in the session note: done (5b).
3. A way to reach `/login/` from the site: done ("Sign in" in the dashboard nav, 2026-10-30).
4. Unlink control: done (#574) and now clicked on production (this run).
5. Re-link after reactivation (`linkedAt` reset, `docs/API.md` §4/§10): not exercised in a run. undetermined. It is the same "Link this wallet" button as 5b and is covered on the API side by `apps/api/test/reactivation.pglite.test.ts` (#454); the card's wording ("email + wallet linking", "the UI never suggests an email session can move money") does not require it.
