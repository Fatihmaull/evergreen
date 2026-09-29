# Components

The recurring objects, with the values they actually render at. If you are
rebuilding one of these in another medium, these are the proportions to keep.

## The eyebrow

Space Mono, **12px**, `+0.02em`, `--ink-3`. Sentence case — **not uppercase**.
It sits above a heading and names the section, and on a documentation page it
also does the job a breadcrumb would.

There is one uppercase label left on the site, in the dashboard sidebar, and it
is three short words. Thirty-three characters of uppercase was removed on
2026-09-26 for being a passage rather than a label.

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

Height ~24px, `5px 10px`, full pill, Space Mono 12px. A 6px mark leads the
label, and **the mark's shape differs per state** — colour is never the only
signal:

| State | Mark |
|---|---|
| healthy | circle |
| warning | triangle, 10px base × 9px |
| critical | 8px square rotated 45° |
| expired | a light square on a solid `#0f0f0f` chip |
| undetermined | hollow ring |

The expired chip is the only one that inverts: solid ink ground, warm-white
mark and text.

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
and docs surfaces. Header row in Space Mono 12px `--ink-3` with a hairline
under it; cells at 14px with a hairline under each row; numeric and identifier
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
`--rule` border, 8px radius, `20px 22px` padding. A panel holds a chart and its
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
