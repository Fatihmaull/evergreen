# Motion

This is the file most likely to be ignored, so it says the hard part first.

## The site barely moves, and that is the design

There are **two transitions in the entire stylesheet**:

| | |
|---|---|
| Colour, background, transform | `150ms cubic-bezier(0.4, 0, 0.2, 1)` |
| Opacity | `200ms cubic-bezier(0.4, 0, 0.2, 1)` |

Both are short and boring on purpose. Everything below was considered and
deliberately **not built**:

- no scroll-triggered entrances — nothing fades or slides in as you reach it
- no parallax
- no counters that tick up to a number
- no header that hides, shrinks or changes colour as you scroll
- no skeleton shimmer
- no hover animation that moves an element; hovers change colour only
- no page-load sequence

A scroll-reactive navbar and an animated footer reveal both existed in the
original design export and were both cut. The note in `site.mjs` records why:
a header that moves when you scroll is a thing the visitor has to track.

## What this means for a video

A motion designer's reflex is to animate everything in. **Do not.** A video
that slides, bounces and counts its way through this product will not look
like the product, and the product's restraint is the argument it is making —
a tool whose whole claim is "we measured this rather than assuming it" cannot
open with a number spinning up to its value.

**Borrow the easing, not the enthusiasm.** `cubic-bezier(0.4, 0, 0.2, 1)` is
the vocabulary. 150ms is the unit; a transition that needs longer should use a
multiple of it rather than a new curve.

### What earns movement

| Do | Why |
|---|---|
| A cut, or a soft dissolve at 150–300ms | The site's own transitions are colour changes, and a cut is the honest equivalent |
| The cream ↔ green field change as a **soft wipe**, not a hard cut | This is the one gradient the site has, and it is a transition between fields |
| Real terminal output typing at a real pace, or simply appearing | The output is the artefact; it does not need help |
| A chart drawing along its own path, once, at 150–400ms | The decay chart is a record; drawing it in reading order is legible, not decorative |
| Holding still | Most of the time. A shot that holds while a person reads is doing its job |

### What does not

| Do not | Why |
|---|---|
| Animate a measured number from 0 | It never had those intermediate values. The number is a reading |
| Slide, fade or scale text in on every cut | Nothing on the site does this |
| Add a glow, bloom, shadow or depth blur | The site has **no shadows at all**. Elevation is hairlines and tonal stacking |
| Add particles, grids, scan lines or a "data" ambience | None of it is in the product and all of it is the aesthetic this rework removed |
| Use easing with overshoot or bounce | There is no spring anywhere in this product |
| Move the navigation | It scrolls away; it does not animate |

## Reduced motion

The site honours `prefers-reduced-motion`, including pausing the hero video and
removing its loop. A deliverable that cannot honour a system setting should at
minimum avoid the things that setting exists to prevent: sustained loops behind
text someone is trying to read, and rapid repeated movement.

## Timing, if you need numbers

| | |
|---|---|
| Easing | `cubic-bezier(0.4, 0, 0.2, 1)` everywhere |
| Short transition | 150ms |
| Opacity | 200ms |
| Field change (cream ↔ green) | 400–800ms as a soft wipe; the static gradient is 120–300px deep, so it is a gradual edge rather than a line |
| A shot holding on one dominant element | long enough to read it — the site's rule is one dominant element per screen, and the video equivalent is one per shot |

## The hero video, as a worked example

The landing page already carries a 20-second looping product video, and how it
is handled is the best available statement of intent:

- muted, looping, inline, **no controls** — an artefact, not a player
- no window chrome around it and no rounded card
- `preload="metadata"` with a poster frame, so the slot is filled on first
  paint rather than after four megabytes arrive
- paused entirely under `prefers-reduced-motion`
- 16:9, filling the container at every width from 1680 down to 360

It sits in a reserved slot with the ratio on the container, so the space exists
before the file does and dropping one in reflows nothing.
