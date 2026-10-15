# Motion graphics

[`motion.md`](motion.md) is the grammar: two transitions, one easing, and a
list of what this product never animates. This file extends that grammar to
video — demo cuts, social clips, title cards, screen recordings. Written
2026-10-15. Where the two seem to differ, `motion.md` wins.

**The one sentence:** a frame is a canvas ([`formats.md`](formats.md)), a shot
is one dominant element, and nothing moves that a viewer did not need to see
move.

## The shot

- **One thing per shot.** The site's rule of one dominant element, applied per
  shot. A shot that needs two dominant things is two shots.
- **Hold it long enough to be read twice.** A heuristic, not a measurement:
  about three words a second, so a 12-word line holds about 8 seconds. Holding
  still is most of what good shots here do.
- **Frames are 1920 × 1080, k = 2,** with the landscape safe area. A vertical
  clip is the story canvas, with the platform chrome kept clear top and bottom.
- **Grounds as on any canvas:** cream, pine or pine-deep, one per shot, no
  gradients, no vignettes, no textures, no ambient motion behind text.

## What may move, and how

| Element | Movement | Timing |
|---|---|---|
| Cut | the default between shots | 0ms |
| Dissolve | between shots on the same ground | 150 / 300ms |
| Field change, cream ↔ green | a soft wipe, the site's one gradient in motion | 450–750ms, in steps of 150 |
| Text | appears by a cut, or an opacity fade | 200ms |
| A chart | draws once along its own path, in reading order | 150–450ms |
| Terminal output | real output at its real pace, or simply present | real time |
| The cursor | only when it acts, and it moves at the operator's speed | real time |

**Easing everywhere:** `cubic-bezier(0.4, 0, 0.2, 1)`. A duration is 150ms or a
multiple of it. Nothing overshoots, springs or bounces.

## What never moves

Everything in `motion.md`'s "What does not" table, and for video in particular:

- **A measured number counting up.** It never had those intermediate values.
  It appears at its value.
- **Text sliding, scaling, typing on, or kinetic-typography of any kind.** The
  only typing on screen is a real terminal.
- **The brand mark.** No reveal, no draw-on, no spin, no pulse. It appears by
  cut or fade and holds.
- **Product footage tilted, floated, shadowed, or framed as a rounded card.**
  Screens are recorded flat and shown flat, at 1:1 or an integer scale, full
  frame or cropped to a region, with browser chrome cropped out.
- **Speed ramps on a recording.** A speed-up changes how fast the product
  appears to be. If footage is sped up, the frame says so in a label
  (`2× speed`) for as long as it plays.
- **Particles, grids, scan lines, light leaks, glows, depth of field.** The
  site has no shadows at all.
- **A sound tied to a movement.** No whooshes, stingers or clicks added in the
  edit. A sound that announces a movement is a movement.

## Recurring frames

| Frame | Built from | Rules |
|---|---|---|
| Title card | [`landscape.html`](source/templates/landscape.html) | lockup, one line at figure size, one lead line; holds at least 4s |
| Lower third | the label and body roles at k = 2, cream on a solid `--pine-deep` band the width of the text plus 32px | appears and leaves by 200ms fade; no slide |
| Subtitles | Inter 400 at lead × k (32px), cream on a solid `--ink` plate at full opacity, inside title-safe | the one box video needs: footage behind text is unknown in advance |
| Figure | [`square.html`](source/templates/square.html)'s slab, centred on the frame | appears by cut; the caption is on screen with it, not after |
| End card | lockup, `evergreen-stellar.pages.dev`, "Stellar testnet" | holds at least 3s; nothing moves |

## Honesty on screen

On-screen text is a claim, and [`claims-and-copy.md`](claims-and-copy.md)
governs every frame. In particular:

- the footage shows the product as it is on production at the time of
  recording, and a known difference is disclosed on screen;
- no mock data presented as live, and no figure that is not on the site or in
  the evidence;
- "Stellar testnet" is visible whenever the product is.

## The landing page's hero video is not a model

[`motion.md`](motion.md) uses the hero video as a worked example of
*handling*: muted, no controls, a poster frame, paused under reduced motion.
That handling is right. **Its content is not.** Checked 2026-10-15
(`apps/web/src/assets/hero.mp4`, poster `hero-poster.jpg`, from #248):

- bold grotesque display type, "Your All in One" and "Soroban TTL Tool", where
  nothing is bold and the faces are Newsreader and Inter;
- "All in One", a sentence that would survive being moved to another product;
- a mottled green gradient ground;
- product screens floated as rounded cards that slide across the frame;
- the placeholder square where the mark now sits, and copy since overtaken
  ("Until the package is published…").

Fatih decided on 2026-10-15 to leave it in place until the dashboard work in
phase 2 is done, and to re-cut it then. **Do not take anything from its look.**
Its re-cut follows this file.

## Reduced motion

A loop must have a static equivalent: the poster frame or the title card. No
loop plays behind text someone is trying to read. A social clip that
autoplays should make its point in its first frame, held, before anything
moves.
