# Components

The recurring objects, with the values they actually render at. If you are
rebuilding one of these in another medium, these are the proportions to keep.

## The eyebrow

Space Mono, **12px**, `+0.02em`, `--ink-3`. Sentence case — **not uppercase**.
It sits above a heading and names the section, and on a documentation page it
also does the job a breadcrumb would.

Thirty-three characters of uppercase was removed on 2026-09-26 for being a
passage rather than a label. **Uppercase is still rendered in three places**,
measured on production 2026-10-15, and this file used to say there was one:

- the dashboard sidebar's group labels (`.nav-section`), three short words;
- ~~the dashboard's stat labels (`.stat-label`)~~ — **removed 2026-10-19**;
- ~~every table header row, from a global `th` rule~~ — **removed 2026-10-19**.

**One place renders uppercase now**, `.nav-section`, on the seven dashboard
routes — swept across all 31 routes on 2026-10-19. That is the intended one.
The other two were defects against the sentence-case rule and are gone; their
tracking came down from 0.06em and 0.07em to 0.02em at the same time, because
the wider figures existed for the uppercase and leave a page looking spaced-out
without it. **New work in any medium uses sentence case**, table headers
included.

## Buttons

Exactly one solid button style on the whole site.

**Primary** — filled with the foreground, text in the background colour. On the
warm surface that is a pine fill with warm-white text; on the green hero and
the dark nav it **inverts** to a warm-white fill with deep-pine text. Full
pill, `7px 14px`, 14px, `+0.01em`. A right arrow follows the label with a 7px
gap.

**Secondary** — transparent, a 1px hairline in an alpha of the foreground, same
pill and padding. Used once, beside the primary in the closing call to action.

**Inline accent link** — this is the only place the brand colour appears as
text: `--pine`, 14px, no underline, a trailing `→`, and it fades to `0.66`
opacity on hover over 200ms. Six or so appearances on a 4,700px page.

## State chips

Height ~24px, `5px 10px`, full pill, Space Mono 12px, a 7px gap. A **9px**
mark leads the label (this file said 6px until 2026-10-15; `styles.css .shape`
is 9px), and **the mark's shape differs per state** — colour is never the only
signal:

| State | Mark |
|---|---|
| healthy | circle |
| warning | triangle, 10px base × 9px |
| critical | 8px square rotated 45° |
| expired | a light square on a solid `#0f0f0f` chip |
| undetermined | hollow ring, 2px |

The expired chip is the only one that inverts: solid ink ground, warm-white
mark and text. **Its word is the entry's ending, not "expired"**: *archived*,
or *deleted* for a temporary entry (spec §8, and what renders). "Expired" is
the state's name; it is the word in the inverted cell below, not on the chip.

**Incomplete** is not a chip state of an entry: the check did not run. On the
site it is the neutral verdict panel — `--paper`, a `--rule-strong` border, no
state colour, never violet. Where it has to be drawn as a chip (a canvas, a
legend), it is a 9 × 2px bar in `--ink-2` inside a hairline outline with no
fill ([`infographic.md`](infographic.md); approved by Fatih 2026-10-18).

On pine and pine-deep the chips change: the word turns cream, the fill is the
mark at `.14`, and two marks change. See [`tokens.md`](tokens.md) § State on
dark grounds.

## Terminal

Ground `#262626`, radius **4px**, padding `clamp(20px, 3vw, 32px)`, Space Mono
12px, line-height 1.65, `+0.02em`.

**No window chrome.** No title bar, no traffic-light dots, no "Terminal"
label, no rounded card wrapper. The content is unedited output and every
decoration undoes that.

Wrapping differs by what the block holds, and the distinction is deliberate:

- **Prose output** wraps (`pre-wrap`). A terminal at any width wraps a
  130-character sentence, and the bytes are unchanged.
- **A help text or anything with aligned columns** does not wrap (`pre`,
  scrolls). Wrapping it at the text measure destroys the alignment, and those
  line breaks belong to the tool rather than to the page.

## The figure slab

The one element over 40px. Pine ground, radius 4px, padding
`clamp(28px, 4vw, 48px)`, left-aligned, three parts stacked:

1. a 12px Space Mono label in `rgba(252,249,248,.62)` — *of the rent*
2. the figure, **Newsreader 72px**, `−0.03em`, warm white — *98%*
3. a 14px caption at `rgba(252,249,248,.78)`, max 44ch, carrying the scope

The caption is not optional. A figure without its denominator is a claim
without its scope, and the scope travels with the number.

## The inverted cell

`#0f0f0f` ground, warm-white text, radius 4px. It means **expired** and it is
**emphasis, not an error state** — this product treats a contract reaching the
end of its life as a finished fact, not a failure.

Structure: a 12px mono label naming the subject, the word `expired` in
Newsreader 28px, then a small definition list of `on` / `at ledger` with mono
values.

## Tables

Hairlines only. **No card around them**, no fill, no radius on the marketing
and docs surfaces. Header row in Space Mono 12px `--ink-3`, sentence
case — and it renders that way since 2026-10-19 — with a hairline under it;
cells at 14px with a hairline under each row; numeric and identifier
cells in Space Mono, `white-space: nowrap`.

Capped at **620px** where the content is narrow — a two-column table stretched
across a 1236px container puts 91 characters on a line.

On the dashboard a table sits inside a bordered, rounded `.table-wrap` with a
4px inset, because a bordered box whose contents touch its own border reads as
a rendering fault.

## The hairline row

Four or three cells in a continuous row, divided by hairlines, **radius 0**
where the borders intersect, background transparent. One cell may invert to
`#0f0f0f` to mark the exception — that is how the four entry kinds are drawn,
with `temporary` inverted because it is the one that cannot be recovered.

## Dashboard panel

The dashboard is an instrument and is allowed panels: `--paper` fill, 1px
`--rule` border, 8px radius, `20px 22px` padding. The 8px is the dashboard's
only; see [`tokens.md`](tokens.md) § Radius. A panel holds a chart and its
source table. It is **not** a way to put text in a box — the marketing pages
have none, and the design budget holds the dashboard's count to what each page
measured at so a new one is a decision rather than drift.

## Navigation

**Marketing bar** — 52px, three zones (mark and wordmark left, exactly two
links centred, one filled pill right), solid ground, no border, no blur, and it
**scrolls away**. It does not react to scrolling in any way; below 760px the
links collapse behind a button drawn as three 18px × 1.5px bars in
`currentColor` that morph to a cross.

**Docs rail** — 260px, no fill, no border. Hierarchy comes from group headings
rather than indentation: every link sits at the same indent, and the groups are
separated by 12px Space Mono labels. The current page is `--pine`; the rest are
`--ink-3`.

**Dashboard sidebar** — 264px, pine ground, grouped. The active item is a
warm-white fill with pine text, and **only the fill marks it** — it is not also
heavier, because nothing on this site is.

