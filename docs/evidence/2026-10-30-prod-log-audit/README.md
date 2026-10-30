# PH2-E0-13: production log audit for secrets and full email addresses (2026-10-30 16:50 WIB)

**Query:** Workers Observability `POST /accounts/<account>/workers/observability/telemetry/query`, `view: events`, `limit: 2000`, filter `$metadata.service eq <service>`, timeframe the last 72 h (2026-10-27 ~16:50 to 2026-10-30 ~16:50 WIB). The patterns scanned over each event's `source` and `$workers` fields:

- email address `[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}`
- `postgres(ql)://` URL
- Stellar seed `S[A-Z2-7]{55}`
- Resend key `re_…`
- `Bearer …`
- `eg_session=` cookie

| Service | Events in 72 h | Matches |
|---|---|---|
| `evergreen-api` (production) | **0** | none, because there were no events to scan |
| `evergreen-api-preview` (same code, for comparison) | 429 (2026-10-28 14:07 to 2026-10-30 16:30 WIB): `alerts.f11_heartbeat` 216, `alerts.f10_testnet_reset` 198, `auth.email_send_failed` 4, request-line logs 11 | **0** for every pattern |

**Why production has 0 events:** Workers analytics (`workersInvocationsAdaptive`, last 72 h) shows **112 requests, 0 errors** on `evergreen-api`. `apps/api/wrangler.jsonc` has `invocation_logs: false`, and production has no cron, so the only code paths that log are the cron handler and a failed sign-in email. Neither ran on production in this window. So "no secrets in prod logs" holds for the 72 h only because nothing was logged. Whether a production `auth.email_send_failed` line stays clean is shown by the preview events below, not by production itself.

**Code read** (`apps/api/src`, non-test): 4 `console.*` calls.

- `index.ts:47` logs `alerts.f11_heartbeat` with the outcome.
- `index.ts:63` logs `alerts.f10_testnet_reset` with the outcome.
- `auth/mailer-error.ts:343` logs `auth.email_send_failed`. It's built by `emailSendFailedLog`, which copies only allowlisted fields: `level, event, provider, kind, reason, providerErrorName, senderDomain, recipientDomain, environment, rayId, httpStatus`. It carries the recipient's domain only, never the address. The 4 preview events confirm this.
- `auth/mount.ts:60` is a comment about the same logger.

No code fix is needed. The request-line logs on preview contain only the method and URL, which carry no query secrets.
