# Infographics

Rules for any image that carries data: a social graphic with a number, a
chart in a slide, a diagram in a post, a poster. Written 2026-10-15. The
dashboard's live charts follow [`components.md`](components.md) § Chart, and
everything here is consistent with it.

An infographic is a claim with a picture attached. Every rule below is a rule
the product already follows, restated for an image that has no tooltip, no
link and no second paragraph to rescue it.

## 1 · The scope travels with the number

A figure never appears without its denominator and its subject, **in the same
image, at body size or larger**, adjacent to the figure. Not in a caption
under the post, not in alt text only, not in a footnote.

| Not this | This |
|---|---|
| **98%** of rent is code | **98%** — of guinea-pig A's rent, 8,116,648 of 8,264,289 stroops, across all four of its entries |
| Saves 99% | Two figures, two scopes, and the sentence that says why they differ |

The 98% and the 99% are the same entry under two denominators. An image that
shows one without its scope has made a different claim from the site's.

## 2 · Measured numbers are never rounded

`8,116,648`, not "8.1M". `5.000000 s ± 0.000050`, not "5 seconds", when it is
quoted as a measurement. `720 ledgers`, not "~700". Units always: *stroops*,
*ledgers*, *s*. Thousands separators are commas, locale pinned (the spec's
Part Seven explains why: an unpinned locale turns `120,909` into `120.909`).

**Derived values carry a `~`.** A date computed from ledgers at five seconds
each is an estimate: `~21 September 2026`, with the ledger beside it in mono
(`4,793,687`). Ledgers are the truth; dates are a convenience. Never a
countdown to the second.

Use only the figures in [`claims-and-copy.md`](claims-and-copy.md) § The real
numbers. Any other figure needs a committed source — an evidence file in
`docs/evidence/` or a transaction hash — named in the image's source line.

## 3 · Six answers, each with a shape

Five states of an entry, and one state of the check itself. **Colour is never
the only signal.** Each has a shape and a word, and an infographic shows all
three.

| Answer | Shape | Light ground: mark / word | Dark ground: mark / word |
|---|---|---|---|
| healthy | circle | `#00a7b5` / `#00737d` | `#00a7b5` / cream .82 |
| warning | triangle, base 10 × height 9 | `#c07c26` / `#965d17` | `#c07c26` / cream .82 |
| critical | square, 8, rotated 45° | `#c0392b` / `#a93226` | `#e75e4c` / cream .82 |
| expired | solid square, chip inverted | `#fcf9f8` on `#0f0f0f` | `#0f0f0f` on `#fcf9f8` |
| undetermined | hollow ring, 2px stroke | `#7c6bb0` / `#5d4e8c` | `#9584cc` / cream .82 |
| incomplete | short bar, 9 × 2 | `--ink-2` / `--ink`, hairline outline, no fill | cream .82 / cream, hairline outline |

Sizes are at site scale; multiply by *k* on a canvas. The chip geometry is in
[`source/templates/base.css`](source/templates/base.css) and is the site's own.

- **Expired is a finished fact, not an alarm.** It is drawn as an inverted
  cell, never in red. Its word is the entry's ending: *archived*, or *deleted*
  for a temporary entry.
- **Undetermined is its own colour and its own word, never grey and never a
  softer green.** Its three words each say why it is not known:
  *undetermined*, *unread*, *not found*. They share the violet and the ring.
- **Incomplete is not a state of the entry.** The check did not run, so it
  takes no state colour and is never violet. On the site it is the neutral
  verdict panel. On a canvas it is the bar shape in ink.
- **Never a check mark, never a cross.** A green check beside an undetermined
  value is the easiest way to undo this product's one hard-won fix.

**Marks on light grounds measure low on their own tint** (healthy 2.51:1).
That is why a mark never stands alone: the word beside it carries the
contrast. On dark grounds every mark clears 3:1 on its tint; see
[`tokens.md`](tokens.md) § State on dark grounds.

## 4 · Absence is not health

An image of a scan result states what the scan covered, in the same weight as
the verdict. "Nothing wrong in what was checked" is a different claim from
"nothing wrong". If the image cannot carry the coverage, it does not show the
verdict.

## 5 · Charts

As [`components.md`](components.md) § Chart, with what an image adds:

- **Dots are recorded observations, and only those.** The caption's count of
  observations must equal the dots drawn.
- **A solid segment only where the record shows nothing happened between two
  observations.** A dashed segment only for an honest projection, labelled as
  one. No smoothing, no spline, no area fill under a line.
- **Thresholds are hairline bands with their value at the end of the line**
  (`120,960`, `17,280`), never a coloured zone.
- **Label directly.** Each series is named at its line. A legend placed apart
  from the data is a second thing to read.
- **Line colour.** `--sage` measures **2.53:1** on the surface, under the 3:1 a
  line needs when it carries meaning by itself. Use `--pine` for the line that
  matters and sage only for a secondary edge that is also labelled.
- **The horizontal axis is ledgers**, with `~` dates as secondary labels.
- **Never:** 3D, pie or donut, gauges, icons standing in for numbers, a chart
  drawn to a scale that does not start where its axis says.

## 6 · Composition

The canvas rules in [`formats.md`](formats.md) hold: one dominant element, one
ground, the six type roles at *k*. In an infographic the dominant element is
the number or the chart. If it is the chart, no figure on the canvas is over
40px × k.

Space separates; boxes do not. Group with proximity and divide with a hairline
where a boundary is genuinely needed. The four entry kinds are a hairline grid
with radius 0 and one inverted cell, as in
[`portrait.html`](source/templates/portrait.html), not four cards.

## 7 · Every infographic carries a source line

A label line naming where the numbers come from. The evergreen-stellar.pages.dev
page that shows them, or the evidence path, and the network: **Stellar
testnet**. A number with no source line is rejected in review, whoever drew it.
