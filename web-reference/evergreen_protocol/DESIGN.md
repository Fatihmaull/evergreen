---
name: Evergreen
colors:
  surface: '#fcf9f8'
  surface-dim: '#dcd9d9'
  surface-bright: '#fcf9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f6f3f2'
  surface-container: '#f0edec'
  surface-container-high: '#ebe7e7'
  surface-container-highest: '#e5e2e1'
  on-surface: '#1c1b1b'
  on-surface-variant: '#414844'
  inverse-surface: '#313030'
  inverse-on-surface: '#f3f0ef'
  outline: '#727974'
  outline-variant: '#c1c8c3'
  surface-tint: '#456557'
  primary: '#022419'
  on-primary: '#ffffff'
  primary-container: '#1a3a2e'
  on-primary-container: '#82a494'
  inverse-primary: '#abcebd'
  secondary: '#3f6654'
  on-secondary: '#ffffff'
  secondary-container: '#bee9d2'
  on-secondary-container: '#436b58'
  tertiary: '#301a00'
  on-tertiary: '#ffffff'
  tertiary-container: '#4e2c00'
  on-tertiary-container: '#d48d36'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#c7ebd9'
  primary-fixed-dim: '#abcebd'
  on-primary-fixed: '#002116'
  on-primary-fixed-variant: '#2d4d40'
  secondary-fixed: '#c1ecd5'
  secondary-fixed-dim: '#a6d0ba'
  on-secondary-fixed: '#002115'
  on-secondary-fixed-variant: '#274e3d'
  tertiary-fixed: '#ffdcbb'
  tertiary-fixed-dim: '#ffb869'
  on-tertiary-fixed: '#2c1700'
  on-tertiary-fixed-variant: '#683d00'
  background: '#fcf9f8'
  on-background: '#1c1b1b'
  surface-variant: '#e5e2e1'
typography:
  display-hero:
    fontFamily: Newsreader
    fontSize: 56px
    fontWeight: '400'
    lineHeight: 64px
    letterSpacing: -1.5px
  display-hero-mobile:
    fontFamily: Newsreader
    fontSize: 36px
    fontWeight: '400'
    lineHeight: 42px
    letterSpacing: -0.75px
  headline-xl:
    fontFamily: Newsreader
    fontSize: 40px
    fontWeight: '400'
    lineHeight: 48px
    letterSpacing: -1.0px
  headline-xl-mobile:
    fontFamily: Newsreader
    fontSize: 28px
    fontWeight: '400'
    lineHeight: 34px
    letterSpacing: -0.5px
  headline-lg:
    fontFamily: Newsreader
    fontSize: 30px
    fontWeight: '400'
    lineHeight: 38px
    letterSpacing: -0.5px
  headline-md:
    fontFamily: Newsreader
    fontSize: 22px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.25px
  body-lead:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '400'
    lineHeight: 28px
    letterSpacing: -0.15px
  body-default:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '400'
    lineHeight: 24px
    letterSpacing: 0px
  body-strong:
    fontFamily: Inter
    fontSize: 15px
    fontWeight: '600'
    lineHeight: 24px
    letterSpacing: 0px
  body-muted:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: 0.1px
  label-code-lg:
    fontFamily: Space Mono
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
    letterSpacing: -0.2px
  label-code-default:
    fontFamily: Space Mono
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
    letterSpacing: 0px
  label-caps:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.8px
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1.5rem
  gutter-sm: 1rem
  margin: 3rem
  margin-sm: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2.5rem
---

> **Committed 2026-09-17 under `W4-D22-03`.** Adopted from this file: **Newsreader** for display, **Space Mono** for data, **Inter** for body and interface (awaiting confirmation), the warm surface **`#fcf9f8`**, and the darker **status label tones**. Everything else — the type scale, spacing, radii, breakpoints, behaviour and every status definition — is governed by [`EVERGREEN-PRODUCT-AND-DESIGN-SPEC.md`](../EVERGREEN-PRODUCT-AND-DESIGN-SPEC.md). Statements the project does not make were removed on commit; the pull request that committed this file lists each one.

## Brand & Style

This design system serves a TTL monitoring and extension toolkit for Stellar Soroban developers and the maintainers of deployed protocols.

