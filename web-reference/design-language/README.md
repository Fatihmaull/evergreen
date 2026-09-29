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
| [`claims-and-copy.md`](claims-and-copy.md) | What may appear as on-screen text, what may not, and the real numbers |

---

## The seven rules

If nothing else survives the trip, these do. Six of the seven are enforced by
`apps/web/scripts/check-design.mjs`, which fails the build rather than filing a
complaint, so they are not preferences.

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
here is ambiguous: <https://feat-w4-d25-01-ui-rework.evergreen-stellar.pages.dev>

## Verifying

`node apps/web/scripts/check-design.mjs` counts type sizes, cards, icons,
gradients, bold elements, elements over 40px and opaque borders on 19 pages and
fails when any exceeds its budget. `--commission` plants each defect and proves
the check still catches it. `node apps/web/scripts/check-layout.mjs` renders
31 routes at two widths and asserts nothing overflows its box.