**Your account** reads, in order: Watchlist, Alerts, the account item,
Allowance (shipped in #642 and #660). The account item links `/login/` and
its label follows the session: `Account` when `GET /me` answers with a
session, `Sign in` when it answers without one. Until `/me` answers, and when
it does not answer at all, the label is `Sign in`. A label that guesses
"signed in" would claim a session nobody has confirmed (decided by the
orchestrator, 2026-11-23; accepted by DES).

## Chart

Hairline bands for thresholds with their values labelled at the end of the
line; dots at real observations; a solid segment only where the record shows
nothing happened in between; a dashed segment only where a projection is
honest. Chart text is Space Mono **12px**. Marks use `--sage` for edges and
`--pine` for filled nodes.

Every dot is a recorded observation, and the build asserts the dot count
matches the observation count — because the caption says so, and a caption is
a claim the rendering has to support.

## Phase 2 components

Specified 2026-10-15 for the surfaces phase 2 adds (login, watchlist, extend,
allowance). **None of these is built yet.** They are stated here so the two web
tracks build one version rather than two. Behaviour comes from
`phase-2/PHASE2-PLAN.md`; this is appearance only. The alert-preferences
screen is specified at the end of this file (`PH2-E2-06`); that section is
the one to build.

**Text input.** As it ships on the scanner: `--paper` fill, Space Mono 14px
for addresses and IDs (Inter 14px for an email), `12px 14px` padding, 6px
radius. **One change, approved by Fatih 2026-10-18:** the border is
`rgba(15,15,15,.5)`, not `--rule-strong`.
At `.44` an input's edge measures 2.98:1 on paper, under the 3:1 a control's
boundary needs; `.5` measures 3.59:1. It is still an alpha of the foreground,
not a grey. The label sits above the field in `.field-label` (12px, `--ink-3`,
sentence case).

**Focus.** As it ships: `2px solid --pine`, offset 2px, radius 3px, on every
interactive element. Never removed, never replaced by a glow.

**Error under a field.** `--crit-ink` text at 12px, led by the critical mark (a
rotated square), saying what was wrong and what to do. Not red borders alone.

**Amounts of XLM.** Space Mono, unrounded at the precision the chain reports,
with the unit (`XLM` or `stroops`) every time. Rent and Evergreen's fee are
**always two separate lines, never one summed figure**, because they are two
separate transactions (plan §3.3). An estimate carries the word *estimate*.

**The signing step.** Before a wallet prompt opens, the page states, in plain
text and at body size: what will be signed, the amount and the destination,
and that it authorises **a payment, never access to a contract** (AGENTS.md
hard rule 3: `extendTTL` is permissionless). A dialog is a `--paper` panel with
a hairline border and 8px radius on the dashboard. No shadow, no backdrop blur;
the backdrop is `--ink` at `.30` (approved by Fatih 2026-10-18).

**Empty and loading states.** A sentence, not a skeleton: nothing shimmers
([`motion.md`](motion.md)). `reading…` in `--ink-3` until the value arrives, as
the status bar does today; on failure, the incomplete state with the endpoint named.

## Alert preferences (PH2-E2-06)

Specified 2026-11-08. CEF owns the backend. WEBF implements this screen in
`apps/web` and does not invent a route, a field, or an alert kind that is
not named here. Where the backend shape is not in the repo, this section
says **undetermined** and lists it for CEF.

The reference render of the success state is
[`source/screens/alert-preferences.html`](source/screens/alert-preferences.html),
captured at
[`source/renders/screens/alert-preferences.png`](source/renders/screens/alert-preferences.png).
The address in that picture is the stand-in `alerts-user@example.com`. It is
not a user. Production prints `user.email` from `GET /me` and nothing else.

### Where the facts come from

Only these. A fact that is not in them is not on the screen.

| Fact | Source |
|---|---|
| Preference columns `user_id`, `kind`, `enabled`, `updated_at`. Optional kinds only: `allowance_expiring`, `approaching_critical`, `extend_succeeded`. No contract column. No DELETE | `apps/api/db/0011_alert_outbox_and_prefs.sql` |
| Ten kinds. Seven required, never stored. Three optional, `defaultOn: true`. A missing preference row means on | `apps/api/src/alerts/policy.ts` `ALERT_SPECS` |
| Optional cap: 5 per 24 hours. Required alerts are not counted | `ALERT_RATE_LIMIT` in the same file |
| Email subjects, leads, and severities | `apps/api/src/alerts/templates.ts` `COPY` |
| Outbox status `pending` \| `sent` \| `failed`. `sent` means Resend accepted. Accepted is not received | `0011`; `packages/engine/src/email-channel.ts` returns `receivedInInbox: 'unverified'` |
| Channel for a user alert is email, at `users.email` | `docs/PH2-E2-06-ALERTS-DESIGN.md` §1, §4 |
| `ALERTS_SEND` is exactly `send` or the send is dry-run | `alertsMode` in `policy.ts` |
| Session payload has `user.email` and no verification field | `docs/API.md` `GET /me` |
| Watchlist list shape, for the empty-list sentence only | `docs/API.md` `GET /watchlist` → `{ items: WatchItem[] }` |

`GET` and `PATCH /me/alert-preferences` are in `docs/API.md` §6a and
`apps/api/src/alerts/routes.ts` (#603). The screen calls those two, and
`GET /me` for the address and the CSRF token, and `GET /watchlist` for the
empty-list sentence. It does not send mail. A path that is not one of those
is not a route this screen calls.

### How the constraints hold

1. **Weight 400.** Every face on this screen is 400, including the active
   sidebar item, the switches, and the headings. Hierarchy is size and colour.
   The reference sets `font-weight: 400` on the screen and `font-synthesis: none`
   so a browser cannot synthesise a bold.
2. **One dominant element.** The only text at 28px is the heading `Alerts`
   (Newsreader). Section headings are 20px. Nothing on this screen is 40px.
   There is no figure.
3. **Borders are a foreground alpha.** The one panel and the row rules use
   `--rule`, `rgba(15,15,15,.1)`. The switch's off track uses
   `rgba(15,15,15,.5)`, the input border approved 2026-10-18, because it is a
   control edge and `.44` measures under 3:1. The sidebar is a pine field and
   has no border, as the shell ships. No grey hex hairline.
4. **No new colour, face, or weight.** States use the chips in this file.
   `info` is not one of those states and gets no chip. A colour this screen
   seems to need is a decision, listed below, not a value.
5. **`body.app`.** Pine sidebar 264px, status bar, the existing nav. The
   screen's place in the nav is one item, `Alerts`, in **Your account**,
   after Watchlist. The active item is a warm-white fill with pine text,
   and only the fill marks it. The item shipped in #642. The route is
   `/dashboard/alerts/`, linked from `/docs/account/`.
6. **No motion the person did not ask for.** No entrance, no shimmer, no
   skeleton, no knob that travels. A click paints the other position on the
   next frame. Hover changes colour only, over the existing 150ms, and this
   screen's switch has no hover move. Focus is the shipping ring: `2px solid
   --pine`, offset 2px, radius 3px.
7. **Ledgers are the truth, dates are estimates.** #611 named the rule, and
   Fatih confirmed the lead times on 15 Nov 2026. The screen states the
   day as the rule and the ledger count as the estimate, with the word
   *about* on the ledger count.
   - **Persistent expiry warning.** 1 day. About 17,280 ledgers, at
     `SECONDS_PER_LEDGER` (5) in `packages/core/src/ttl.ts`. 17,280 is
     `DEFAULT_CRITICAL_LEDGERS` in `packages/core/src/health.ts` and the
     CLI's `DEFAULT_THRESHOLD_LEDGERS` in `packages/cli/src/scan.ts`.
   - **Allowance reminders.** 30, 7 and 1 days.
     `docs/adr/ADR-007-allowance-funded-hosted-engine.md` says "Renewal
     reminders go out at 30, 7 and 1 days." ADR-007 states the days, not a
     ledger count. At 5 seconds a ledger the estimates are 518,400, 120,960
     and 17,280 (days × 86,400 ÷ 5). 518,400 is that arithmetic, not a
     protocol constant. 120,960 and 17,280 are also `DEFAULT_WARN_LEDGERS`
     and `DEFAULT_CRITICAL_LEDGERS`.
   - **Temporary entries.** No expiry email during beta. Rakha's proposal
     of about 180 ledgers was considered and is deferred to post-beta. It
     is not a threshold on this screen. The only committed "about 180
     ledgers" in the repo is a 15-minute tick (`packages/core/test/scheduler-gap.test.ts`),
     not an alert threshold.
   Nothing is sent until the persistent and allowance ledgers are stored
   (#612). Still **undetermined**, and the screen says so where it has a
   sentence for it: a close of about 6 seconds, the event ids, and how often
   a saved choice is checked. `watch_items.threshold_ledgers` is the
   autopilot threshold and is not this alert's ledger.
8. **Three-state honesty.** Unknown delivery and unknown verification render
   the undetermined chip: hollow ring, `--und` / `--und-ink`, the word
   `undetermined`. Never a healthy chip, never a check. A known `sent` is
   still not healthy: Resend accepted it, and `receivedInInbox` is
   `unverified`.
9. **Absence is not health.** The sending line and the closing line both say
   that no mail in the inbox is not health. An empty watchlist is not a
   healthy contract.
10. **An email session does not move XLM.** The lead carries the approved
    sentence, "Signing in with email cannot move XLM." This page has no
    extend, approve, or revoke control, and it does not say the reader can
    extend from here.
11. **A disabled control only when the action is built and not configured
    (K28), with the reason beside it.** That case does not occur here, so
    nothing is disabled. Optional switches write a preference;
    `decideAlert` reads the preference before `ALERTS_SEND`, and
    `PgAlertPreferencesStore.set` does not consult `ALERTS_SEND`. Sending
    being off does not grey the switch. Required kinds have no switch: a
    disabled one would claim a preference exists. There is no user test-send
    in `apps/api/src`. Do not add a disabled one. Opacity `0.55` is reserved
    for a control that later qualifies, and the reason is text beside it,
    not a tooltip.

Copy passes [`claims-and-copy.md`](claims-and-copy.md). No Telegram, Discord,
Slack, or webhook is named on the screen. Email is the only user channel in
the alerts design; a Telegram module in the engine is not a preference.
No fee amount, no custody wording, no mainnet promise, no "always on".
"Stellar testnet" is in the eyebrow, "testnet only" is in the sidebar, and
the status bar says "Soroban testnet". The status bar's dot is the shell's
network readout. This page does not add a second dot, and that dot is not
an alert verdict.

### Route

`/dashboard/alerts/`. Title `Alerts — Evergreen`. The shell is the one in
`apps/web/src/chrome.mjs`: sidebar, status bar, footer "Built for Stellar,
backed by Instawards." The status bar's ledger reads `reading…` until the
live read returns. Do not bake a ledger number in.

Group labels stay the shell's one uppercase exception (`.nav-section`),
12px, weight 400, cream at `.62`. Everything this page adds is sentence case.
The eyebrow is 12px Space Mono, the dashboard label size.

### What the screen shows

One panel, then two hairline lists. The panel is the dashboard's panel
(`--paper`, 1px `--rule`, 8px radius, `20px 22px`). The lists are not panels.
Space separates them. Marketing-page cards are not used.

**Page head**

| | |
|---|---|
| Eyebrow | Account · Stellar testnet |
| Heading | Alerts |
| Lead | Optional emails can be turned off. Required ones cannot. Signing in with email cannot move XLM. |

**The one panel, labelled `Email`**

| Line | What |
|---|---|
| To | `user.email` from `GET /me`, Inter 14px. Not Space Mono: mono is for contract IDs. |
| Sending | Whether `ALERTS_SEND` is exactly `send`. Today that fact is **undetermined**. |

Do not print a sender address. Whether alerts use `EMAIL_FROM` or another
address is undetermined in the alerts design.

**Optional.** Three switches, in this order. A missing stored row means on,
but only once a read has returned the effective boolean. The client does not
copy `defaultOn` out of `apps/api` and it does not paint a switch before the
read.

| Kind | Title | Switch sentence |
|---|---|---|
| `allowance_expiring` | Allowance about to expire | The allowance autopilot uses is about to expire. Reminders go out at 30, 7 and 1 days, about 518,400, 120,960 and 17,280 ledgers at 5 seconds a ledger. The days are the rule. The ledgers are the estimate. A close of about 6 seconds is undetermined. Nothing is sent until the expiry ledger is stored. |
| `approaching_critical` | Approaching expiry | Email when a persistent entry you watch is within 1 day of expiry and autopilot is off for it. About 17,280 ledgers, at 5 seconds a ledger. The day is the rule. The ledgers are the estimate. The email is warning, or critical when that entry is shared or already expired. A temporary entry is not emailed during beta. Nothing is sent until that ledger is stored. |
| `extend_succeeded` | Extend succeeded | Autopilot extended this entry. The email is a receipt of that extend. It is not a payment, and this page does not move XLM. |

Intro, under the `Optional` heading: "On unless you turn one off. A missing
saved choice means on."

Under Approaching expiry, always, once the row is shown: "One choice for
every persistent entry you watch. There is no per-contract switch."

`extend_succeeded` and `allowance_expiring` wear no severity chip. Those
emails are `info` in `templates.ts`, and `info` is not a health state.

`approaching_critical` follows the CLI health check (Fatih, 15 Nov 2026).
`packages/cli/src/scan.ts` `healthReport` and `formatHuman` call
`assessEntryWithThresholds`, which calls `assessEntry` in
`packages/core/src/health.ts`. The CLI prints `WARNING` and `CRITICAL`
(`LABEL` in `scan.ts`). This screen uses the existing chip words `warning`
and `critical` for those two, and no new colour. Below the 17,280-ledger
lead, a persistent entry that is not shared is warning. It is critical when
the entry is shared and low, or already expired: `assessEntry` returns
critical for an expired entry, for a shared entry at or below the threshold,
and for a temporary entry at or below the threshold (`endBehavior` deleted);
a single low persistent entry is warning. During beta a temporary entry is
not emailed, so that critical case has no message yet. The row shows both
chips as the rule for the email, not as one contract's health. `templates.ts`
still hard-codes `warn`. That file is not changed here. No send exists until
the ledger is stored.

**Required.** No switches. Intro: "These alerts are required for autopilot
users and cannot be turned off. The mark is the email's severity, not a
contract's health."

The chip word is `warning` for severity `warn` and `critical` for `critical`.
The sentences are the email leads in `templates.ts`, so the screen and the
mail do not disagree. "Fee included" is that lead. It states no amount.

| Kind | Title | Chip | Sentence |
|---|---|---|---|
| `preflight_failed` | Pre-flight failed | warning | The pre-flight check failed, so nothing was pulled from your wallet and the entry was not extended. |
| `allowance_missing` | Allowance missing or used up | warning | Your allowance is missing, expired, or its 30-day budget is used up. Autopilot cannot extend this entry until you approve a new allowance. |
| `extend_failed_refund` | Extend failed, refund under way | critical | The extend failed after the pull. The whole pull, fee included, is being refunded. The entry is still not protected. |
| `refund_delayed` | Refund delayed | critical | A refund owed to you is delayed. It is still owed and will be sent to your wallet. |
| `unexplained_charge` | Unexplained charge | critical | Reconciliation found a difference between what Evergreen recorded and what the chain shows for your wallet. |
| `testnet_reset` | Testnet reset | warning | The Stellar testnet appears to have been reset. Protection state for this entry starts over. |
| `restore_lost_changes` | Restore lost changes | warning | Evergreen data was restored from a backup. Recent changes for this entry may be missing; which ones is undetermined. |

**Closing, after the lists**

- "At most 5 optional emails are sent in 24 hours. Required emails are not
  counted in that 5." The 5 and the 24 hours are `ALERT_RATE_LIMIT`
  (`maxOptionalPerWindow: 5`, `windowSeconds: 86400`), decided 2026-10-29.
  Not a rounded marketing figure.
- "No alert email is not health. It can mean nothing happened, or that
  sending did not."

`updated_at` is not shown. A clock time on a preference write is not a
ledger, and it is not a health fact.

### The switch

A `button` with `role="switch"` and `aria-checked`. The accessible name is
the row's title. The drawn track is 36×20, pill radius, inside a 44×44 hit
target. On: `--pine` fill, cream knob. Off: `--paper` fill, `1px` border
`rgba(15,15,15,.5)`, ink knob. No shadow. The word beside it is `on` or
`off` in Space Mono 12px, `--ink` when on and `--ink-3` when off. The word
is the signal the colour is not allowed to be alone.

There is no second control. One-click unsubscribe is
`POST /alerts/unsubscribe` (`docs/API.md` §6a, RFC 8058). It is a mail-client
POST, not a button on this page. Turning a switch off is the per-kind opt-out.

### States

The preference read is in `docs/API.md` §6a. A signed-in read renders the
panel and both lists from that response. The unread line is only while the
request is in flight. Do not hard-code the three switches on. The PNG is the
success picture, and its sentences are the ones in the table above.

| State | What renders |
|---|---|
| **Unread** | No switches. `reading…` in `--ink-3`, 12px, where the panel and the lists will be. The heading and the lead are already there, including the XLM sentence. |
| **Default (read succeeded)** | The panel and both lists. Each switch shows the effective `enabled` the read returned. The reference PNG is this state with all three on, the address present, and both panel facts undetermined, because those two reads do not exist. The empty-watchlist sentence is absent: that PNG is not the empty list. |
| **Saving** | The switch stays on the attempted position. Its word becomes `saving…` in `--ink-3`. Other rows do not change. `aria-busy="true"` on that switch. No shimmer, no healthy chip. |
| **Saved** | The word returns to `on` or `off`. Under that row's sentence, `Saved.` in 12px `--ink-3`. Not a chip. Cleared when that row changes again. |
| **Error** | The switch returns to the last value a read or a save confirmed. The critical mark and `--crit-ink` at 12px: "Not saved. The last saved choice still stands. Try again." If nothing was ever confirmed, the switch is removed and the row says, with the undetermined chip: "This choice could not be read." |
| **No session** | No panel and no lists. "A preference belongs to a signed-in session, and this browser has none. Nothing is shown." A link to `/login/`: "Sign in". Then: "Signing in with email cannot move XLM." Then a link to the scanner: "The scanner needs no session." Same shape as the watchlist's signed-out block. |
| **API did not answer** | Undetermined chip. "The Evergreen API did not answer, so there are no preferences to show. This says nothing about your contracts: it is about us." |
| **API answered, unreadable** | Undetermined chip. "The API answered, but not with preferences this page can read. We could not establish this." |
| **Email verification unknown (today)** | The address from `GET /me`, the undetermined chip, and: "A sign-in code was accepted for this address once. Whether a later alert arrives is undetermined." There is no `email_verified` column and `GET /me` does not return one. Do not infer "verified" from a session. A session only means a sign-in code was accepted once. |
| **Email not verified** | Render this only when a field CEF has added to `docs/API.md` is explicitly false. Undetermined chip, never healthy, never critical: "This address has not been confirmed for alerts. Nothing here shows it as verified." Any other value, including a string the client does not know, stays on the unknown sentence above. Do not coerce it. |
| **Email confirmed** | Render the extra sentence only when that same field is explicitly true. Still no healthy chip and no check: "A sign-in code was accepted for this address. That does not confirm a later alert arrived." |
| **Sending unknown (today)** | Undetermined chip. "Whether any alert email is being sent is undetermined. No mail in the inbox is not health." |
| **Sending disabled** | Render only when a documented read says the mode is not exactly `send`. This is a known fact, so it is not the undetermined chip. It is the incomplete mark: a 9×2 bar in `--ink-2`, hairline outline, no state colour, the word `not sending`. Sentence: "Sending is off. Choices on this page are still saved. No email is sent, and no email sent is not health." The switches stay enabled. |
| **Sending on** | Render only when that read is exactly `send`. No chip. The word `sending` in `--ink`. "Sending is on. An accepted send is not a received one. No mail in the inbox is not health." |
| **Empty watchlist** | The rest of the page stays. `GET /watchlist` returned `{ items: [] }`. One more sentence on the Approaching expiry row: "Your watchlist is empty, so this alert has no entry to name. Add a contract from the scanner. An empty list is not a healthy contract." The scanner link is `/dashboard/scanner/`. |
| **Watchlist unread or failed** | Do not say the list is empty. If the watchlist read failed: "The watchlist could not be read, so this page does not say whether any entry would be named. That is undetermined." If it has not returned, say nothing about it. |
| **Per-contract overrides** | Not a state. The primary key is `(user_id, kind)`. The screen has no per-contract list, no per-contract switch, and no disabled override. The standing sentence under Approaching expiry is the whole of it. |

A future outbox history is not on this screen. No route returns one. If CEF
adds one and documents it, each row maps as follows and still never uses the
healthy chip: `pending` → undetermined, word `pending`; `sent` → no state
chip, word `accepted`, "Resend accepted this. Whether it arrived is
undetermined."; `failed` → critical chip, word `failed`, "This attempt did
not send." A status outside `pending`, `sent`, and `failed` is undetermined.
Do not build the list until the route is in `docs/API.md`.

Numbers on this screen, if a count is ever shown, are pinned to `en-US`.
An unpinned `toLocaleString()` is already a known defect in this product.

### F3 and F5 have no email of their own

DoD-2 asks every failure mode to alert the user
(`phase-2/PHASE2-PLAN.md`). F3 and F5 meet that by the final-outcome email,
not by an email of their own (Fatih, 15 Nov 2026). The codes are the ones in
`docs/PH2-E4-05-FAILURE-MODES.md`. This screen adds no row for F3 or F5.

| Code | As that page defines it | What the user receives |
|---|---|---|
| F3 | Pull submitted, outcome unknown | No dedicated email. The user hears the outcome below. |
| F5 | Extend fails transiently or times out | No dedicated email, and none per attempt. |
| Success | The extend completed | `extend_succeeded`, optional, on unless turned off. |
| F4 | Pull succeeded, extend finally failed | `extend_failed_refund`, required. The whole pull is refunded, fee included. The entry is still unprotected. |
| F6 | Refund fails, or is submitted with its outcome unknown | `refund_delayed`, required. The refund is owed and delayed. The 15 Nov decision calls this the refund-pending email. It is this mode. |

`docs/PH2-E4-05-FAILURE-MODES.md` still says F3's earlier "pending" notice
and F5's delay notice are undetermined, and F3's user line names F5 as one
way the outcome is told. This section follows the 15 Nov decision: those
notices are not sent. The failure-modes page was not edited here.

### Open questions for CEF

1. **The read and the write.** Answered by #603, `docs/API.md` §6a. The
   screen calls it. `updated_at` is still not shown. Reset stays an API
   action and is not a second control on the page.
2. **A verification field.** None exists. The three email sentences above
   are waiting on an explicit boolean in that document. Until then the
   screen uses the unknown sentence.
3. **A read of the send mode.** `ALERTS_SEND` is a Worker setting. Nothing
   returns it to the dashboard. Until a documented read exists, the sending
   line stays undetermined. The read has to preserve the byte comparison:
   only exactly `send` is on.
4. **Outbox history.** Not built. Do not add it from the table.
5. **Lead times.** Answered 15 Nov 2026. Persistent expiry warning: 1 day,
   about 17,280 ledgers. Allowance reminders: 30, 7 and 1 days (ADR-007).
   Temporary entries: no email during beta. Still undetermined, and the
   screen says so: a close of about 6 seconds, the event ids, and how often
   a saved choice is checked. The screen does not invent a number for those.
6. **Which severity `approaching_critical` sends.** Answered 15 Nov 2026.
   It follows `assessEntry`, warning or critical as that function returns.
   `templates.ts` still hard-codes `warn`; that file is not changed here.
7. **F3 and F5.** Answered 15 Nov 2026. No dedicated email. The user is
   told by success, F4, or F6. See the section above.


## Autopilot setup and allowance approve (PH2-E3-05)

Specified 2026-11-23 by DES. This is the money path's only screen a person
signs on, so it is specified end to end: from a watchlist row that says
`Off` to a row that says `On` with a live allowance behind it. WEBF or WEBR
implement it in `apps/web`. The logic already built stays (`allowance-cap.ts`,
`allowance-approve.ts`, `allowance-revoke.ts`, `allowance-view.ts`); this
section changes **order, entry points and what is prefilled**, not the
arithmetic and not the refusals.

The reference render of the **ready to sign** state is
[`source/screens/autopilot-approve.html`](source/screens/autopilot-approve.html).
Every number in it is a **stand-in** and is listed under "Stand-ins in the
render" below. None of them is a decision.

### What is wrong today (audit, 23 Nov 2026)

1. **The watchlist has no way to turn autopilot on.** The row prints `Off`
   (`autopilotCell`) and nothing else. `PATCH /watchlist/{network}/{contractId}`
   with `autopilot` exists (`docs/API.md` §5) and no screen calls it.
2. **`/allowance/` asks the person to type simulated rent in stroops, one
   contract per line.** A beta user does not have that number. The watchlist
   already knows which contracts are theirs, and the scanner already simulates
   the rent of one extend in the browser.
3. **The page is five equal steps.** Sizing and approving read as a form; the
   revoke has the same weight as the approve, directly under it.
4. **The two halves are not joined.** An approve does not lead to turning
   autopilot on, and turning autopilot on (when it exists) does not lead to
   an approve.
5. **There is no single line that says where this wallet stands.** The read
   is a definition list in step 2, with the reminders below it.

### The journey

Three places, one direction. No step is skipped, and none moves XLM except
the wallet's own signature in step C.

| | Where | What the person does | What changes |
|---|---|---|---|
| A | `/dashboard/watchlist/`, the row | `Turn on autopilot` | Nothing yet. Goes to `/allowance/?for=<contractId>`. |
| B | `/allowance/`, Cap | Confirms the contracts and how many extends to cover | Nothing. In-browser estimate only. |
| C | `/allowance/`, Review and sign | Reads the review panel, then signs one `approve` in Freighter | The allowance on chain. |
| D | `/allowance/`, after the read-back | `Turn on autopilot for these contracts` | `PATCH` per contract, with `payerWallet` and `budget`. |
| E | Back on the watchlist | Nothing | The row reads `On`, with the payer and the allowance's end ledger. |

If the wallet already has a live allowance that covers the new contract's
pull, A goes straight to D: the page says so and offers no new approve. A new
approve **replaces** the cap, so the page never offers one that would lower a
live allowance without saying, in the review panel, from what to what.

### A · The watchlist row

The autopilot cell gains one control. It stays a cell, not a panel.

| Stored state | Cell |
|---|---|
| `enabled: false` | `Off` and a secondary button `Turn on autopilot`. |
| `enabled: true`, allowance read live | `On` · acts below … · extends to … · paid by `GABC12…XYZ789` · allowance until ledger `8,510,399` (~date). |
| `enabled: true`, allowance reads 0 or is missing | The warning chip, `allowance missing`, and the inline link `Approve an allowance →` to `/allowance/?for=<contractId>`. Same words as the `allowance_missing` alert. |
| `enabled: true`, allowance not read | `On` and the undetermined chip on the allowance part only. Never healthy. |
| `autopilot` absent or malformed | The undetermined chip, as today. |
| No linked wallet | `Off`, and instead of the button: `Link a wallet first →` to `/login/`. |
| Item on `mainnet` | `Off` and the sentence "Autopilot is testnet-only until beta ends." No button. |

Turning autopilot **off** is a secondary button `Turn off` in the same cell.
It is a `PATCH` with `enabled: false`. It does **not** revoke the allowance,
and the row says so after it succeeds: "Autopilot is off for this contract.
Your allowance is unchanged; revoke it on the Allowance page."

### B, C, D · `/allowance/`

**Page head** (unchanged route and title)

| | |
|---|---|
| Eyebrow | Account · Stellar testnet |
| Heading | Allowance |
| Lead | An allowance lets Evergreen's engine pull native XLM from your wallet, up to a cap and until a ledger you approve. Your wallet signs it. Signing in with email cannot move XLM. |

**Standing line**, directly under the lead, before any step. One sentence and
one chip. This is the answer to "where am I", so it comes first.

| Read | Chip | Sentence |
|---|---|---|
| Not connected | none | Connect a wallet to read its allowance. |
| Reading | none | `reading…` in `--ink-3`. |
| Live | none (a fact, not a health state) | `0.1080822 XLM` (`1,080,822 stroops`) until ledger `8,510,399`, about May 22, 2027. |
| Zero, history says expired | expired | Stopped. The allowance expired at ledger … . |
| Zero, history says revoked | expired | Stopped. The allowance was revoked. |
| Zero, no history | undetermined | The chain reads zero. Whether it expired, was revoked or never existed is undetermined. |
| Spender unpublished | undetermined | `SPENDER_UNSET_TEXT`, verbatim. |
| Read failed | undetermined | The allowance could not be read. (detail) |

**Step 1 · Wallet.** As today: `Connect Freighter`, then the connected
account in mono. One addition: when the connected account is **not** one of
the account's linked wallets (`GET /me`), say "This wallet is not linked to
your account, so autopilot cannot name it as payer. Link it on the Sign in
page." and stop at step 1. Approving from an unlinked wallet would produce an
allowance nothing can use.

**Step 2 · Cap.** Prefilled, not typed.

- One hairline row per watch item that is autopilot-eligible (testnet,
  this wallet as payer or no payer yet). The `?for=` contract is first and
  pre-checked. Others are listed unchecked. Each row: a checkbox, the label (or
  the short contract ID), the binding entry, and **simulated rent for one
  extend** in mono stroops with "simulated at ledger …".
- The rent comes from the same in-browser simulation the scanner's cost read
  uses. While it runs the cell says `simulating…`. If it fails, the row says
  "Rent could not be simulated, so this contract is left out of the cap." and
  its checkbox is disabled. It is never filled with a guess.
- Each row also carries the item's two autopilot settings, as mono fields the
  person can change: **Act below** (`thresholdLedgers`, prefilled `17,280`,
  about 1 day) and **Extend to** (`extendToLedgers`, prefilled `518,400`,
  about 30 days). These are the CLI's and the example config's defaults, so a
  person who has used the CLI sees the same numbers. An item that already has
  them shows its own. The row's simulated rent is the rent of extending to
  **Extend to**, so changing it re-simulates that row. The API needs both
  (`extendToLedgers` above `thresholdLedgers`, `thresholdLedgers` at or above
  `THRESHOLD_FLOOR_LEDGERS`), so they are set here, where the rent depends on
  them, and sent unchanged in step D.
- If step D's `PATCH` is refused because **Act below** is under the engine's
  floor, the row shows the floor the API names and the sentence "The engine
  acts no earlier than N ledgers left. Use N?" with a secondary button
  `Use N`. The value is never raised silently: it changes when the engine acts,
  so the person sees it change.
- One field: **Extends to cover, per contract**. Whole number, mono,
  **prefilled with `2`** (decided 2026-11-23, see "The default of 2" below).
  Helper: "Each extend is one pull: rent, the Evergreen fee and the retry
  margin." When the checked item has `thresholdLedgers` and `extendToLedgers`,
  one more line per row says what the number covers at that item's settings:
  "One extend adds about N ledgers (~D days), so 2 extends cover about …
  ledgers. The allowance itself ends at ledger …". The ledgers are the rule;
  the days are the estimate. Without those settings the line is absent, not
  guessed.
- `Enter rent by hand` is a `<details>` under the rows. It holds today's
  textarea, for a contract that is not on the watchlist. It is not the main
  path.
- The per-job budget textarea is removed from this step. Budgets are set in
  step D, where they are used.
- The estimate updates when an input changes. There is no `Show the estimate`
  button. Updating is not motion: the numbers replace, nothing animates.

**Step 3 · Review and sign.** This is the signing step from "Phase 2
components" above, made concrete. One panel. It is the screen's dominant
element, so it is the only panel on the page with the figure: the cap in
`--t-sub` (20px) serif, unrounded.

| Line | Content |
|---|---|
| Cap | `0.1080822 XLM` and, under it in mono 12px, `1,080,822 stroops`. |
| Made of | Three lines, never summed into one: Rent `660,822 stroops` · Evergreen fee `300,000 stroops` (provisional: 2% of rent, at least 25,000 stroops per extend) · Retry margin `120,000 stroops`. Then: "Rent and the fee are charged on what each extend actually costs. An unused pull is refunded." |
| Replaces | "Your current allowance, `0 XLM`, is replaced by this cap. It is not added to it." Always shown, also when the current amount is zero. |
| Until | Ledger `8,510,399`, about May 22, 2027. "The ledger is the rule. The date is an estimate." |
| Spender | Evergreen's engine, the full G-address in mono, wrapped, not shortened. |
| Contract | The native XLM contract, short ID with the full one in `title`. |
| What it is | "This authorises a payment from your wallet, never access to a contract. You can revoke it at any time below." |

Then the one primary button: `Sign approve in Freighter →`. Under it, in 12px
`--ink-3`: "Your wallet shows the same amount and ledger. If it does not,
reject it there."

When the button is disabled, every reason is printed above it, as today
(`showWhyApproveIsOff`), one sentence each. A disabled button with no reason
is a defect.

**After signing**, in the same panel, replacing the button. The outcomes are
the existing `approveOutcomeHtml` kinds; only the layout is new.

| State | What renders |
|---|---|
| Waiting for wallet | "Waiting for your wallet…" No spinner. |
| Rejected in wallet | "You rejected it in your wallet. Nothing was signed." Button back. |
| Possibly signed | Undetermined chip, the existing sentence, and `Read the allowance again` instead of the sign button. |
| Submitted | "Submitted. Transaction" + hash in mono, linked to the explorer. "Reading the allowance back…" |
| Read back, matches | The standing line updates. In the panel: "The chain now reads `0.1080822 XLM` until ledger `8,510,399`." Then step D appears. No healthy chip: an allowance is a permission, not health. |
| Read back, differs | Critical mark: "The chain reads a different amount or ledger than you signed. Do not turn on autopilot. (both values)". Step D does not appear. |
| Failed | The existing error sentences, and "Nothing was signed" or "Nothing was submitted" as the kind says. |

**Step D · Turn on autopilot** appears only after a matching read-back, or
when the standing line is Live and covers the checked contracts.

- The checked contracts from step 2, one hairline row each. The `PATCH`
  sends `payerWallet` (the connected, linked wallet), the row's **Act below**
  and **Extend to** from step 2, and `budget` from two mono fields: **Per-job budget** (prefilled with that contract's pull total:
  rent + fee + margin) and **Per 30 days** (prefilled with per-job ×
  extends-to-cover, capped at the cap). The API's rule is printed once:
  "Per job cannot be more than per 30 days, and neither can be 0."
- One primary button: `Turn on autopilot for these contracts →`. One `PATCH`
  per row, each with its own result line under its row (`On.` in 12px
  `--ink-3`, or the API's refusal in `--crit-ink`). One failure does not undo
  the others, and the page says which rows succeeded.
- `503 UPSTREAM_UNAVAILABLE` (threshold floor not configured) reads: "Autopilot
  cannot be turned on yet: the engine has not published its threshold. Your
  allowance is approved and stays on chain."
- After at least one success: the inline link `Back to the watchlist →`.

**Stop autopilot (revoke).** Moved below a hairline, after the steps, under
the `h2` `Stop`. It is not step 4 or 5. Copy as today. The button is
secondary, not primary: it is the reverse action and must not compete with
the sign button. It is always enabled when the read is Live, whatever the
rest of the page says.

### Mobile

At 390px the steps stack in the same order. The review panel's lines become
label-over-value. The spender address wraps in mono, never truncated, because
the person compares it with the wallet prompt. The sign button is full width.
The top nav strip must scroll its active item into view on load (today
`Allowance` is off-screen to the right on this page).

### Constraints that hold

The seven rules, and in particular: weight 400 everywhere; one dominant
element (the cap figure in the review panel, 20px, the page's only serif
number); amounts unrounded with their unit every time; rent and fee never one
summed figure; dates are estimates beside ledgers; nothing animates; a
disabled control only when the action is built and not configured, with its
reason printed; no healthy chip anywhere on this screen.

### Stand-ins in the render

Not decisions. Replace each with the configured or read value.

| Value in the render | Real source |
|---|---|
| Rents `61,234` and `48,903` stroops | In-browser simulation per contract. |
| 6 extends per contract | The person's input; the product default is 2. |
| Retry margin `10,000` stroops per extend | `ALLOWANCE_RETRY_MARGIN_STROOPS`: 100,000 stroops on testnet (CEF, 2026-11-23, PR #643). With it, one contract at 103,849 stroops rent and 2 extends is a cap of 457,698 stroops (0.0457698 XLM). |
| Read at ledger `5,400,000`, until `8,510,399` | Chain read + `MAX_ALLOWANCE_EXTENSION_LEDGERS` (3,110,399). |
| Spender `GENGINE…` | `ENGINE_SPENDER`, unpublished until `PH2-E4-03`. |
| Wallet `GABC12…XYZ789` | The connected wallet. |

The cap in the render, `1,080,822` stroops, is `pullAmountStroops` from core
summed over the stand-ins (2 contracts × 6 extends × (rent + 25,000 + 10,000)),
so the arithmetic in the picture is the product's, not hand-made.

### Open questions

1. **Answered 2026-11-23:** the default for "extends to cover" is 2. See
   below.
2. **CEF:** does `GET /watchlist` (or a new field) carry a simulated rent per
   item, or does the browser simulate it? This spec assumes the browser, as the
   scanner does, so no API change is needed.
3. **CEF:** the allowance history route (`GET /wallets/{account}/allowance`)
   is what tells expired from revoked in the standing line. Until it is served,
   zero reads as the undetermined row.
4. **CEF:** `ALLOWANCE_RETRY_MARGIN_STROOPS` and `ENGINE_SPENDER`. Until both
   exist the sign button stays disabled with its reasons, which is correct.

### The default of 2

Decided 2026-11-23 by DES under the standing authority Fatih gave the
orchestrator that day. It is a default in a field the person can change, not
a limit.

- **The cap is the worst case the person signs for.** A default sets what most
  people sign, so it leans low. With the provisional fee floor (25,000 stroops
  per extend) and the testnet rents on record (53,196 and 103,849 stroops for
  one extend, `docs/evidence/2026-09-11-storage-advice-validation/blend/human.txt`), 2 extends per contract are roughly 0.03 XLM per
  contract before the retry margin, so a handful of contracts stays well under
  1 XLM.
- **One extend is not enough.** A pull whose extend fails is refunded, but a
  cap sized for exactly one pull leaves no room for the next scheduled extend,
  and the person gets `allowance_missing` straight after their first success.
  2 is the smallest number that survives one full cycle.
- **The allowance expires anyway.** It ends at most 3,110,399 ledgers (about
  180 days) after it is read, and renewal reminders go out at 30, 7 and 1 days.
  A low cap is renewed with the same signature the expiry already asks for.
- **What would change it:** measured extend frequency per item once the engine
  runs Stage 2 (`PH2-E4-04`). If the median item needs more than 2 extends per
  allowance lifetime, raise the default to that median and record the
  evidence here.

## CLI help and version (PH2-E1)

Specified 2026-11-23 by DES. CEF owns `packages/cli` and implements this. The
CLI is the product most beta users meet first (it is the recommended path), so
its first screen follows the same rules as the dashboard's: one dominant
thing, nothing claimed that was not measured, the state word always printed.

### What is wrong today (`cli-v0.2.0`, read 2026-11-23)

1. `evergreen --version` prints the usage, not the version. There is no way
   to ask the installed CLI which version it is, which is the first question
   in any support thread.
2. `evergreen --help` prints 77 lines, all of them about
   `scan`. `extend` is one line near the top. A person who wanted to know what
   the tool does gets the scan manual.

### Top-level help

`evergreen --help` and `evergreen help` print this, and nothing else, to
stdout, exit 0. Bare `evergreen` (no command) prints the same screen to
stderr and exits 2, as today's usage error does, so a script that forgot its
command still fails. At most 20 lines and 79 columns, so it fits an 80×24
terminal without scrolling or wrapping (CEF found the first version at 83). Plain text, no colour, no box drawing.

```
evergreen 0.2.0 — Soroban state TTL, read and extended. Testnet by default.

usage: evergreen <command> [options]

commands
  scan <contract-id>...   read TTL health of each entry given; signs nothing
  extend <contract-id>    simulate an extend; --submit signs, testnet only

examples
  evergreen scan C...                     health of one contract
  evergreen scan C... C... --json         two contracts, shared code resolved
  evergreen scan C... --cost              rent for 30 more days, simulated
  evergreen extend C... --ledgers 518400  simulate adding about 30 days

global options
  --network testnet|mainnet   or EVERGREEN_NETWORK; reads only on mainnet
  --version                   print the version and exit
  --help                      this screen; <command> --help for one command

docs  https://evergreen-stellar.pages.dev/docs/cli/
```

Rules for that text:

- The version on line 1 is read from `package.json` at build time, never typed.
- "about 30 days" stays beside the ledger number. The ledger is the rule; the
  days are the estimate (518,400 × 5 s).
- Command descriptions say what is **not** done (nothing is signed, simulate
  by default). That is the CLI's safety claim and it leads, as on the site.
- The docs URL is the deployed docs origin. If CEF knows a canonical domain
  that differs, use that one; do not print two.

### Per-command help

`evergreen scan --help` prints today's full scan text unchanged. It is good
reference text; it was only in the wrong place. `evergreen extend --help`
stays as it is.

### Version

`evergreen --version` and `evergreen -v` print exactly `0.2.0` (the bare
version, one line, stdout, exit 0), so scripts can compare it. No banner, no
update check, no network call.

### Unknown command

`evergreen frobnicate` prints to stderr
`evergreen: unknown command "frobnicate". Commands: scan, extend. See evergreen --help.`
and exits 2, the CLI's existing error code. Today it already exits 2 with the
two-line usage; only the message changes.

### Not changing

Exit codes, `--json` output, the scan and extend option names, and colour
rules (TTY only, `NO_COLOR` honoured). The top-level screen adds no colour.

## Dashboard revamp (2026-11-24, branch `revamp-dashboard`)

Reference screens: `source/screens/revamp/`, built from `parts/` by `build.mjs` so every screen shares one sidebar. Renders at 1440 px in `source/renders/screens/revamp/` (`*-panel.png` is the side panel open). Mobile renders at 390 px are in the project files, not the repo.

**Why.** Fatih, 2026-11-24: the dashboard reads like a document. It shows our example contracts, explains itself in paragraphs, and scrolls a long way. A dashboard summarises the person's own data. Detail opens on demand: a click, or a side panel.

**Rules for every dashboard screen.**

- **The person's data, not ours.** No guinea-pig or example contract appears in the signed-in dashboard. Our own contracts, engine runs and extension history leave the dashboard nav and live under `/about/` (or the docs) as public evidence.
- **No lead paragraph.** A page has an eyebrow and a heading. Explanations move to the empty state, a tooltip-free one-line note, or the docs. At most one line of `note` text per block.
- **Summary first, detail on request.** A list shows one line per item. The whole row opens the side panel. The full page remains for deep links.
- **Fits one screen on desktop.** With up to 5 contracts, the overview fits within 1440 × 900 without the activity block. Lists beyond 5 rows link to the full list.

**Sidebar (all dashboard pages).** Top group with no section label: Overview, Contracts (the watchlist, renamed; it keeps the URL `/dashboard/watchlist/`), Activity (jobs and fee ledger, new), Allowance. *Tools*: Scanner, Blast radius, TTL decay. *Settings*: Alerts, Account (Sign in when signed out), Documentation. Below 760 px the sidebar becomes a horizontal scrolling tab row with the top group first, section labels hidden.

**Overview, signed in, from the top.**

1. Head: eyebrow `Overview · Stellar testnet`, h1 `Your contracts`, buttons *Scan a contract* (secondary) and *Add contract* (primary).
2. **Needs attention first** (the one dominant element). The contract with the fewest ledgers left among those not healthy; if all are healthy, the one ending first, with the figure in ink instead of the warning colour. Figure 72 px serif, coloured by state; caption: binding entry, `~date`, and the autopilot threshold when autopilot is on. *Open* opens the side panel. An undetermined contract is never chosen as "first" over an at-risk one, and is never shown with a figure.
3. **Four facts**, no boxes, separated by space: Watching (count, then needs-attention · undetermined · archived counts), Autopilot (`N of M`, next scheduler check), Allowance left (stroops, until ledger, `~date`; *Not approved* links to /allowance/ when there is none), Last 30 days (extends count; rent and fee as separate figures, from `GET /ledger`).
4. **Contracts**: table, ordered as `orderRows` already orders them. Columns: Contract (label over the short ID), State chip, Ledgers left (mono, right-aligned, `—` when archived or undetermined), Ends (est.), Autopilot on/off. Below 760 px only the first three columns remain.
5. **Recent activity**: the last 4 events (extend, allowance approve, add, failed job), one line each: mono time, sentence, amount. *All activity* goes to the new Activity page.

**Side panel.** 380 px, `--paper`, a 1 px `--rule` left border, no shadow, no slide animation (rule 7). It opens on row click or *Open*, and closes with *Close*, Escape, or clicking the open row again. The URL carries `?c=<contractId>` so a reload or shared link reopens it. Contents: label, full ID (mono), state chip; Binds on, Ledgers left, Ends, Read at; Autopilot (state and payer, Act below, Extend to); *Extend now* (primary, only when autopilot is on) and *Edit autopilot*; extend-now uses left; the last 2 extends with rent and fee on separate figures; links *Full details* and *Remove*. Below 760 px the panel is a full-width page section under the list.

**Overview, signed out.** The scan field and one line, "Sign in to watch your contracts and turn on autopilot." with a *Sign in* button. No example contracts, no paragraphs.

**Overview, signed in with nothing watched.** The heading, an *Add contract* field (contract ID, optional label) and one line pointing to the scanner. No facts row and no tables until there is a contract.

**Stand-ins in the render.** Every contract name, ID, ledger, date, amount and the payer are invented for the render: current ledger 5,400,000; payments-v2 41,208 left; allowance 812,400 stroops until 5,912,000. Wire them to `GET /watchlist`, `GET /wallets/{account}/allowance`, `GET /jobs` and `GET /ledger`.

**Stand-ins agree with each other.** payments-v2 has never been extended since autopilot went on: its first run on Nov 22 stopped at pre-flight, which is why it needs attention. The allowance was approved on Nov 12 for 1,080,822. Two pulls (186,234 and 229,011) leave 665,577. Refunds go back to the wallet, not to the allowance.

### The other screens

Every screen uses the same head: an eyebrow, an h1, and at most two buttons on the right. At most one dominant figure (`.next`), facts without boxes, a one-line-per-item table, and the side panel for detail.

- **Contracts** (`contracts`, `contracts-panel`): filter pills with counts (All, Needs attention, Undetermined, Archived) and a name/ID filter. The table adds Binds on and Read. The render opens the undetermined contract: the panel says why in one sentence, offers *Add data keys* and *Scan again*, and lists what was read. It never shows a figure for an undetermined expiry.
- **Activity** (new, `activity`, `activity-panel`): four facts for 30 days (extends, rent charged, Evergreen fee, refunded), filter pills, and one row per event (When, Contract, Event, Rent, Fee, Status). Rent and fee are separate columns. A job's panel lists its steps (pre-flight, pulled, extended, reconciled, refunded) with transaction links, and closes with the identity *Pulled = rent + fee + refund + difference*.
- **Allowance** (`allowance`, `allowance-panel`): the dominant figure is what is left to pull, with the state chip, the until ledger and the wallet. Facts: cap approved, pulled so far, wallet balance (exact, never rounded), spender. *What it covers* lists rent + fee per extend and extends left per contract. *Change cap* opens the existing three-step flow in the panel; the full-page flow from PH2-E3-05 stays for a first approve.
- **Scanner** (`scanner`): one input row, data keys folded away, then the binding expiry as the dominant figure with *Add to watchlist* and *Copy CLI command*, then the entries read.
- **Blast radius** (`blast-radius`): the person's contracts grouped by Wasm. The dominant figure is the largest group. One row per code entry.
- **TTL decay** (`decay`): one contract at a time, chosen by pills. The figure and the caption give the rate and when the threshold is reached. The chart follows § Chart. It is drawn at the container's width, so its 12 px text stays 12 px; the reference SVG is drawn at 1100 px.
- **Alerts** (`alerts`): who alerts go to, three switches the person chooses, and the always-sent list without switches.
- **Account** (`account`): email, session, and the linked wallets table with *Unlink*, plus *Sign out*.
- **Overview, signed out** (`overview-signed-out`) and **with nothing watched** (`overview-empty`), as above.

### Where the data comes from today (WEBF, 2026-11-24)

`apps/api` serves auth, watchlist and alert preferences only. `GET /jobs`, `GET /ledger`, `GET /wallets/{account}/allowance` and `POST /jobs` are specified in docs/API.md §7 but not built. Until they are:

- **Read in the browser now:** the allowance left and its until ledger (the SAC `allowance()` read), the wallet balance, and everything a scan reads.
- **No source yet:** the Last 30 days fact, Recent activity, the Activity page, the panel's last runs, *Extend now*, and the scheduler's next check. Each shows the word *not yet available* in `--ink-3` where its value would be: no figure, no zero, no placeholder rows. *Extend now* is not drawn. The Activity nav item stays, and its page says *Activity appears here once the engine reports jobs.* An unavailable value is never shown as zero (three-state honesty).
