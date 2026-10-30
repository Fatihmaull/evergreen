# Observability: Workers Logs

**Status (2026-10-28):** enabled for the API Worker by [#431](https://github.com/Fatihmaull/evergreen/pull/431) (merged `868caea`), **console output only**. On `evergreen-api-preview` since the PR's own deploy; on `evergreen-api` (production) since run 40648815806, approved by Fatih and finished 2026-10-28 07:34 UTC (production `/health` served `commit: 868caea…` afterwards). Approved by Fatih 2026-10-28, who **accepted invocation logs being off**: the CSRF token in a request header is reason enough. Keep them off unless he decides otherwise.

**Read back 2026-10-29** (Cloudflare API, `evergreen-api` script settings): observability `enabled: true`, `head_sampling_rate: 1`; logs `enabled: true`, `persist: true`, `invocation_logs: false`, sampling 1; traces `enabled: false`. Workers Logs are live on production.

## What is logged

`apps/api/wrangler.jsonc` sets, in both environments:

```jsonc
"observability": { "enabled": true, "head_sampling_rate": 1, "logs": { "invocation_logs": false } }
```

| | Logged? | Notes |
|---|---|---|
| `console.*` output | **yes**, 100% (`head_sampling_rate: 1`) | In `apps/api/src` and `functions/` the only call is `consoleLogger` in `auth/mailer-error.ts`: one JSON line, `auth.email_send_failed`, from a **fixed allowlist** |
| Invocation logs (one record per request) | **no, deliberately** | see below |
| Uncaught exceptions | yes (platform), but the router **swallows** database and mail exceptions and answers 503 without logging them | so none are expected |

The allowlist (`EmailSendFailedLog`): `event`, `provider`, `kind`, `reason`, `httpStatus`, `providerErrorName`, `fetchErrorName`, `fetchStage`, `elapsedMs`, `keyLength` (a bucket), two booleans about the key's shape, `senderDomain`, `recipientDomain`, `environment`, `rayId`. **The recipient appears as a domain only; no address, key, code or provider message is in it.**

### Why invocation logs are off

The draft enabled them. On 2026-10-28 `wrangler tail evergreen-api-preview` was run against the preview Worker while it was sent requests with dummy header values (no real credential):

| Request header | Visible in the Worker event |
|---|---|
| `Cookie`, `Authorization` | **redacted** by the platform |
| **`X-Evergreen-CSRF`** (a session's CSRF token) | **visible, verbatim** |
| any other custom header | visible |
| `cf-connecting-ip` (client IP), `user-agent` | present |

Cloudflare's Workers Logs page does not say which request fields an invocation record keeps, so persisting them for 7 days on an auth API could not be shown safe. With them off, nothing but the allowlisted line is persisted. Request counts, statuses and errors stay in the Worker's metrics. **Turning them back on is one line** (`invocation_logs` to `true`); do that only after reading a persisted invocation record in the dashboard, and decide whether the CSRF token and IP may sit in logs.

## The rule

**No secret, and no full email address, may appear in a log line.** Today that holds by construction (the allowlist, plus swallowed exceptions, plus no route that puts an email in a URL; auth routes are `POST` with bodies). It must be **re-checked whenever the code that logs changes**, and after any change to the observability setting, because persisting logs turns a transient line into a stored one. A new `console.*` in `apps/api` or `functions/` is a change to this rule and gets a DevOps look.

### Verification record

| Check | Result |
|---|---|
| Live line on preview, via `wrangler tail`: a refused sign-in to `logcheck-…@example.invalid` | `auth.email_send_failed`, `reason: testing_recipient_restricted`, `httpStatus: 403`, **`recipientDomain: example.invalid`**; the full address appears **nowhere** in the event |
| Persisted line visible in the dashboard (**Fatih**) | **pending.** Marker request 2026-10-28T07:12:51Z, recipient local part `logcheck-c3e9a1`. Expect one `auth.email_send_failed` line and **no hit** for `logcheck-c3e9a1` |
| Same on production | **cannot be shown by a log line yet.** Production has no auth secrets, so sign-in answers 503 before the mailer runs and never writes `auth.email_send_failed`; with invocation logs off, production logs stay empty until production auth is live. The check is the **setting**: the Worker's Settings, Observability shows Workers Logs enabled: **confirmed by API read-back 2026-10-29** (see Status). The first real line is the check that matters once the production secrets exist |

Reading them: dashboard, Workers & Pages, the Worker, **Observability**, Logs. Wrangler has no query command; `wrangler tail <worker> --format json` is a **live** view only (and shows the platform's event, not the stored one).

## What it costs

From Fatih's dashboard (Observability, Usage; billing cycle 2026-10-06 to 2026-11-05; read 2026-10-28):

| | |
|---|---|
| Included log ingestion | **50 GB a month** |
| Included log storage | **10 GB-month** |
| Usage so far | **0 GB** |
| **Overage** | volume-based billing beyond the included amounts **starts 2026-12-01** |
| Retention | 7 days on Workers Paid (the maximum), 3 days on Free (Cloudflare's Workers Logs page; the plan itself is not readable from the CLI) |

Cloudflare's older Workers Logs page quotes 20 million events a month then $0.60 per million, and says pricing moves to Observability pricing on 2026-12-01. **The dashboard's GB figures are the ones this project follows**; the events figure is the old model. With invocation logs off, volume is a handful of lines (only sign-in send failures), so the allowance is not a concern.

## Budget alert

Fatih adds a Budget Alert himself (Workers & Pages, Usage, Add Budget Alert; **$5 was the suggestion**). Billing settings are his; DevOps does not change them. **Confirmed 2026-10-28, relayed through the PM: the Cloudflare Budget Alert is installed.** The amount was not relayed (`undetermined`; not readable from the CLI).
