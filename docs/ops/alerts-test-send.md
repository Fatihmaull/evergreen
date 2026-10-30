# PH2-E2-06 preview test send (Stage B)

Sends the per-user alert templates (`apps/api/src/alerts/templates.ts`) to an
allowlisted test inbox. **Preview only. No outbox table needed. Nobody else
receives anything.** Code: `apps/api/src/alerts/test-send.ts`, runner:
`apps/api/scripts/alert-test-send.mjs`.

## Guards (all must pass, otherwise dry run and no request leaves)

1. `ENVIRONMENT` is exactly `preview`.
2. `ALERTS_SEND` is exactly `send`.
3. `ALERTS_TEST_ALLOWLIST` is non-empty (comma-separated addresses).

## Variables (names only; values are never committed)

| Name | Kind | Note |
|---|---|---|
| `ENVIRONMENT` | plain | `preview` |
| `ALERTS_SEND` | plain | `send` for the one run only |
| `ALERTS_TEST_ALLOWLIST` | secret | holds addresses; never log or echo |
| `EMAIL_API_KEY` | secret | the preview Resend key (`docs/ops/secrets.md`) |
| `EMAIL_FROM` | plain | the existing sender (`apps/api/wrangler.jsonc`) |

## How DevOps runs it (needs Fatih's "ya" for the send)

From a fresh checkout of `main`, in a shell where the two secrets come from
your secret store (not typed into history, not pasted anywhere):

```sh
pnpm build
ENVIRONMENT=preview ALERTS_SEND=send EMAIL_FROM=<existing sender> \
  ALERTS_TEST_ALLOWLIST=... EMAIL_API_KEY=... \
  node apps/api/scripts/alert-test-send.mjs <runId> [kind ...]
```

- `<runId>`: any label, e.g. `2026-10-31a`. The same runId re-sent within 24 h
  is deduped by Resend's idempotency key; use a new one to send again.
- `kind`: optional subset (e.g. `testnet_reset refund_delayed`); default is all 10.
- Output is one JSON line: `{"action":"sent","recipients":N,"sent":N,"failed":N}`
  or a `dry-run` with its reason. No addresses are printed.

Evidence to report: the JSON line, and that the inbox received the emails with
a `[TEST]` subject in text and HTML. Do not paste the addresses.
