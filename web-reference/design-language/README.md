# Evergreen design language

Extracted from `apps/web/src/styles.css` and from measurements of the built
pages on 2026-09-29, not from a design export. An earlier export exists at
`../evergreen_protocol/DESIGN.md`; its own header records that **only the
typefaces, the warm surface and the status tones were adopted** from it, and
everything else in it was superseded. Where the two disagree, this directory
and the stylesheet are right.

**Audience.** Anyone producing material that has to sit beside this product and
look like it belongs — a demo video, a slide, a diagram, a social card. It is
written so an agent with no access to the running site can match it.

| File | What it settles |
|---|---|
| [`tokens.md`](tokens.md) | Every colour, size, space and duration, with the value that actually ships |
| [`components.md`](components.md) | The recurring objects — chips, terminals, figures, tables — and their exact appearance |
| [`motion.md`](motion.md) | The motion grammar, and what this product deliberately never animates |
| [`claims-and-copy.md`](claims-and-copy.md) | What may appear as on-screen text, what may not, when each ban lifts, and the real numbers |
| [`brand.md`](brand.md) | The mark, wordmark, lockup, clear space, minimum sizes, favicon, misuse |
| [`formats.md`](formats.md) | Canvas sizes, safe areas and the scale rule for social, link cards, video frames and print |
| [`infographic.md`](infographic.md) | Data in an image: scope, unrounded figures, six answers each with a shape, charts |
| [`motion-graphics.md`](motion-graphics.md) | `motion.md`'s grammar extended to video: the shot, what may move, what never does |
| [`source/`](source/README.md) | Vector masters, the favicon set, canvas templates, the tools that build and render them, and the renders |

**Who decides.** Since 2026-10-15 this directory has one owner, the design
authority, for every medium: site, dashboard, posters, social, infographics,
video, the identity. The web agents implement it in `apps/`; the marketing
agent consumes it and its output is reviewed against it. A new colour, face or
weight needs Fatih's approval.

---

## The seven rules

If nothing else survives the trip, these do. Six of the seven are measured by
`apps/web/scripts/check-design.mjs`, which exits non-zero on a regression.
**It is not in CI and not in `pnpm check`** (its own header says so, and so do
`check-layout.mjs` and `check-design-language.mjs`), so today it fails only
when someone runs it. It is a gate a person has to open, not a build failure.

**1 · Nothing is bold.** Every weight on the site is 400. Hierarchy is carried
by size and colour alone. A 600 was tried once, on one heading, and removed
because it looked heavy — the budget for elements heavier than 400 is now
**zero on every page**. Emphasis is a shift to full-strength ink, not weight.

**2 · One dominant element per screen.** Exactly one element on the landing
page is larger than 40px, and it is the 98%. A page that shouts on every screen
has no dominant element anywhere. In a video this reads as: one thing per shot.

**3 · Borders are an alpha of the foreground, never a grey.** `rgba(15,15,15,.1)`
on light, `rgba(252,249,248,.18)` on dark. A grey hex hairline is the single
most reliable tell of a generated design, and the check refuses one.

**4 · Two gradients exist, and they are transitions between colour fields.**
Not decoration, not a section divider. Both are smoothstep curves interpolated
`in oklab`, because a linear ramp meets a flat colour with a visible corner and
sRGB runs through grey between a dark green and a warm off-white.

**5 · Measured numbers are never rounded.** `8,116,648`. `4,793,687`.
`5.000000 s ± 0.000050`. `720`. Round numbers read as invented; these are not,
and the precision is the credibility. Rounding one on screen is the fastest way
to make this product look like every other one.

**6 · Space does the work a box would do.** The three marketing pages contain
**zero cards**. Related things sit close, unrelated things sit far apart, and a
hairline marks a boundary where one is genuinely needed.

**7 · Nothing moves that a person did not ask to move.** No scroll-triggered
entrances, no parallax, no counters that tick up, no header that reacts to
scrolling. See [`motion.md`](motion.md) — this one matters most for video,
because it is the rule a motion designer will break by reflex.

---

## Two surfaces, one language

