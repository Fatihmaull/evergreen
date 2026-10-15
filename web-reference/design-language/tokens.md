# Tokens

Every value below is the one that ships. The authority is
`apps/web/src/styles.css`; this file is a readable copy of it, and
`apps/web/scripts/check-design-language.mjs` fails if the two disagree.

## Colour

### Grounds

| Token | Value | What it is |
|---|---|---|
| `--surface` | `#fcf9f8` | The page. Warm off-white, not white — the warmth is doing work and a neutral grey-white breaks the whole palette |
| `--paper` | `#ffffff` | A panel lifted off the page, in the dashboard only |
| `--pine-deep` | `#022419` | The landing hero, its nav and its footer. A full field of it |
| `--pine` | `#1a3a2e` | The dashboard sidebar, the 98% slab, the primary button |
| `--ink` | `#0f0f0f` | Display text, and the inverted cell that means *expired* |
| `--off-black` | `#262626` | Terminal and captured output. Never the page ground |

Terminal text is `#ececec` on `--off-black` (`styles.css`, `body.site .terminal`).
It is the one text colour that is not an alpha of the foreground, and it
exists only inside a terminal.

`--pine-deep` and `--pine` are deliberately different. The hero is a full field
of the deeper one so the `#1a3a2e` slab inside the page still reads as the
dominant object rather than as more of the same.

### Text

| Token | Value | Use |
|---|---|---|
| `--ink` | `#0f0f0f` | Headings, emphasis, figures |
| `--ink-2` | `rgba(15,15,15,.72)` | Body |
| `--ink-3` | `rgba(15,15,15,.62)` | Labels, captions, muted |

On dark grounds the same roles are alphas of `#fcf9f8`: `1` for headings,
`.82` for body, `.62` for labels, `.18`–`.28` for hairlines.

`--ink-3` was `.56` until 2026-09-26. It measured **4.32:1** on `--surface`,
just under WCAG AA's 4.5:1, and it is the colour behind most muted text on the
site. At `.62` it measures clear. **Do not take it back down.**

### Hairlines

| Token | Value |
|---|---|
| `--rule` | `rgba(15,15,15,.1)` |
| `--rule-strong` | `rgba(15,15,15,.44)` |

On dark: `rgba(252,249,248,.18)` resting, `.28` interactive.

### State

Five states, and each has a **shape as well as a colour** — see
[`components.md`](components.md). Colour alone is never the signal.

| State | Mark | Text | Fill |
|---|---|---|---|
| healthy | `#00a7b5` | `#00737d` | `rgba(0,167,181,.10)` |
| warning | `#c07c26` | `#965d17` | `rgba(192,124,38,.10)` |
| critical | `#c0392b` | `#a93226` | `rgba(192,57,43,.09)` |
| expired | `#fcf9f8` | `#fcf9f8` | `#0f0f0f` — solid, inverted |
| undetermined | `#7c6bb0` | `#5d4e8c` | `rgba(124,107,176,.10)` |

`--sage` `#7fa893` exists for chart strokes. It is not a text colour, and at
**2.53:1** on `--surface` it is also not enough on its own for a line that
carries meaning — see [`infographic.md`](infographic.md). The brand mark does
not use it: the mark is one colour, `--pine` on light grounds and `--surface`
on dark ones ([`brand.md`](brand.md)).

The state marks above are for light grounds. Measured on `--surface`: healthy
**2.79:1**, warning **3.26:1**, critical **5.19:1**, undetermined **4.37:1**.
The healthy mark is under the 3:1 a graphic needs, which is why a chip always
carries its word and a shape — the mark is never the only signal.

### State on dark grounds

Approved by Fatih on 2026-10-15. On `--pine`, the critical mark measured
**2.29:1** and the undetermined mark **2.72:1**, so neither could be seen on
the grounds social and video use most. Two marks are added; nothing else is.

| State | Mark on dark | Word | Fill | Mark on its fill, over `--pine` / `--pine-deep` |
|---|---|---|---|---|
| healthy | `#00a7b5` (unchanged) | cream `.82` | mark at `.14` | 3.47 / 4.56 |
| warning | `#c07c26` (unchanged) | cream `.82` | mark at `.14` | 3.11 / 4.13 |
| critical | **`#e75e4c`** — new | cream `.82` | mark at `.14` | 3.17 / 4.19 |
| undetermined | **`#9584cc`** — new | cream `.82` | mark at `.14` | 3.20 / 4.23 |
| expired | `#0f0f0f` on a solid `#fcf9f8` chip | `#0f0f0f` | `#fcf9f8` solid | inverted against its ground |

How they were derived, so nobody re-derives them differently: the light-ground
hue held in OKLCH, lightness raised until the mark clears 3:1 **against the
chip's own tint** over `--pine` — the lighter pine, so the worst case, and the
background the mark actually sits on. A first pass measured against bare pine
(`#dc5443`, `#8877bd`) and the rendered chip caught it at 2.87 and 2.76; those
two values are superseded and must not be used.

**On a dark ground the word is cream and only the mark carries the hue** — one
new colour per state instead of two, and the word at `.82` measures 7.1:1 or
better on every fill. Expired stays the state that inverts: on cream it is an
ink chip, on pine a cream one.

In the canvas templates these are `--crit-on-dark` and `--und-on-dark`. They
are **not yet in `styles.css`**; the site has no state on a dark ground today.
When the dashboard needs one, the stylesheet takes these values, not new ones.

