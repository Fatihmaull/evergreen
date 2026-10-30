# Secrets

**Names only. No value is ever written in this repo, a PR, chat or argv.** A value is typed at a prompt or passed by naming an environment variable. `wrangler secret list` prints names and types and nothing else, which is all that is ever recorded.

## Inventory now (read 2026-10-30 16:40 WIB, names only)

Read from the Cloudflare Workers secrets API, `gh secret list`, `gh variable list`, the GitHub environments API and the Pages project config.

| Where | Names |
|---|---|
| Worker `evergreen-api` (production) | `CHALLENGE_SIGNING_KEY`, `DATABASE_URL`, `EMAIL_API_KEY`, `SIGNIN_CODE_PEPPER` (all four now **set**; the 2026-10-27 table below said absent) |
| Worker `evergreen-api-preview` | `CHALLENGE_SIGNING_KEY`, `DATABASE_URL`, `EMAIL_API_KEY`, `SIGNIN_CODE_PEPPER` |
| Worker `evergreen-scheduler-preview` | `DATABASE_URL`, `TICK_TOKEN` (**`ALERTS_ALLOWLIST` is not set**, unlike the E2-06 section below) |
| Production scheduler Worker | none deployed |
| GitHub repo secrets | `CLOUDFLARE_API_TOKEN`, `NOTION_TOKEN` |
| GitHub repo variables | `CLOUDFLARE_ACCOUNT_ID` |
| GitHub environment `production` | no secrets, no variables |
| Pages `evergreen-stellar` env (preview and production) | `NODE_VERSION` (plain text) only |

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

**Production prerequisites (none met on 2026-10-27):**

1. The `production` approval gate ([`deploy.md`](deploy.md)). **Met.**
2. A least-privilege application DB role with **append-only** grants on the fee ledger, agreed with Rakha on #385. Not done: only `neondb_owner` exists.
3. A production email sender domain. Deferred: not bought.
4. Fatih's "ya".

Setting a secret (value typed at the prompt, never in argv):

```bash
wrangler secret put <NAME> --env preview      # preview
wrangler secret put <NAME>                    # production; Fatih's go first
```

Rotating `SIGNIN_CODE_PEPPER` makes every outstanding sign-in code unverifiable (they are stored under the HMAC key, so they expire within their 10 minutes anyway). Rotating `CHALLENGE_SIGNING_KEY` invalidates outstanding wallet challenges. Neither moves money.

## Alert sending: `ALERTS_SEND` (PH2-E2-06; Fatih, relayed 2026-10-29 16:25 WIB)

The kill switch from [`docs/PH2-E2-06-ALERTS-DESIGN.md`](../PH2-E2-06-ALERTS-DESIGN.md) (#485, `e5347cb`): sending is on **only when `ALERTS_SEND` is exactly `send`**. Any other value, including unset, empty, `SEND` or added whitespace, is dry-run.

| Worker | `ALERTS_SEND` | `ALERTS_ALLOWLIST` |
|---|---|---|
| scheduler, **preview** | **left unset** (dry-run) | stored as a Worker **secret**, so no address is in the repo |
| scheduler, **production** | **nothing set**; `send` is set only after **all three** below | not set |

Production gets `ALERTS_SEND=send` only after **all** of:

1. The E2-06 alert code is merged.
2. The production secrets are installed (waits on Fatih's "ya" and the Neon Launch plan).
3. A production sender domain exists.

Until then nothing is set in production. Note: the design calls both names DevOps settings, not secrets; the allowlist is kept as a secret anyway because it holds email addresses.

## Residual risk: the Cloudflare token is repo-level (accepted, Fatih, 2026-10-27)

`CLOUDFLARE_API_TOKEN` is a **repository** secret, not an environment secret. Two consequences, both known and accepted:

1. **It is visible to the preview job of every same-repo PR.** A pull request can edit the workflow it runs under, so a collaborator's branch can, in principle, use that token to run `wrangler` against the account, including deploying to production. The `production` Environment gate stops an **accidental** production deploy; it does not stop a **deliberate** one made with the token directly.
2. **It cannot be scoped to one Worker.** Cloudflare API tokens are scoped to account permissions, not to individual Workers, so the token that deploys the API Worker can also touch the account's other Workers and Pages projects (the account also hosts three unrelated Pages projects).

**Why it is accepted:** only trusted collaborators can push branches to this repo (Fatih, and Rakha with write access), and fork PRs never run the preview job (`head.repo.full_name == github.repository`). The risk is people, not strangers.

**What would reduce it, if the trade changes:** move the token into the `production` Environment (preview then needs a second, separately scoped token), or restrict who has `write`. Both are Fatih's decisions; neither is made.

**The rule that carries the rest:** [`AGENTS.md`](../../AGENTS.md) hard rule 11. All of Fatih's agents act as `Fatihmaull`, and GitHub cannot tell them apart from him.
