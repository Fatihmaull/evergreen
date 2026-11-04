# Secrets

**Names only. No value is ever written in this repo, a PR, chat or argv.** A value is typed at a prompt or passed by naming an environment variable. `wrangler secret list` prints names and types and nothing else, which is all that is ever recorded.

## Inventory now (read 2026-11-01 15:25 to 15:35 UTC, names only)

Read with `wrangler secret list --name <worker>`, `gh secret list`, `gh variable list` and the GitHub environments API. Secret **values** cannot be read and are never recorded.

| Where | Names |
|---|---|
| Worker `evergreen-api` (production) | `ALERTS_ALLOWLIST`, `ALERTS_SEND`, `CHALLENGE_SIGNING_KEY`, `DATABASE_URL`, `EMAIL_API_KEY`, `SIGNIN_CODE_PEPPER` (six). The four auth secrets have been set since 2026-10-29. Last secret change: 2026-10-31 10:41 UTC. |
| Worker `evergreen-api-preview` | `ALERTS_ALLOWLIST`, `CHALLENGE_SIGNING_KEY`, `DATABASE_URL`, `EMAIL_API_KEY`, `SIGNIN_CODE_PEPPER` (no `ALERTS_SEND`) |
| Worker `evergreen-scheduler` (**production**, deployed 2026-10-31 04:33 UTC by [run 41168994480](https://github.com/Fatihmaull/evergreen/actions/runs/41168994480), approved by `Fatihmaull`) | `DATABASE_URL` only. **No `TICK_TOKEN`**, as required: production ticks from its cron, and `TICK_TOKEN` is the preview-only switch that turns on `POST /tick`. |
| Worker `evergreen-scheduler-preview` | `DATABASE_URL`, `TICK_TOKEN` |
| GitHub repo secrets | `CLOUDFLARE_API_TOKEN` (updated 2026-10-23), `NOTION_TOKEN` (updated 2026-09-12) |
| GitHub repo variables | `CLOUDFLARE_ACCOUNT_ID` |
| GitHub environment `production` | required reviewer, no secrets, no variables, admin bypass off |
| Pages `evergreen-stellar` | `NODE_VERSION` only (read 2026-10-30 from the project config; not re-read on 2026-11-01, there is no token-free way to read it) |

**Differences from what this file said before 2026-11-01:**

- **`ALERTS_SEND` and `ALERTS_ALLOWLIST` exist on production.** This page said nothing was set there. `ALERTS_SEND` is a **secret**, not the plain setting the design describes. **K4 (Fatih, 2026-11-02): production's `ALERTS_SEND` is exactly `send`, set by Fatih himself** (the secret change of 2026-10-31 10:41 UTC), so the operator emails (F10, F11) go to the allowlist for real. User alerts stay off until 0011 and CEF's dispatcher. See [Alert sending](#alert-sending-alerts_send-ph2-e2-06-fatih-relayed-2026-10-29-1625-wib).
- **The production scheduler Worker is deployed.** This page said "none deployed".
- **Which role each production Worker connects as** is not readable from a secret's name. Read from the database instead, on 2026-11-01 15:30 UTC (see [`neon-migrations.md`](neon-migrations.md#which-role-each-production-worker-uses)): at the 15-minute cron the production database held pooled sessions as **`eg_scheduler`** and **`eg_api`**, and none as the owner. That is evidence for least privilege on both, **not a read of the secret**. **K5 (Fatih, 2026-11-02): Fatih switched the production `DATABASE_URL` to the `eg_api` and `eg_scheduler` roles himself, around 2026-10-31**; the sample agrees with him, and the exact time was not recorded.

## Inventory (read 2026-10-27, historical)

### API Workers (`wrangler secret list [--env preview]`)

| Name | What it is | `evergreen-api-preview` | `evergreen-api` (production) | Read by |
|---|---|---|---|---|
| `DATABASE_URL` | Neon connection string. Preview connects as the **owner** role. | set | **deliberately absent** | `apps/api/src/auth/mount.ts` |
| `SIGNIN_CODE_PEPPER` | HMAC key sign-in codes are stored under | set | **deliberately absent** | same |
| `EMAIL_API_KEY` | Resend API key (the engine's `EmailChannel` uses the same name) | set | **deliberately absent** | same |
| `CHALLENGE_SIGNING_KEY` | `S…` seed of the unfunded SEP-10 challenge-signing key | set | **deliberately absent** | same |

Until all four are set, the auth routes answer `503 UPSTREAM_UNAVAILABLE`; that is what production does today, on purpose.

**Correction to the 2026-10-26 handoff:** it listed `EMAIL_FROM` as a preview secret and omitted `CHALLENGE_SIGNING_KEY`. Reality: `EMAIL_FROM` is a plain variable (`wrangler.jsonc`, `env.preview.vars`), and `CHALLENGE_SIGNING_KEY` is set on preview. The code reads exactly these seven bindings: `DATABASE_URL`, `SIGNIN_CODE_PEPPER`, `EMAIL_API_KEY`, `CHALLENGE_SIGNING_KEY`, `DASHBOARD_ORIGIN`, `EMAIL_FROM`, `ENVIRONMENT` (plus `DEPLOY_COMMIT` once #460 merges).

### Plain variables (not secret, but they live in config, never the dashboard)

| Name | Production | Preview | Where |
|---|---|---|---|
| `ENVIRONMENT` | `production` | `preview` | `apps/api/wrangler.jsonc` |
| `DASHBOARD_ORIGIN` | `https://evergreen-stellar.pages.dev` | `https://preview.evergreen-stellar.pages.dev` | same; one exact origin, no wildcard |
| `EMAIL_FROM` | `alerts@mail.evergreenstellar.biz.id` | `alerts@mail.evergreenstellar.biz.id` | top-level `vars` / `env.preview.vars` |
| `DEPLOY_COMMIT` | the deployed SHA | the PR head SHA | injected by the workflow, not committed |
| `HEARTBEAT_STALE_SECONDS` | `2700` (3 x the 900 s tick) | `900` | `apps/api/wrangler.jsonc`; the F11 check treats a newer `scheduler_ticks` row than this as fresh |
| `TESTNET_RESET_LOOKBACK_TICKS` | `12` | `12` | same |
| `THRESHOLD_FLOOR_LEDGERS` | `1037` | `1037` | same |
| scheduler `ENVIRONMENT`, `DEPLOY_COMMIT` | `production`, the deployed SHA | `preview`, the dispatched SHA | `apps/scheduler/wrangler.jsonc`; `scheduler-deploy.yml` injects the SHA |

### GitHub

| Name | Kind | Purpose |
|---|---|---|
| `CLOUDFLARE_API_TOKEN` | repository **secret** (updated 2026-10-23) | `wrangler deploy` in both API jobs |
| `CLOUDFLARE_ACCOUNT_ID` | repository **variable** | account for `wrangler`; an identifier, not a credential |
| `NOTION_TOKEN` | repository **secret** (updated 2026-09-12) | the BACKLOG to Notion sync job in `ci.yml` |
| (none) | environment `production` has no secrets or variables of its own | |

### Logins (not secrets in the repo, listed so nobody asks for them)

| What | Who runs it | Notes |
|---|---|---|
| `wrangler login` | Fatih, in his own terminal | OAuth session on Fatih's machine; an agent using it acts as Fatih |
| `neonctl auth` | Fatih | Neon account owning the org `evergreen` (id `org-delicate-violet-65283800`); `neonctl` has its own credential store |
| `gh auth refresh -s workflow` | Fatih | the `gh` token already carries `workflow` (verified 2026-10-27: scopes `gist`, `read:org`, `repo`, `workflow`) |

## Who may set what

| Secret | Preview | Production |
|---|---|---|
| Worker secrets | DevOps, using Fatih's `wrangler` login, when a task needs it | **Only on Fatih's explicit "ya"**, and only after the prerequisites below |
| `CLOUDFLARE_API_TOKEN`, `NOTION_TOKEN` | Fatih | Fatih |
| `CHALLENGE_SIGNING_KEY` | rotated 2026-10-29 17:48 WIB by DevOps (Fatih's yes): fresh random seed, set with the secrets API (Worker version `f6bc3e7f`), public key `GAXT6OU3XSMEJ2HSYQIMAN3S7WLP6GZDNG3BW2YOW7AOYTZ6WJ5SZGE4`. The seed is kept only in the Worker and DevOps' private secrets folder, never in the repo | a **different** key, never the preview one |

**Production prerequisites, as they stand on 2026-11-01** (the 2026-10-27 version of this list had none met):

| # | Prerequisite | State |
|---|---|---|
| 1 | The `production` approval gate ([`deploy.md`](deploy.md)) | **Met** since 2026-10-26 |
| 2 | A least-privilege application DB role with **append-only** grants on the fee ledger | **Met.** Roles `eg_api` and `eg_scheduler` exist on both branches (2026-10-29); 0008's triggers refuse `UPDATE`, `DELETE` and `TRUNCATE` on `fee_ledger` for every role; and **Fatih switched the production Workers' `DATABASE_URL` to those roles himself around 2026-10-31 (K5)**, which the 2026-11-01 session sample confirms ([`switch-database-url-eg_api.md`](switch-database-url-eg_api.md), marked executed). **One known gap, tracked:** `eg_scheduler` can still name `ticked_at` on `scheduler_ticks` until 0010 ([#570](https://github.com/Fatihmaull/evergreen/pull/570), the revoke is in the file, unmerged) is applied; K8: no hand `REVOKE` before then (see K1 in [`neon-migrations.md`](neon-migrations.md#open-k1-gap-eg_scheduler-can-still-name-ticked_at)). |
| 3 | A production email sender domain | **Met:** `mail.evergreenstellar.biz.id` ([#493](https://github.com/Fatihmaull/evergreen/pull/493), merged 2026-10-29), see [Alert sending](#alert-sending-alerts_send-ph2-e2-06-fatih-relayed-2026-10-29-1625-wib) |
| 4 | Fatih's "ya" | **Given.** The production secrets are installed, and Fatih confirmed that every production approval and rejection from 2026-10-29 to 10-31 was his ([`deploy.md`](deploy.md#production-approvals-2026-10-29-to-2026-10-31)). |

Setting a secret (value typed at the prompt, never in argv):

```bash
wrangler secret put <NAME> --env preview      # preview
wrangler secret put <NAME>                    # production; Fatih's go first
```

Rotating `SIGNIN_CODE_PEPPER` makes every outstanding sign-in code unverifiable (they are stored under the HMAC key, so they expire within their 10 minutes anyway). Rotating `CHALLENGE_SIGNING_KEY` invalidates outstanding wallet challenges. Neither moves money.

## Alert sending: `ALERTS_SEND` (PH2-E2-06; Fatih, relayed 2026-10-29 16:25 WIB)

The kill switch from [`docs/PH2-E2-06-ALERTS-DESIGN.md`](../PH2-E2-06-ALERTS-DESIGN.md) (#485, `e5347cb`): sending is on **only when `ALERTS_SEND` is exactly `send`**. Any other value, including unset, empty, `SEND` or added whitespace, is dry-run.

Only `apps/api/src/alerts` reads `ALERTS_ALLOWLIST`, so it lives on the API Worker, not the scheduler.

| Worker | `ALERTS_SEND` | `ALERTS_ALLOWLIST` |
|---|---|---|
| `evergreen-api-preview` | **not set** (dry-run), checked 2026-11-01 | Worker **secret**, set 2026-10-30 (comma-separated operator emails), so no address is in the repo |
| `evergreen-scheduler-preview`, `evergreen-scheduler` (production) | not set | not set (the scheduler code does not read either) |
| `evergreen-api` (production) | **exactly `send`** (K4, Fatih, 2026-11-02), set by Fatih as a secret (the last secret change on the Worker is 2026-10-31 10:41 UTC). The value cannot be read back; this is Fatih's statement, and the API cron's logs cannot show it (a healthy heartbeat returns before `ALERTS_SEND` is consulted). | a secret named `ALERTS_ALLOWLIST` exists (contents unreadable): the operator addresses F10 and F11 emails go to |

**Production sends operator emails for real (K4).** The F10 testnet-reset check and the F11 stale-heartbeat check run in the API Worker's 15-minute cron; when one fires, the email goes to the allowlist. **User alerts stay off** until migration 0011 ([#571](https://github.com/Fatihmaull/evergreen/pull/571)) is applied and CEF's dispatcher lands. This replaces the rule this page used to state ("nothing set in production"); the design's own rule, that production sending needs Fatih's ya, is met by K4.

`ALERTS_SEND=send` is allowed in production only when **all** of these hold. State read 2026-11-01, updated 2026-11-04 with K4:

| Precondition | State | Evidence |
|---|---|---|
| The E2-06 alert code is merged | **Partly.** The operator checks (F10, F11) and the user-alert dispatch code are on `main`. **User alerts are not complete:** they need the outbox and preference tables, which are **0011 ([#571](https://github.com/Fatihmaull/evergreen/pull/571)), open, applied nowhere**; #568 says user alerts are still off. | `apps/api/src/alerts/`; `gh pr view 571` |
| Production secrets installed | **Met** | `wrangler secret list --name evergreen-api` |
| A production sender domain | **Met** | `mail.evergreenstellar.biz.id`. DNS read over DNS-over-HTTPS (the machine's own resolver refuses everything): DKIM key at `resend._domainkey.mail.…`, SPF `v=spf1 include:amazonses.com ~all` and an MX to Amazon's feedback endpoint at `send.mail.…`, and DMARC at the parent domain `v=DMARC1; p=none` (**monitoring only, not enforcing**). Resend's own "verified" status is not readable by DevOps (the key is a Worker secret). |
| 0009 applied, so the F11 check can read `scheduler_ticks` | **Met** | `eg_api` has `SELECT` on `scheduler_ticks` on both branches (2026-11-01) |
| The production scheduler is ticking | **Met** | 139 rows from 2026-10-31 04:45 to 2026-11-01 15:15 UTC, one every 15 minutes |
| `HEARTBEAT_STALE_SECONDS` set on production | **Met** | `2700` |
| An operator channel other than email for F16 (Telegram) | **Not met** | not wired, per `docs/PH2-E4-05-FAILURE-MODES.md` |
| **Fatih's explicit "ya" for production sending** | **Given: K4** (Fatih, 2026-11-02): `ALERTS_SEND` is exactly `send`, set by him | the statement; the secret's value is unreadable |

The production API cron is running: the tail on 2026-11-01 15:30:16 UTC showed `alerts.f17_f18_config` (`problem: false`), `alerts.f11_heartbeat` (`action: none`, `reason: fresh`) and `alerts.f10_testnet_reset` (`action: none`, `reason: no_decrease`), outcome `ok`.

Preview test send ([`alerts-test-send.md`](alerts-test-send.md), #545, `08e5114`): the runner reads `ALERTS_TEST_ALLOWLIST` and `ALERTS_SEND` from the **local shell env** of the one run, not from Worker secrets. `ALERTS_SEND` is not set on any Worker (checked 2026-10-30). Note: the design calls both names DevOps settings, not secrets; the allowlist is kept as a secret anyway because it holds email addresses.

## Residual risk: the Cloudflare token is repo-level (accepted, Fatih, 2026-10-27)

`CLOUDFLARE_API_TOKEN` is a **repository** secret, not an environment secret. Two consequences, both known and accepted:

1. **It is visible to the preview job of every same-repo PR.** A pull request can edit the workflow it runs under, so a collaborator's branch can, in principle, use that token to run `wrangler` against the account, including deploying to production. The `production` Environment gate stops an **accidental** production deploy; it does not stop a **deliberate** one made with the token directly.
2. **It cannot be scoped to one Worker.** Cloudflare API tokens are scoped to account permissions, not to individual Workers, so the token that deploys the API Worker can also touch the account's other Workers and Pages projects (the account also hosts three unrelated Pages projects).

**Why it is accepted:** only trusted collaborators can push branches to this repo (Fatih, and Rakha with write access), and fork PRs never run the preview job (`head.repo.full_name == github.repository`). The risk is people, not strangers.

**What would reduce it, if the trade changes:** move the token into the `production` Environment (preview then needs a second, separately scoped token), or restrict who has `write`. Both are Fatih's decisions; neither is made.

**The rule that carries the rest:** [`AGENTS.md`](../../AGENTS.md) hard rule 11. All of Fatih's agents act as `Fatihmaull`, and GitHub cannot tell them apart from him.