For completeness, the light-ground chips have the same gap the site has always
had: on its own tint the healthy mark measures **2.51:1**. It is why the word
and the shape are never optional.

## Type

Three faces, one weight.

| Role | Family | Weight |
|---|---|---|
| Display | **Newsreader** | 400 only |
| Interface and body | **Inter** | 400 only |
| Data, labels, code | **Space Mono** | 400 only |

**Only weight 400 is downloaded** on the marketing and docs pages. A weight
that is not fetched cannot be reached for by accident, and that is deliberate.

> ⚠️ **The seven dashboard pages still fetch more.** `apps/web/src/chrome.mjs`
> requests Inter 500 and 600, Newsreader 500 and Space Mono 700. Nothing
> renders in them — every route measured 0 elements over 400 on 2026-10-15 —
> but they are downloaded, and a fetched weight is one a rule can reach. Logged
> for the web track to remove; this file states the target, not the defect.

**Inter is confirmed** as the interface and body face (Fatih, 2026-10-15). It
had been "proposed, awaiting confirmation" since the 2026-09-17 spec.

### Scale

Six sizes per surface, and one surface adds a seventh for long-form reference.

| | Marketing | Docs | Dashboard |
|---|---|---|---|
| figure | 72px | — | 40px |
| display | 36px *(closing only; `--t-display` in the canvas templates)* | — | — |
| heading | 28px | 28px | 28px |
| sub-heading | — | 20px | 20px |
| lead | 16px | 16px | 16px |
| body | 14px | 14px | 14px |
| label | 12px | 12px | 12px |

Two notes on what renders, measured on production 2026-10-15:

- **Docs pages render a sixth size, 11px**: the `.docs-tag` in the rail. It is
  below the 12px floor the stylesheet itself states, and it is the only text
  under 12px on any page. Treat it as a defect to remove, not as a step.
- **The dashboard's 40px figure is declared but did not render** on any of the
  seven dashboard routes at 1367px. The largest text there was 28px. Whether a
  state not visited shows it is undetermined.

For posters, social and video, every size is one of these multiplied by the
canvas scale `k` — see [`formats.md`](formats.md). There are no other sizes.

### Tracking flips at 16px

Below 16px, **positive** (+0.01em to +0.02em). Above, **negative**, scaling with
size: −0.005em at 20px, −0.0125em at 28px, −0.018em at 36px, −0.03em at 72px.

Standard typographic practice, free, and almost no generated page does it.

### Measure

Never more than **80 characters a line**. Note that `ch` is the advance of `0`,
which in Inter is far wider than the average glyph — `62ch` renders as about
**85** characters. Set measures from counted characters, not from the unit.
Paragraph measures on the site are 52–54ch, which lands near 75 characters.

## Space

Three values carry the whole marketing surface:

| | |
|---|---|
| Between sections | **67.2px** (`4.2rem`) |
| Above the hero | **112px** (`7rem`) |
| Below the closing | **134.4px** (`8.4rem`) |

Container `1300px`, gutter `clamp(20px, 5vw, 32px)`. Docs three-column:
**260 / 704 / 240**. Feature composition: **31 / 69**.

## Radius

| | |
|---|---|
| Buttons and chips | full pill (`100vw`) |
| Surfaces, slabs, terminals | **4px** |
| Small controls | 4–6px |
| Dashboard panels, stat cells, table and graph wraps | **8px** — dashboard only |
| Where borders intersect in a continuous row | **0** |

On the marketing and docs pages nothing is larger than 6px. The dashboard's
containers are 8px, and that is what ships: measured on `.stat`,
`.contract-card`, `.card`, `.table-wrap` and `.graph-wrap`, 2026-10-15. Until
2026-10-15 this file said "nothing is larger than 6px" without that exception,
while [`components.md`](components.md) gave panels 8px — both were in this
directory at once. New dashboard containers match the 8px; nothing else uses it.

A full pill around a block of monospace reads as generated — that mistake was
made and corrected on 2026-09-25. On a canvas, radius scales with the canvas:
4px is `4px × k`.

## Motion

| | |
|---|---|
| Colour, background, transform | `150ms cubic-bezier(0.4, 0, 0.2, 1)` |
| Opacity | `200ms cubic-bezier(0.4, 0, 0.2, 1)` |

Those are the only two durations in the stylesheet. See [`motion.md`](motion.md)
for what is deliberately not animated.

## The two gradients

Both are transitions between the cream field and the green field. Both use a
**smoothstep** placed as eight `color-mix(in oklab, …)` stops, because a linear
ramp meets a flat colour with a visible corner at each end — which is what
reads as a band rather than a transition.

| | Height | Direction |
|---|---|---|
| Below the hero | `clamp(120px, 12vw, 180px)` | `#022419` → `#fcf9f8` |
| Above the closing | `clamp(180px, 18vw, 300px)` | `#fcf9f8` → `#022419` |

The second is longer because it meets a flat cream field, where a short ramp
has nowhere to hide its start.

Stop positions and their mixes, if you need to rebuild the curve by hand:

```
 12.5% → 4.3%     25% → 15.6%     37.5% → 31.6%     50% → 50%
 62.5% → 68.4%    75% → 84.4%     87.5% → 95.7%
```

## One legacy note

`--step-0` through `--step-5` are a fluid scale left from the original export.
They still back a handful of dashboard rules. **Do not use them in new work** —
the `--t-*` and `--d-*` scales above are the live ones. There is also a dead
`var(--step--1)` on `.expired-cell`, referring to a token that does not exist;
the declaration is invalid and the element inherits its context size instead.
