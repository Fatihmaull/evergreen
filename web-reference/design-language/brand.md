# Brand

The mark, the wordmark, the lockup, the favicon, and what never happens to
them. Written 2026-10-15.

## The mark is the one on the site

Fatih decided on 2026-10-15: **the mark is the one already in the header,
unchanged, and its implementation stays as it is.** It was supplied on
2026-09-30 and placed by #287 (`W4-D22-08`). The site still derives it at
build time from `apps/web/src/assets/evergreen-logo.jpeg`, and nothing in this
directory changes that.

What this directory adds is the same mark in the forms other media need:

| File | What it is |
|---|---|
| [`source/brand/evergreen-mark-pine.svg`](source/brand/evergreen-mark-pine.svg) | Vector master, `--pine`, for light grounds |
| [`source/brand/evergreen-mark-cream.svg`](source/brand/evergreen-mark-cream.svg) | Vector master, `--surface`, for pine, pine-deep, ink and off-black |
| [`source/brand/evergreen-mark-ink.svg`](source/brand/evergreen-mark-ink.svg) | Vector master, `--ink`, for one-colour print and for use as a mask |
| [`source/favicon/`](source/favicon/) | The favicon set — see below |
| [`source/renders/brand-proof.png`](source/renders/brand-proof.png) | Every size on every ground, rendered, plus the favicon tiles |

**The vectors are traced, not redrawn.** The site's mask takes its alpha from
the JPEG's red channel (`clamp(1.9 − 2R)`, `apps/web/build.mjs`).
[`source/tools/build_brand.py`](source/tools/build_brand.py) reproduces that
field and traces its 0.5 isoline, so the vector is the silhouette the site
already renders. It measures **IoU 0.9927** against that mask, and the script
refuses to write anything below 0.99. Seven shapes: the ring, the leaf, five
ticks.

### One colour, always

The mark is a single flat colour, and only one of these:

| Ground | Mark |
|---|---|
| `--surface` `#fcf9f8`, `--paper` `#ffffff` | `--pine` `#1a3a2e` — 11.87:1 on the surface |
| `--pine`, `--pine-deep`, `--ink`, `--off-black` | `--surface` `#fcf9f8` |

The source JPEG holds two greens, about `#035336` and `#1a8c35`. **They are not
tokens and they never appear.** The site already renders the mark as one
colour (green on light pages, cream on pine), and every other medium follows
it. A two-green mark would be the only element in the identity with two hues.

## The wordmark and the lockup

The wordmark is **"Evergreen" in Newsreader 400**, sentence case. The spec's
proposal to test Inter 600 for it (`EVERGREEN-PRODUCT-AND-DESIGN-SPEC.md` §9)
is superseded. The site chose Newsreader, and nothing is bold.

The lockup as measured on the live header, 2026-10-15:

| | Value | In units of the wordmark's size *s* |
|---|---|---|
| Wordmark | Newsreader 400, 16px, −0.005em | *s* |
| Mark slot | 24 × 24px, mark contained and centred (it renders 24 × 20) | 1.5*s* |
| Gap | 9px | 0.5625*s* |
| Order | mark, then word, on one baseline-centred row | — |

Scale the lockup as a unit by *s*. In the canvas templates *s* is
`16px × k` (see [`formats.md`](formats.md)).

## Clear space

Let *m* be the height the mark renders at. Keep **0.5*m*** clear on every side
of the mark, and of the lockup, measured from the mark's own edge rather than
its slot. Nothing enters that space: text, rules, other marks, the edge of a
crop.

The live header meets this. The mark is 20px tall with 16px above it, and the
52px bar holds nothing else within 10px of it.

## Minimum sizes

| Use | Minimum | Measured |
|---|---|---|
| Screen, the mark | **24px wide** | the shipped size; tick gaps hold at 1× |
| Screen, the lockup | wordmark at **16px** | the shipped size |
| Favicon | **16px**, inside its tile | the only use under 24px; the browser chooses it |
| Print | **8mm wide** | *undetermined:* not yet proofed on paper |

At 16px wide outside a tile, the five ticks merge into a smudge and the leaf's
vein closes. The proof sheet shows the progression from 16 to 128.

## The favicon set

| File | Size | Content |
|---|---|---|
| `favicon.svg` | vector, 32-unit tile | `--surface` mark on a `--pine` square, 2-unit side inset |
| `favicon.ico` | 16, 32, 48 | the same tile, rasterised per size |
| `apple-touch-icon.png` | 180 | `--pine` square, mark at 62% width; iOS rounds the corners itself |
| `icon-192.png`, `icon-512.png` | 192, 512 | maskable: the mark at 58% width, inside the 80% safe circle |
| `site.webmanifest` | — | names the two icons; `theme_color` `#022419`, `background_color` `#fcf9f8` |

**Why a pine tile rather than a transparent mark:** a browser tab is light or
dark at the visitor's choice, and a pine mark on a dark tab measures 1.03 to
1.29:1 (against `#35363a`, `#3c3c3c`, `#292a2d` and `#202124`) — invisible. The tile carries its own ground, so it reads on both. It is the same
pairing as the dashboard sidebar: a cream mark on pine.

**Wiring it** is for the web track (the site's `<head>` is in `apps/`). The
files go at the site root, and the pages get:

```html
<link rel="icon" href="/favicon.ico" sizes="48x48" />
<link rel="icon" href="/favicon.svg" type="image/svg+xml" />
<link rel="apple-touch-icon" href="/apple-touch-icon.png" />
<link rel="manifest" href="/site.webmanifest" />
```

Production has no favicon link today, so tabs show the browser's default
(checked 2026-10-15).

### Why there is no small mark

Two simplified variants were built from the trace for sizes under 24px, and
both were rejected on their renders:

1. **Without the ticks:** the ticks are the upper-left of the letter. Remove
   them and the "e" reads as a "2" beside a leaf.
2. **With the ticks closed into a solid arc:** the gaps fill as a row of teeth,
   and the ring reads as a gear.

So there is one mark at every size. At 16px it is soft, but it is still an
"e" with a leaf, which neither variant was.

## Misuse

None of these, in any medium:

- the two greens of the source file, or any colour but the two above;
- the mark on a photograph, a gradient, a state colour or `--sage`;
- outline, stroke, shadow, glow, bevel or any effect;
- rotating, skewing, mirroring, or reflowing the lockup into a stack;
- animating the mark (see [`motion-graphics.md`](motion-graphics.md));
- the wordmark in any face or weight but Newsreader 400, or in capitals;
- a container around the mark (circle, rounded square, badge), except the
  favicon tile, which exists because a tab has no ground of its own;
- the mark smaller than its minimum, or inside its own clear space.

## Still open

- **Figurative trademark search.** `BACKLOG.md` (`W4-D22-08`) records that the
  search (WIPO Global Brand Database, DJKI) "is still required before any mark
  is adopted", and that the 2026-09-30 change did not resolve it. It has not
  run. **Until it does, the mark appears only on Evergreen's own surfaces** —
  the site, the repository, Evergreen's own accounts. Nothing is printed for
  distribution, registered, or put into paid placement. This is the
  backlog's own condition, restated as a rule for marketing.
- **The name.** The backlog also notes an open-source library system written
  "Evergreen® ILS" by a library cooperative, whose mark was not reviewed.
- **Print colour.** The tokens are sRGB. A CMYK or spot conversion for pine
  and the surface has not been made or proofed: *undetermined*.
