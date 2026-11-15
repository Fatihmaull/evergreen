# PH2-E4-09: operator channel test

How an operator checks that the production (or preview) API Worker can send operator email. The send is the same path as F14, F16, F17 and F18 (`apps/api/src/alerts/operator-test.ts`, `resendOperatorTransport` in `apps/api/src/alerts/heartbeat.ts`).

This is a public API route. Fatih reviews it before merge. Spec: [`API.md`](API.md) §6b.

## What it sends

One email per address in the Worker secret `ALERTS_ALLOWLIST`, and to nobody else.

- Subject: `Evergreen operator alert: TEST`
- Body: fixed text that starts with `TEST`. It is not a user alert. It has no account, no address, and no secret.
- The request has no recipient, subject, or body parameter. A query string or a JSON body is ignored.

`ALERTS_SEND` must be exactly `send`. Anything else, including a different case or surrounding spaces, does not send. Preview does not have `ALERTS_SEND` set (`docs/ops/secrets.md`), so a preview call dry-runs. Production is exactly `send` (K4, Fatih, 2026-11-02), so a production call sends real mail once the route exists.

If `EMAIL_API_KEY` or `EMAIL_FROM` is missing or blank, the Worker logs `action: 'email_channel_down'` and does not call Resend.

## When the route exists

`POST /api/v1/operator/alert-test` answers `404` with the ordinary unknown-route body unless the API Worker has `TICK_TOKEN` set to a non-empty string. That is the same rule as the preview scheduler's `POST /tick`. The API Worker does not have this secret today. Whether DevOps has since set it is **undetermined** until someone reads the Worker's secret list. This page does not set it.

The name is the existing preview-scheduler bearer. It is not a new secret name. The value on the API must not be the preview scheduler's value: that value is the GitHub secret `TICK_TOKEN`, and copying it would let the scheduler tick credential send operator mail. Production `evergreen-scheduler` must still have no `TICK_TOKEN`.

A call that exists and whose bearer does not match is `401`. A session cookie is not enough.

## How to call it

Public base: the dashboard origin plus `/api/v1` (`docs/API.md` §1 option B). Production origin `https://evergreen-stellar.pages.dev`. Preview origin `https://preview.evergreen-stellar.pages.dev`. The Pages Function forwards the request, including `Authorization`, to the API Worker. `workers_dev` is false on the API Worker, so there is no `workers.dev` host in `apps/api/wrangler.jsonc`.

Do this only after Fatih has agreed to bind `TICK_TOKEN` on that Worker. Put the token in a file the shell history does not keep. One line, no extra newline in the token:

```
Authorization: Bearer <the API Worker's TICK_TOKEN>
```

```bash
curl --silent --show-error --proto '=https' --request POST \
  --header @token-header-file \
  --max-time 30 \
  https://evergreen-stellar.pages.dev/api/v1/operator/alert-test
```

No `--data`. A body would be ignored, and omitting it keeps a recipient from being typed by habit.

A send answers `200` with `{ "action": "sent", "recipients": <count> }`. The count is not the addresses. The same UTC hour on the same isolate answers `{ "action": "dry-run", "reason": "hour_deduped" }`. Resend keeps the key `operator-test:<YYYY-MM-DDTHH>/<recipient hash>` for 24 hours, so another isolate in that hour collapses to the same send. The hash is not the address.

## What the log shows

Workers Logs, event `alerts.operator_test`. `action` is `sent`, `send_failed`, `dry-run`, or `email_channel_down`. A failed recipient adds `httpStatus` or `errorName` and nothing else. The line has no address, no API key, and no bearer token.

Whether a TEST email has been accepted by Resend on production is **undetermined**. This change does not send one.

## What this does not do

- It does not run from `scheduled()`. The 15-minute cron does not send TEST mail.
- It does not send a user alert, and it does not read the database.
- It does not add a GitHub workflow. A `workflow_dispatch` job would run outside the Worker, and the repository secrets do not include `EMAIL_API_KEY` or `ALERTS_ALLOWLIST`, so it would not prove this Worker's channel.