The aesthetic fuses **Stellar Editorial Minimalism** with **Technical Precision Brutalism**:
- **Editorial Authority:** Classical, high-caliber serif headlines grounded in wide, rhythmic white space directly borrowed from Stellar's institutional presence.
- **Architectural Framing:** Strict hairline grids, mono-spaced state metrics, stark contrasting data slabs, and precision-cut borders rather than soft, ambiguous shadows.
- **Developer Rigor:** Terminal-driven telemetry blocks (`#262626`) and unyielding state indicators that immediately telegraph TTL health, ledger boundaries, and recorded extensions on Testnet.
- **High Cadence Alternation:** Fluid transitions between pristine off-white canvas sections (`#fcf9f8`) and dense, deep pine immersion zones (`#1a3a2e`) to delineate between ledger state exploration and summaries.

## Colors

The system employs a tightly bound, functional chromatic hierarchy structured around deep forestry tones, organic minerals, and stark monochromatic contrasts.

### Core Brand & Surface Roles
- **Primary Brand (`#1a3a2e` - Pine):** The anchor of critical actions, high-emphasis interactive states, dark structural bands, and persistent brand anchoring.
- **Secondary Brand (`#7fa893` - Sage):** Passive verification states, secondary pill borders, subtle fills, and accent dividers.
- **Tertiary Accent (`#c07c26` - Warm Amber):** Sparing emphasis, and the warning tier.
- **Canvas Primary (`#ffffff`):** Pure light background for metric-dense tabular listings and primary views.
- **Canvas Secondary (`#fcf9f8` - Warm Off-White):** Sub-surface paneling, alternating band segments, and muted containment envelopes.
- **Terminal Surface (`#262626` - Off-Black):** Captured CLI output and JSON.
- **Base Neutral (`#0f0f0f` - Neutral Black):** High-contrast display typography, structural hairline framing, inverted metric tiles, and solid base dividers.

### Hairline & Border System
- **Default Frame:** `rgba(15, 15, 15, 0.10)` for calm, clean grid structures.
- **Active / Hover Frame:** `rgba(15, 15, 15, 0.44)` for keyboard focus, hovered cells, and activated controls.
- **Inverted / Dark Surface Frame:** `rgba(255, 255, 255, 0.12)` default, `rgba(255, 255, 255, 0.38)` interactive.

### Soroban TTL & Contract State Palette
- **Healthy (`#00a7b5` - Cyan-Teal):** Above the warning tier. A clean result covers only the entries that were checked; nothing is guaranteed.
- **Warning (`#c07c26` - Amber):** Inside the warning tier (below 120,960 ledgers, about 7 days). Nothing renews an entry that nobody is watching.
- **Critical (`#c0392b` - Red):** At or below the action tier (17,280 ledgers, about 1 day), or low and temporary, or low and shared — as core grades it.
- **Expired (`#0f0f0f` - Inverted Solid Black):** Past its final live ledger: archived (restore with `RestoreFootprintOp`), or deleted permanently if the entry was temporary.
- **Undetermined (`#7c6bb0` - Violet):** Not established, in three words: *undetermined* (the check ran and cannot conclude — sharing seen from one contract), *unread* (no TTL metadata came back), *not found* (no entry came back). An RPC failure is not this state: the check did not run.

*Scope: Stellar Testnet only. There is no mainnet path, and no mainnet control appears anywhere, disabled or otherwise.*

## Typography

Typography establishes an editorial tension between financial permanence and terminal utility:
- **Headings & Editorial Display (Serif):** Rendered in low-contrast, classic editorial serif at `400` weight with intentional negative tracking (`-1.5px` to `-0.5px`). This mirrors Stellar's narrative publication standard, treating contract lifecycle management with institutional gravity.
- **Body & Structural UI (Inter):** Highly legible, neutral workhorse at `400` and `600` weights. Used for operational instructions, dashboard tables, form elements, and contextual tooltips.
- **Code, Telemetry, and Contract IDs (Space Mono / IBM Plex Mono style):** Strict fixed-pitch representation for ledger heights, Soroban addresses (`C...`), hex digests, remaining-ledger counts, and transaction hashes.

## Layout & Spacing

The layout is governed by an architectural 12-column grid intersected by full-bleed structural bands.

### Screen Adaptations
- **Desktop (>= 1200px):** 12-column layout, 48px margins, 24px column gutters. Inverted stat strips span the full canvas with vertical hairline divides.
- **Tablet (768px - 1199px):** 8-column layout, 24px margins, 16px gutters. Metric cells fold into a 2x2 grid.
- **Mobile (< 768px):** 4-column layout, 16px margins, 16px gutters. Full-width horizontal button pills align to viewport boundaries with zero side padding or standard 16px inset.