| | Marketing and docs | Dashboard |
|---|---|---|
| Body class | `body.site` | `body.app` |
| Ground | warm off-white `#fcf9f8`, with the landing hero in deep pine | warm off-white, pine sidebar |
| Chrome | 52px bar, three zones, scrolls away | 264px sidebar, status bar |
| Type sizes | 6 | 6 |
| Cards | none | panels, where a panel holds an instrument |

They share the palette, the typefaces, the motion and all seven rules. The
difference is that the dashboard is an instrument and is allowed to group
readings into panels; the marketing pages are an argument and are not.

## If you are here to cut the demo video

The shot list already exists: [`docs/W4-D28-01-DEMO-SCRIPT.md`](../../docs/W4-D28-01-DEMO-SCRIPT.md),
walked and timed at **4m20s** on 2026-09-23 against the 3–5 minute requirement.
It settles *what* is shown and in what order. This directory settles what it
should look like while it is shown.

Read them in that order, then [`claims-and-copy.md`](claims-and-copy.md)
before writing a single frame of on-screen text — it is the shortest file here
and the one that prevents a re-cut.

The live site is the other reference, and it is the authority when anything
here is ambiguous: **<https://evergreen-stellar.pages.dev>**. Production deploys
from `main`, and its stylesheet and landing page were byte-identical to the
repository on 2026-10-15. The preview this file used to name,
`feat-w4-d25-01-ui-rework.evergreen-stellar.pages.dev`, is stale: it predates
the mark.

## Decisions of 2026-10-15

Taken by Fatih after the design audit of the same day.

| Decision | Where it lives |
|---|---|
| The mark is the one in the header, unchanged; only a favicon was missing | [`brand.md`](brand.md) |
| The hero video stays until the phase-2 dashboard work is done, then is re-cut | [`motion-graphics.md`](motion-graphics.md) |
| A state palette for dark grounds: two new marks | [`tokens.md`](tokens.md) § State on dark grounds |
| This directory is the single design authority; web agents implement | above; `phase-2/kickoff/WEBF.md`, `WEBR.md` |
| Inter is confirmed as the body and interface face | [`tokens.md`](tokens.md) § Type |

## Decisions of 2026-10-18

Taken by Fatih on review of #304. The values are now settled; the web track
implements what applies to the site, in `styles.css`.

| Approved | Where it lives |
|---|---|
| Dark-ground state marks `#e75e4c` (critical) and `#9584cc` (undetermined), and their chip rules | [`tokens.md`](tokens.md) § State on dark grounds |
| Input border `rgba(15,15,15,.5)`; dialog scrim `--ink` at `.30` | [`components.md`](components.md) § Phase 2 components |
| The 9 × 2 bar for *incomplete* | [`components.md`](components.md), [`infographic.md`](infographic.md) |
| Canvas scale *k* = 2, for templates only | [`formats.md`](formats.md) |
| `--sage` as text: document what ships, not a blanket ban | [`tokens.md`](tokens.md) § State |

Still WEBF's to fix in `styles.css`, against rules that already exist: the
11px `.docs-tag`, the weights above 400 fetched by the dashboard, and the
uppercase table and stat headers.

## Verifying

`node apps/web/scripts/check-design.mjs` counts type sizes, cards, icons,
gradients, bold elements, elements over 40px and opaque borders on 19 pages and
fails when any exceeds its budget. One known blind spot: it measures each page
300ms after load, and on `/dashboard/` it reads **0 cards against a budget of
6**, while production shows at least five card-shaped panels once the live
read returns. The cause is probably that timing; that is *undetermined*. `--commission` plants each defect and proves
the check still catches it. `node apps/web/scripts/check-layout.mjs` renders
31 routes at two widths and asserts nothing overflows its box.

`node web-reference/design-language/source/tools/render.mjs` renders every
canvas template and refuses to when `source/templates/base.css` has drifted
from `styles.css`; `--commission` proves the refusal.
`python3 -I web-reference/design-language/source/tools/build_brand.py` rebuilds
the vector masters and favicons, and refuses when the trace stops matching the
mask the site renders.

