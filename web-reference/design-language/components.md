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

`docs/API.md` has no preference route. `apps/api/src/router.ts` has none.
`docs/PH2-E2-06-ALERTS-DESIGN.md` §6 names `GET` and `PATCH /v1/me/alert-preferences`
and says the shape will be written into `docs/API.md` when it is built.
**That path is not a route. Do not call it.**

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
5. **`body.app`.** Pine sidebar 264px, status bar, the existing nav. This
   screen adds one item, `Alerts`, in **Your account**, after Watchlist.
   The active item is a warm-white fill with pine text, and only the fill
   marks it.
6. **No motion the person did not ask for.** No entrance, no shimmer, no
   skeleton, no knob that travels. A click paints the other position on the
   next frame. Hover changes colour only, over the existing 150ms, and this
   screen's switch has no hover move. Focus is the shipping ring: `2px solid
   --pine`, offset 2px, radius 3px.
7. **Ledgers are the truth, dates are estimates.** This screen has no ledger
   field to show. When a later read supplies a ledger count, the line is the
   count and an estimate, in that order: `fewer than 17,280 ledgers remain,
   about 1 day`. The day carries `about` or `~`. The numbers in that example
   are `DEFAULT_CRITICAL_LEDGERS` in `packages/core/src/health.ts`, quoted so
   the pattern is visible. They are **not** this alert's setting.
   `alert_preferences` has no threshold, and `watch_items.threshold_ledgers`
   is the autopilot threshold. Do not print either as the alert's ledger.
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
| `allowance_expiring` | Allowance about to expire | The allowance autopilot uses is about to expire. How far ahead is undetermined. |
| `approaching_critical` | Approaching expiry | Email when an entry you watch is approaching expiry and autopilot is off for it. The ledger count is undetermined. Any day count is an estimate; the ledger is the truth. |
| `extend_succeeded` | Extend succeeded | Autopilot extended this entry. The email is a receipt of that extend. It is not a payment, and this page does not move XLM. |

Intro, under the `Optional` heading: "On unless you turn one off. A missing
saved choice means on."

Under Approaching expiry, always, once the row is shown: "One choice for
every entry you watch. There is no per-contract switch."

The optional rows wear no severity chip. `extend_succeeded` and
`allowance_expiring` are `info`, and `info` is not a health state.
`approaching_critical` is `warn` in `templates.ts` and can be `critical` from
core's `approachingCritical`. Which one the scheduler sends is undetermined,
so the row does not pick a chip.

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

There is no second control. One-click unsubscribe (RFC 8058) is an email
mechanism for optional kinds; its route is undetermined and it is not a
button on this page. Turning a switch off is the opt-out.

### States

Until the preference read is in `docs/API.md`, production renders the unread
states below, not the success picture. The PNG is the success picture so the
layout has a target. Do not hard-code the three switches on.

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

### Open questions for CEF

1. **The read and the write.** Document them in `docs/API.md` before WEBF
   calls anything. The screen needs, per optional kind, the effective
   `enabled` (the stored boolean, or `true` when the row is absent). A body
   of only stored rows is not enough. The write is one kind and one boolean,
   under the existing session and the CSRF header `GET /me` already returns.
   A required kind is refused. Reset is an update to the default, never a
   delete (`eg_api` has no DELETE). Do not include `updated_at` unless the
   screen is told to show it; it is not shown now.
2. **A verification field.** None exists. The three email sentences above
   are waiting on an explicit boolean in that document. Until then the
   screen uses the unknown sentence.
3. **A read of the send mode.** `ALERTS_SEND` is a Worker setting. Nothing
   returns it to the dashboard. Until a documented read exists, the sending
   line stays undetermined. The read has to preserve the byte comparison:
   only exactly `send` is on.
4. **Outbox history.** Not built. Do not add it from the table.
5. **The ledger count for `approaching_critical`, and the lead time for
   `allowance_expiring`.** Both undetermined in the alerts design. The
   screen says so. It does not substitute `120,960` or `17,280`.
6. **Which severity `approaching_critical` sends.** `templates.ts` says
   `warn`. Core's `approachingCritical` returns `critical` when health is
   critical. The row has no chip until one of those is the sent value.
7. **F3 and F5.** The alerts design leaves them undetermined and sends no
   user email for them today. They are not rows on this screen.