### Section Banding
Layout sections alternate intentionally between:
1. **Light Band (`#ffffff` or `#fcf9f8`):** For searchable directory tables, TTL health graphs, and analytics filters.
2. **Dark Band (`#1a3a2e` or `#0f0f0f`):** For the thesis sections and summaries.

## Elevation & Depth

This design system deliberately excludes diffuse drop shadows and multi-stop blur effects. Elevation is achieved solely through **flat architectural framing** and **tonal stacking**:

- **Hairline Framing:** Depth levels are created by the boundary density of `1px` lines: `rgba(15,15,15,0.10)` on resting containers, rising to `rgba(15,15,15,0.44)` when active.
- **Tonal Contrast Stacking:** Layering white cards on `#fcf9f8` backgrounds, or elevated `#262626` terminal codeboxes on `#0f0f0f` base strips.
- **Inverted State Cells:** Highest visual prominence is achieved through stark inverted tiles—solid `#0f0f0f` or `#1a3a2e` containers displaying high-contrast pure white and green telemetry text directly alongside neutral canvas panels.
- **Zero-Shadow Philosophy:** Interactive components rely on border color switches and high-contrast color shifts upon cursor contact, avoiding ambient diffusion.

## Shapes

The geometric framework uses **crisp, structured contours with targeted pill articulation**:
- **Cards, Cells, and Data Panels:** Set to subtle `0.25rem` (4px) or completely square `0px` where borders intersect in continuous stat rows. This enforces architectural, spreadsheet-like discipline.
- **Interactive Badges and CTA Buttons:** Contrast sharply with the grid using fully rounded pill forms (`9999px`), creating immediate visual affordance for actions and categorizations.
- **Icon Enclosures:** Perfectly circular (`border-radius: 50%`) frames for arrow markers, status dots, and execution triggers.

## Components

### 1. 100vw Pill Action Buttons
- **Primary:** Full-bleed or edge-to-edge max-width pill button (`border-radius: 9999px`) in `#1a3a2e` with pure white Inter text (`600` weight).
- **Badge Anchor:** Contains an internal circular indicator (`#ffffff` background, `#1a3a2e` arrow icon) aligned to the trailing edge. It does not move on hover: transitions change colour only.
- **Secondary:** Transparent fill, `1px solid rgba(15,15,15,0.10)`, hovering to `rgba(15,15,15,0.44)` with `#0f0f0f` text.

### 2. Status Badges & Pill Chips
- **Format:** Height 24px, padding 2px 10px, rounded-full.
- **Structure:** a 6px mark whose shape differs per state (never colour alone), with a matching tinted background at 10% opacity and a label in `Space Mono` (11px) in the darker text tone.
- **States:**
  - `Healthy`: Background `rgba(0,167,181,0.10)`, dot `#00a7b5`, text `#00737d`.
  - `Warning`: Background `rgba(192,124,38,0.10)`, dot `#c07c26`, text `#965d17`.
  - `Critical`: Background `rgba(192,57,43,0.10)`, dot `#c0392b`, text `#c0392b`.
  - `Expired`: Solid `#0f0f0f` background, dot `#ffffff`, text `#ffffff`.
  - `Undetermined` / `Unread` / `Not found`: Background `rgba(124,107,176,0.10)`, hollow ring `#7c6bb0`, text `#5d4e8c`.

### 3. Stat Strips with Inverted Cells
- Continuous horizontal ribbon segmented by vertical `1px` hairlines.
- Standard cells: `#fcf9f8` fill with uppercase muted labels (`label-caps`) and large numeric figures in `Newsreader` or `Space Mono`.
- Inverted cells: Inlaid `#0f0f0f` or `#1a3a2e` background with white typography, highlighting the number that matters (e.g., "Entries inside the action tier").

### 4. Terminal & Telemetry Blocks
- Surface set to `#262626`, internal padding 16px, border `1px solid rgba(255,255,255,0.08)`.
- Space Mono typography for captured CLI output and JSON.

### 5. Form Inputs & Checkboxes
- **Inputs:** Clean white or `#fcf9f8` surfaces with bottom border or full `1px` perimeter in `rgba(15,15,15,0.10)`. Focus shifts border to `#1a3a2e` without ambient glow. Monospaced font for contract address fields.
- **Checkboxes:** Square 16px with sharp corners (`rounded: 0px` or `2px`), border `1.5px solid #0f0f0f`. Active state fills `#1a3a2e` with white checkmark.
