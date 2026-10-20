# Formats

Canvas sizes, safe areas and the scale rule for everything that is not a web
page: social posts, link cards, video frames, posters. Written 2026-10-15.

The rule that makes every format recognisably the site: **a canvas is the site
at a fixed size.** Same grounds, same faces, same weight, same six type roles,
same hairlines, same single dominant element. Nothing is invented per format.

## The canvas scale *k*

Every size on a canvas is a site size multiplied by **k** (approved by Fatih
2026-10-18, **for the templates only**: *k* never enters `styles.css`, and the
site keeps its own sizes). That covers type,
gaps, padding, radius and the lockup. At the reference sizes below, **k = 2**
everywhere, because each canvas is shown at about half its pixel width (a
1080px post on a ~540pt phone, a 1920px frame in a ~960px player, an A3 poster
read from a step back).

| Role | Site | On a canvas, k = 2 | Face |
|---|---|---|---|
| figure | 72px | **144px** | Newsreader, −0.03em |
| display | 36px | **72px** | Newsreader, −0.018em |
| heading | 28px | **56px** | Newsreader, −0.0125em |
| sub-heading | 20px | **40px** | Newsreader, −0.005em |
| lead | 16px | **32px** | Inter, 0 |
| body | 14px | **28px** | Inter, +0.01em |
| label | 12px | **24px** | Space Mono, +0.02em |

**There are no other sizes.** Tracking follows the role, not the pixel count.
A 28px body line on a canvas keeps body's +0.01em even though 28px would be a
heading on the site.

**One dominant element.** The site's rule, scaled: **at most one element is
larger than 40px × k** (80px at k = 2), and when there is one, it is the
dominant element. Normally that is a figure at 144px. A canvas with no figure
has nothing over 80px, and its display line at 72px is the dominant element.
Measured on every template's render, 2026-10-15: the only elements over 80px
are `98%` (square, poster), `expired` (square-dark) and the headline
(landscape), one per canvas.

To make a canvas at another size, change *k* in proportion to the width and
keep everything else. A 1440px square is k = 2.67.

## The formats

| Format | Canvas | Safe area (top · sides · bottom) | Template |
|---|---|---|---|
| Feed square | 1080 × 1080 | 64 · 64 · 64 | [`square.html`](source/templates/square.html), [`square-dark.html`](source/templates/square-dark.html) |
| Feed portrait 4:5 | 1080 × 1350 | 64 · 64 · 64 | [`portrait.html`](source/templates/portrait.html) |
| Landscape 16:9, social and video | 1920 × 1080 | 96 · 160 · 96 | [`landscape.html`](source/templates/landscape.html) |
| Story 9:16 | 1080 × 1920 | **250** · 64 · **340** | [`story.html`](source/templates/story.html) |
| Link card (Open Graph) | 1200 × 630 | 64 · 64 · 64 | [`og.html`](source/templates/og.html) |
| Poster A3 | 297 × 420mm + 3mm bleed | 12mm inside trim | [`poster-a3.html`](source/templates/poster-a3.html) |

Each has a rendered proof in [`source/renders/`](source/renders/), and a copy
with its safe area drawn in [`source/renders/guides/`](source/renders/guides/).

Notes per format:

- **Feed square and portrait.** 64px is the site's maximum gutter (32px) at
  k = 2. Profile grids crop portrait posts towards 3:4, which takes about 34px
  off each side; the 64px margin absorbs it.
- **Landscape.** The 5% title-safe inset (96px) on top and bottom. The sides
  are 160px so the measure stays under 80 characters at lead size. The same
  frame is the video title card (see [`motion-graphics.md`](motion-graphics.md)).
- **Story.** Platforms draw their own chrome over the top 250px and the bottom
  340px. Nothing that has to be read goes there; the ground does.
- **Link card.** Some clients crop it to a centred square. The words that must
  survive sit in the left 630px.
- **Poster A3.** The page is 303 × 426mm, which is A3 plus 3mm of bleed on
  every side; trim is A3. At 96 CSS px per inch A3 is 1123 × 1587px, so k = 2
  matches the digital canvases. For A2, use k = 2.83. The PDF is **sRGB**, and
  a CMYK conversion has not been made or proofed: *undetermined.* Printing the
  cream ground on white stock needs the bleed; a printed proof of `#fcf9f8`
  has not been seen.

## Grounds

A canvas has **one ground**, chosen from three:

| Ground | Use |
|---|---|
| `--surface` `#fcf9f8` | the default, as the site's |
| `--pine` `#1a3a2e` | a full field; the dashboard sidebar's colour |
| `--pine-deep` `#022419` | a full field; the landing hero's. Title cards |

**No gradients on a canvas.** The site's two gradients are transitions between
fields on a page that scrolls, and a fixed canvas has only one field. A
gradient ground, a vignette or a texture is the aesthetic this system removed.
A cell may invert inside its ground (the temporary-entry cell, the expired
cell), exactly as on the site.

On a dark ground, text roles become alphas of `#fcf9f8` (1 heading, .82 body,
.62 label, .18 hairline), and state marks use the dark-ground set in
[`tokens.md`](tokens.md).

## What every canvas carries

1. **The lockup**, top-left, at its proportions (see [`brand.md`](brand.md)).
2. **"Stellar testnet"** and **`evergreen-stellar.pages.dev`** in a label line
   at the bottom, on any canvas that shows the product or a number. It is the
   canvas form of the site's obligatory footer
   ([`claims-and-copy.md`](claims-and-copy.md)).
3. **A number's scope**, whenever there is a number. See
   [`infographic.md`](infographic.md).

Nothing else is obligatory, and nothing is decoration.

## Making one

1. Copy the closest template in [`source/templates/`](source/templates/). Change
   the words; leave the classes alone.
2. Take every word from the live site or [`claims-and-copy.md`](claims-and-copy.md).
   A sentence that does not appear on the site is a new claim and needs that
   file's review first.
3. Render:

   ```bash
   node web-reference/design-language/source/tools/render.mjs
   ```

   It refuses to render if `templates/base.css` has drifted from
   `apps/web/src/styles.css`. `--commission` proves that refusal still works.
4. Look at the render, not the HTML. The first render of `square-dark.html`
   lost two lines of text that read correctly in the source.
5. Export **PNG, sRGB, at canvas size**. Not JPEG: platforms recompress
   anyway, and a JPEG around 24px mono text arrives already soft.

The templates load Inter, Newsreader and Space Mono from Google Fonts, the same
request the site makes, so rendering needs a network connection. A render
without the fonts falls back to Georgia and system sans. That is a broken
render, not a variant.
