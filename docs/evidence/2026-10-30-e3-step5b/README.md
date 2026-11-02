# PH2-E3-01 — step 5b (link a Freighter wallet) on production, 2026-10-30

- **Result: PASS**, reported by Tih (Fatih), on the production host `https://evergreen-stellar.pages.dev/login/`, at **11:31 WIB (UTC+7), 2026-10-30**.
- **Wallet:** Stellar **testnet** account `GC7YKP…YZ2IIL`. Only this shortened form was reported; the full account is not recorded here and is undetermined from this record.
- **Steps run:** [`docs/PH2-E3-LOGIN-CHECKLIST.md`](../../PH2-E3-LOGIN-CHECKLIST.md), step 5b: "Connect Freighter", then "Link this wallet", then a reload.
- **Signature:** linking signs a challenge transaction with sequence number 0, which the network rejects. It moves nothing; no XLM was involved.

## What is and is not recorded

| Item | Status |
| --- | --- |
| "Linked: `G…`" after "Link this wallet" | PASS (Tih's report) |
| Session note "Signed in as … Linked: `GC7YKP…YZ2IIL`" | PASS (Tih's report) |
| Still linked after a reload | undetermined: not stated separately in the report |
| Screenshots (after step 2, after the reload) | undetermined: none are in this folder |
| Production commit read from `GET /api/v1/health` before and after | undetermined: not recorded with the run |
| Exact Freighter prompt text | undetermined |

## Wallet linking: what is left (per `BACKLOG.md` and `phase-2/kickoff/WEBF.md`)

1. **Link by signing a challenge:** done (this run).
2. **Linked wallet shown in the session note:** done (this run).
3. **A way to reach `/login/` from the site:** the checklist noted there was no link. Added in the same pull request as this record: "Sign in" under "Your account" in the dashboard nav (WEBF path, `apps/web/src/chrome.mjs`).
4. **Unlink control:** the client call exists (`unlinkWallet` in `apps/web/src/lib/login.ts`), but the button stays off the page until the revoke screen (`PH2-E3-05`, WEBR, Rakha) sits beside it, because an allowance on chain does not go away when the link does (`docs/API.md` §4). Blocked on Rakha, noted on #533.
5. **Re-link after reactivation** (`linkedAt` reset, `docs/API.md` §4/§10): same "Link this wallet" button; not exercised in a run. undetermined.

The card stays `[~]` until item 4 lands or Fatih/PM decides the card closes without it.
