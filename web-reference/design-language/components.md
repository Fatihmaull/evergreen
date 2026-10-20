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
`phase-2/PHASE2-PLAN.md`; this is appearance only.

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

