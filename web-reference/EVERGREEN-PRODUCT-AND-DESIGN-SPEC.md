# Evergreen — Product & Design Specification

**For:** the agent building the website, landing page and dashboard
**Status:** authoritative for design and information architecture; the repository is authoritative for behaviour
**Design reference:** stellar.org, token system extracted live 2026-09-17
**Revision:** 3 — decisions of 2026-09-17 applied; see *Revision 3* below

---

## Revision 3 — what changed on 2026-09-17, and why

Decided by Fatih on 2026-09-17, after the web agent's first reading of this spec against the page exports. Recorded here so that the spec and the build do not disagree.

- **Only this spec and `evergreen_protocol/DESIGN.md` are committed.** The page exports stay on Fatih's machine: they carry placeholder data and claims the project never made, and a public repository cannot attach a disclaimer to a file someone opens directly. Every web PR attaches a render of the page it built instead.
- **The exports win on appearance; this spec wins on behaviour, states and honesty.** Known appearance differences are noted where they apply (§16.1).
- **Typefaces and surface (§6.1, §7, §7.1):** Newsreader for display and Space Mono for data, as the exports use them, with Inter proposed for body text; the warm `#fcf9f8` replaces `#f4f6f3`. stellar.org remains the reference for the system, not for its faces.
- **Status text (§8, Part Eight):** the status colours fail as small text on light grounds, so words use darker tones.
- **Not known is one colour and three words (§10, §18.5).**
- **Figures carry their scope (§2, §13, §16.2, §16.3).** 98% is guinea-pig A's four-entry scan. The temporary-entry caption separates the configured minimum from a sampled remainder.
- **The scan field sits at the top of `/dashboard` (§18).**
- **The decay chart plots three entries in three panels (§18.3).** The earlier two-line version implied natural decay on guinea-pig A, which `W4-D28-01` already calls a false claim to a funder.
- **Nothing ships that is not in the repository, the PRD or the SOW (Part Ten).**
- **Core in a browser (Part Nine):** it bundles, but does not yet scan correctly in one (#194). The presentation rules move from the CLI into core (#195).
- **The three open questions are answered, and five smaller ones are open (Part Eleven).**

---

# PART ONE — WHAT WE ARE BUILDING

## 1. The one-sentence version

**Evergreen makes contract rent on Stellar something a developer configures once instead of remembers.**

Everything in this document serves that sentence. If a design decision makes TTL feel like something the user must keep track of, it is wrong.

## 2. The problem, precisely

Soroban smart contracts on Stellar do not live forever by default. Every piece of contract state — the contract instance, its compiled code, and each item of stored data — carries a **time-to-live (TTL)** measured in **ledgers**, not seconds. Roughly one ledger closes every five seconds. Every closed ledger decrements every TTL on the network.

When a TTL reaches zero, one of two things happens, and **the difference is the most important fact in the product**:

| Entry kind | What it holds | At TTL zero |
|---|---|---|
| **instance** | the contract's own state pointer | **archived** — recoverable by paying to restore |
| **code** | the compiled Wasm bytecode | **archived** — recoverable |
| **persistent** data | durable stored values | **archived** — recoverable |
| **temporary** data | disposable stored values | **deleted — gone permanently, no restore** |

Stellar ships no dedicated tooling for watching this. Developers track it by hand, in spreadsheets and calendar reminders, and production contracts stop working because somebody forgot.

**Two compounding facts make it worse than it sounds:**

**The binding date is not the obvious one.** A contract's instance might be healthy until December while its code entry expires in October. Without the code, the contract cannot execute at all. So the real expiry is the *earliest* entry, and that is not the first number a naive tool would show.

**One entry can take down many contracts.** Every contract deployed from the same Wasm binary shares **one** `ContractCode` ledger entry. That is the factory pattern — per-user vaults, per-pair pools, per-market instances. If that single shared entry archives, every contract built from it stops working simultaneously. And in our own measurements, on guinea-pig A's four entries, **that one shared entry is 98% of the cost of keeping them alive.** The biggest availability risk and the biggest line item are the same object.

## 3. Who we are

**Evergreen** is built by **Apex**, a team within the **Stellar Ambassador Chapter Indonesia**, under a funded Stellar Instawards grant.

- **Fatih Maulana** — product, coordination, evidence
- **Rakha** (`rakhargo`) — engine, contracts, infrastructure

The sprint runs **3 September – 2 October 2026**. The work is public at `github.com/Fatihmaull/evergreen` under MIT.

**Testnet only.** There is no mainnet path — not a flag, not a branch. Any design that implies mainnet operation is wrong.

## 4. What the service does

Evergreen is three things that share one core.

### 4.1 The CLI — shipped

An npm package, `@evergreen-stellar/cli`, that scans a contract through Soroban RPC and reports remaining TTL per entry, projected expiry marked as an estimate, health on two tiers plus expired, cost to extend priced by live simulation, blast radius or an explicit *we cannot determine this*, and storage advice.

It emits human-readable and JSON output from the same source, exits non-zero on degraded scans, and never writes to the chain in scan mode.

### 4.2 The engine — shipped

A scheduled job that reads a config of watched contracts, decides which entries need extending, and submits `ExtendFootprintTTLOp` transactions unattended. It journals every attempt before sending, alerts by email on every failure mode, and refuses by default rather than acting when anything is ambiguous.

**A crucial architectural fact for the design:** extending a TTL on Stellar is **permissionless**. Anyone can pay to extend anyone's entry, and no authorization is involved. Evergreen therefore has **no authority over a user's contract at all** — it cannot move funds, cannot call methods, cannot change state. It can only pay rent. That is not a policy we implemented; it is a property of the chain we inherited.

**Say this clearly in the marketing copy.** "Non-custodial" understates it. Evergreen has nothing to abuse, rather than a scoped ability to abuse.

### 4.3 The dashboard — to be built

Read-only. Renders what the CLI computes, for our own contracts and for any contract a visitor asks about.

**Wallet-connect and extend-from-dashboard are explicitly out of scope** for this sprint. They were cut deliberately and become the headline of the next grant. Do not design for them, do not leave obvious holes for them, and do not imply them in copy.

## 5. Who uses it

**Primary — the Soroban developer.** Has one or more contracts on testnet. Knows what a ledger is, may not know that code entries are shared. Wants to know: *is anything about to die, what will it cost me, and can I stop thinking about it.*

**Secondary — the maintainer of a deployed protocol.** Many contracts, one Wasm. The blast-radius finding is aimed squarely at this person, and they usually do not know they are exposed.

**Tertiary — the grant reviewer, the ecosystem observer, the curious.** Arrives at the landing page knowing nothing. Needs the problem explained in one screen and the product demonstrated in the next.

---

# PART TWO — THE DESIGN LANGUAGE

Extracted live from stellar.org on 2026-09-17. These are the actual values in production on that site, not an interpretation of them.

## 6. What Stellar's system actually is

**A serif display face over a neutral sans, on near-white, with one saturated accent, generous whitespace, hairline borders, and full-radius pills.** Dark sections alternate with light ones. Emphasis is created by **inverting a cell to black**, not by adding colour.

### 6.1 Typography

| Role | Family | Notes |
|---|---|---|
| Display / headings | **Lora** (serif) | weight **400**, negative tracking at large sizes (−1.5px at 50px) |
| Body / UI | **Inter** (sans) | 400 body, 600 for small headings |
| Code / data | **IBM Plex Mono** | |

Body text: `16px / 25.6px` (1.6 line-height), `rgb(15,15,15)`.
Section headline: `50.5px / 55.6px`, letter-spacing `−1.5px`, Lora 400.
Sub-heading: `21.3px / 29.9px`, Inter 600.

**The type scale is fluid**, using a modular ratio with `clamp()`:

```css
--step--2: clamp(0.5628rem, 0.672rem + -0.1365vw, 0.64rem);
--step--1: clamp(0.7502rem, 0.8206rem + -0.0881vw, 0.8rem);
--step-0:  clamp(1rem, 1rem + 0vw, 1rem);
--step-1:  clamp(1.25rem, 1.2156rem + 0.1467vw, 1.333rem);
--step-2:  clamp(1.5625rem, 1.4737rem + 0.379vw, 1.7769rem);
--step-3:  clamp(1.9531rem, 1.781rem + 0.7345vw, 2.3686rem);
--step-4:  clamp(2.4414rem, 2.1448rem + 1.2657vw, 3.1573rem);
--step-5:  clamp(3.0518rem, 2.5724rem + 2.0455vw, 4.2087rem);
```

Adopt this scale verbatim. It is a 1.25 ratio at small viewports opening to ~1.333 at large, and it means headings resize smoothly without breakpoints.

**Evergreen adopts this system but not these three faces.** Its typefaces are in §7.1.

### 6.2 Colour

```css
/* Neutrals — the structural palette */
--neutral-black:    #0f0f0f;   /* text, dark sections, inverted cells */
--off-black:        #262626;   /* code backgrounds */
--neutral-white:    #ffffff;   /* primary surface */
--off-white:        #f9f9f9;   /* secondary surface, subtle banding */
--bg-muted:         #f2f2f2;
--bg-warm:          #d6d3c4;

/* Alpha blacks — all borders and overlays derive from these */
--black-02: rgba(15,15,15,.02);   /* card surface tint */
--black-05: rgba(15,15,15,.05);   /* card hover */
--black-10: rgba(15,15,15,.10);   /* default border, inactive */
--black-15: rgba(15,15,15,.15);
--black-30: rgba(15,15,15,.30);   /* scrim */
--black-44: rgba(15,15,15,.44);   /* border hover */
--black-50: rgba(15,15,15,.50);   /* disabled text */
--black-70: rgba(15,15,15,.70);   /* secondary text */

/* Stellar's three hues */
--gold:     #fdda24;
--teal:     #00a7b5;
--lavender: #b7ace8;
```

**The important structural fact: borders are never a grey. They are black at low alpha.** `rgba(15,15,15,.1)` default, `rgba(15,15,15,.44)` on hover. This is why the site feels crisp rather than washed — the hairlines share a hue with the text.

### 6.3 Spacing

```css
--space-xs:  0.25rem;
--space-sm:  0.5rem;
--space-md:  1rem;
--space-lg:  1.5rem;
--space-xl:  2rem;
--space-xxxl: 4rem;

--space-resp-sm:  clamp(0.5rem, 0.2928rem + 0.884vw, 1rem);
--space-resp-md:  clamp(1rem, 0.7928rem + 0.884vw, 1.5rem);
--space-resp-lg:  clamp(1.5rem, 1.2928rem + 0.884vw, 2rem);
--space-resp-xl:  clamp(2rem, 1.5856rem + 1.768vw, 3rem);
--space-resp-xxl: clamp(2rem, 1.1713rem + 3.5359vw, 4rem);
```

Section vertical padding on stellar.org is **64px** at desktop. Standard grid gap is **1.5rem**.

### 6.4 Radii and elevation

```css
--radius-sm:   0.25rem;
--radius-md:   0.5rem;
--radius-lg:   0.75rem;
--radius-full: 100vw;    /* pills — buttons, tabs, badges */
--shadow:      0 0 1rem 0 rgba(15,15,15,.3);
```

Shadows are used very sparingly. Depth comes from **surface tint and hairline borders**, not from drop shadows.

### 6.5 Motion

```css
--transition: background-color 150ms ease-in-out, border-color 150ms ease-in-out;
```

150ms, ease-in-out, and only on colour. Nothing slides, nothing bounces. Respect `prefers-reduced-motion`.

### 6.6 The component patterns worth stealing

**The stat strip.** A horizontal grid of hairline-bordered cells. Each cell: a small Inter label top-left, an enormous display-serif numeral (~70px+), and a small Inter caption bottom-left. **One cell inverted to black with white text** to draw the eye.

**The link card.** A bordered rectangle, generous internal padding, Inter 600 heading, 70%-black body, bottom-aligned arrow-plus-label link. Three across at desktop, one at mobile.

**The pill button.** `border-radius: 100vw`. Primary is a dark surface with a light label and a circular accent badge holding an arrow glyph at the right edge. Secondary is transparent with a hairline border.

**Section rhythm.** Every section: **eyebrow** (small Inter, plain) → **display headline** (display serif, large, tight) → **body paragraph** (Inter, max ~65ch) → content. This repetition is most of what makes the site feel coherent.

**Alternating bands.** Light sections on white or off-white; dark sections on near-black with white text. The switch is the separator — no rules, no dividers.

---

# PART THREE — EVERGREEN'S OWN IDENTITY

Evergreen should read as *belonging to* the Stellar ecosystem without pretending to be Stellar.

**The rule: Stellar's grammar, Evergreen's vocabulary.** Take the structure, the type system, the spacing, the component shapes, the restraint. Replace the brand accent.

## 7. Brand palette

```css
--pine:  #1a3a2e;   /* primary brand, dark sections, primary buttons */
--sage:  #7fa893;   /* secondary brand, muted accents */
--amber: #c07c26;   /* tertiary, sparing emphasis */
--light: #fcf9f8;   /* Evergreen off-white — warm, from DESIGN.md (2026-09-17) */
```

`--pine` sits where Stellar uses near-black for brand surfaces and where it uses gold for accent. It is darker and cooler than Stellar's black, which reads as deliberate rather than accidental. `--light` replaces `#f9f9f9` as the secondary surface.

Keep Stellar's structural neutrals — near-black text, the alpha-black border ramp — unchanged. **Do not tint the borders green.** The hairline system works because it shares a hue with the text.

### 7.1 Typefaces

| Role | Family | Notes |
|---|---|---|
| Display / headings | **Newsreader** | weight 400, negative tracking at large sizes, on the §6.1 fluid scale |
| Body / UI | **Inter** | 400 body, 600 for small headings — named by `DESIGN.md` and loaded by every export; **awaiting confirmation** |
| Code / data | **Space Mono** | ledger numbers, contract IDs, keys, hashes |

Faces different from stellar.org's are deliberate: they stop Evergreen reading as a Stellar sub-brand, while everything structural — the fluid scale, the alpha-black hairlines, the section rhythm, the stat-strip geometry, the pill shapes, the 150ms colour-only transitions — still says it belongs to that ecosystem.

## 8. Status palette — the most important decision in this document

Read §10 before implementing this.

```css
--status-healthy:      #00a7b5;   /* teal — above both thresholds */
--status-warning:      #c07c26;   /* amber — inside the warning tier */
--status-critical:     #c0392b;   /* red — inside the action tier */
--status-expired:      #0f0f0f;   /* inverted cell, white text */
--status-unknown:      #7c6bb0;   /* violet — we cannot determine this */
```

**`--status-critical` is the one colour introduced with no Stellar equivalent.** Stellar's palette contains no red because Stellar has nothing to warn about. Evergreen does. Keep it muted rather than alarm-red, and use it only for the action tier and above.

**`--status-unknown` is the colour most dashboards do not have, and it carries the product's integrity.** It derives from Stellar's lavender, darkened to pass contrast on white. It must read as *a different kind of thing* — not a weaker green, not a softer red.

**Dots and fills use these colours; words use darker tones.** As small text, `--status-healthy` measures 2.92:1 on white and `--status-warning` 3.41:1, both below the 4.5:1 minimum, and `--status-unknown` falls to 4.37:1 on the warm `--light`. The label tones from `DESIGN.md` pass:

```css
--status-healthy-text: #00737d;   /* 5.60:1 on white, 5.35:1 on --light */
--status-warning-text: #965d17;   /* 5.42:1 on white, 5.17:1 on --light */
--status-unknown-text: #5d4e8c;   /* 7.16:1 on white, 6.83:1 on --light */
```

`--status-critical` passes as text on both grounds (5.44:1 and 5.19:1). **Expired** is core's `critical` with `isExpired`: an inverted black chip reading *archived* or *deleted*, from the entry's `endBehavior`.

## 9. Logo — does not exist yet, and is needed

There is no Evergreen mark. One is required for the favicon, the header, the npm README and the demo video. **Produce three directions as mockups before choosing**, and treat this as its own piece of work rather than a detail of the header.

**What the mark has to survive:** 24px favicon, monochrome in one colour, on `--pine` and on white, beside the wordmark and alone, and in a video frame beside Stellar's own logo without looking like a copy of it.

**The concept worth mining:** an evergreen keeps its needles when everything around it drops them. That is literally the product — the thing that stays alive while others expire. The mark should carry persistence, not ecology. Avoid the generic sustainability-brand leaf.

**Three directions to mock:**

1. **Reduced conifer.** A fir compressed to three or four stacked chevrons. Reads at 24px, works in one colour, and the chevrons double as a downward-counting motif — a decay that stops. Most likely to succeed.
2. **The sprig.** A single needle cluster rather than a whole tree. Quieter, more distinctive than another triangle-tree, harder to get right at small sizes.
3. **Structural monogram.** An `E` built from horizontal bars of unequal length — a TTL bar that does not run out. Most abstract, least warm, strongest at tiny sizes.

**Wordmark:** a serif for the name at display sizes is tempting but may read as a book. Test Inter 600 with tightened tracking against Newsreader 400 and choose on the header lockup, not in isolation.

Deliver each direction as: mark alone, mark + wordmark horizontal, 24px favicon crop, and one-colour versions on white and on pine. Run a confusable-mark check on each direction before it enters the matrix: a shortlist containing a mark we cannot use wastes the review. A prototype marking one direction as selected is not a choice.

---

# PART FOUR — UX PRINCIPLES SPECIFIC TO THIS PRODUCT

These are not general good practice. They are the rules that make Evergreen trustworthy, and a beautiful design that breaks them is a failed design.

## 10. There are three states, not two

Every conventional dashboard has *good* and *bad*. Evergreen has **good, bad, and unknown**, and the third is not a degraded version of either.

The CLI already refuses to guess. It reports `sharingStatus: "undetermined"` rather than `false`, because a scan of one contract **structurally cannot** determine whether other contracts share its code entry — the chain does not index reverse dependencies. Reporting `false` there would be a confident lie, and the tool was fixed specifically to stop doing it.

**A green checkmark next to an undetermined value would undo that fix in the interface.** It is the single easiest way to destroy this product's value.

So:

- **Unknown gets its own colour, its own icon, and its own words.** Never a checkmark, never a cross, never grey-as-in-disabled.
- **One colour and one shape, three words — each saying why it is not known:**
  - **undetermined** — the check ran and cannot conclude. Sharing seen from one contract is always this: the chain does not index reverse dependencies.
  - **unread** — the entry came back without TTL metadata. Core's own word.
  - **not found** — no entry came back. It was archived or it never existed, and a scan cannot tell which, so both are named.

  An RPC failure is none of these: the check did not run. It is a top-level *incomplete* state that names the endpoint, and it is never violet.
- **Every unknown carries its remedy.** The CLI's sharing warning ends with *"pass them together to see the real blast radius"* — the interface equivalent is a control that lets the user add the sibling contracts, right there.
- **Absence is not health.** The CLI prints this sentence literally. When a scan covers less than the whole contract, the interface says so at the top of the result, not in a footnote.

## 11. Ledgers are the truth; dates are a convenience

The CLI prints `expires ~: 2026-12-01T18:58:59Z (estimate — ledgers are the truth)`.

Dates are computed from an assumed five-second cadence. They drift. The **ledger number is exact** and is what the protocol uses.

Show both, with the right hierarchy: the date larger and more prominent, because it is what a human plans around; the ledger number beside or beneath it, in mono, always visible, never behind a tooltip. Mark the date approximate with a symbol the user can learn (`~`), explained once.

Never show a countdown to the second. It implies a precision the method does not have.

## 12. Coverage is part of the answer

A scan reports on the entries it was asked about. Contract storage is not enumerable — you must supply the data keys you want checked.

So **a clean result means "nothing wrong in what was checked", never "nothing wrong."** State the scope of every result adjacent to the result, in the same visual weight as the verdict.

## 13. Lead with blast radius

The shared code entry is the product's thesis: **the one entry N contracts depend on is also the one that costs 98% of the bill** — measured on guinea-pig A's four entries.

Single-contract scans show it as *undetermined* with an invitation to add more contracts — which is both honest and the best possible demonstration of why the tool exists.

## 14. Do not imply capability we do not have

- No "connect wallet" button, disabled or otherwise
- No "extend now" button, disabled or otherwise
- No mainnet toggle, disabled or otherwise
- No account, no login, no saved watchlist

Where the next grant's features would go, put nothing. A disabled control is a promise with a date on it.

## 15. Voice

Plain, specific, unhedged about what is known and explicit about what is not. The CLI's register is the reference:

> `Scan is PARTIAL — 1 issue(s). Absence is not health.`
> `code entries are shared by every contract built from the same Wasm. This scan saw 1. Whether others depend on this entry cannot be determined from a single-contract scan — pass them together.`

Short sentences. No exclamation marks. No "oops". No emoji in product surfaces. Numbers always carry their unit; estimates always carry the word.

**English only.** The team and chapter are Indonesian; the audience is global and the domain vocabulary is English. No i18n scaffolding for now — but keep strings in one module so adding a locale later is not a rewrite.

---

# PART FIVE — INFORMATION ARCHITECTURE

**The site is two products, deliberately separated.**

```
LANDING — marketing, explanation, credibility. No tooling.
  /                what Evergreen is, why TTL matters, the thesis
  /docs            quickstart, CLI reference, JSON schema
  /about           team, grant, method, evidence
                   → primary CTA: "Open dashboard"

DASHBOARD — the tool. Reached deliberately, not stumbled into.
  /dashboard              Scan & Status — one combined surface
  /dashboard/blast-radius Multi-contract analysis — its own entry point
  /dashboard/s/:ids       shareable single-scan result
  /dashboard/b/:ids       shareable blast-radius result
```

**Why the separation matters.** The landing page's job is to make someone understand a problem they did not know they had. The dashboard's job is to answer a question for someone who already has one. Those are different modes of attention, and mixing them makes the landing page busy and the tool feel like a demo.

So: **the landing page has no input field.** It shows *output* — a real terminal block, the blast-radius diagram, the decay chart — and one CTA into the dashboard. Nothing on the landing page performs a live RPC call.

The dashboard has its own header: Evergreen mark, the two views, and a link back to the landing site. It does not repeat the marketing navigation.

---

# PART SIX — PAGE SPECIFICATIONS

## 16. Landing — `/`

Alternating light and dark bands, stellar.org rhythm throughout.

**16.1 Hero**

*Appearance follows the export, which wins on appearance: the hero is dark, and the headline is set in two faces. Button colours follow the export; nothing moves on hover (§6.5). The content below stands.*

- Display headline, `--step-5`, tight tracking (faces per §7.1 and the export):
  **"Your contract expires. You just don't know when."**
- Sub-paragraph, Inter, max 60ch: ledgers not seconds, and nobody is watching.
- Primary pill: **Open dashboard** → `/dashboard`. Pine surface, white label, sage circular arrow badge.
- Secondary pill, hairline border: **Read the docs** → `/docs`.

**16.2 The four entry kinds — light**

A four-cell hairline grid, stat-strip geometry. Each cell: kind name (Inter 600), what it holds (Inter 400, 70% black), fate at zero as a status chip.

**The `temporary` cell is inverted to black with white text** — it is the one deleted rather than archived, and inversion is Stellar's own mechanism for exactly this emphasis.

Caption: *Configured minimum: 720 ledgers — about an hour. Our own temporary entry had 688 left when first sampled.*

**16.3 The blast radius — dark, `--pine`**

The thesis section. An inline SVG: three contract nodes converging on a single `ContractCode` entry, with that entry's expiry beneath it.

Beside it, in the display serif at `--step-3`:
**"One entry. Every contract built from that Wasm. They fail together."**

And the measured figure in a stat cell: **98%** — *of the cost of keeping four entries alive is that one shared entry.* The scope travels with the number: 98% is guinea-pig A's four-entry scan, and instance and code alone give 99%.

**16.4 Proof — light**

The decay chart as the same build-time SVG the dashboard uses (§18.3), captioned and linked into the dashboard. This is the landing page's strongest asset and it is real data, not an illustration. **It carries three panels, so its caption has more to do: if two lines cannot carry §18.3's captions honestly, the landing links to the chart rather than embedding it.**

**16.5 Live output — light**

A real terminal block, mono, on `--off-black`, showing an actual `scan --cost` result. Not a mockup. Include the sharing warning and the coverage line — the honest parts are the persuasive parts. Take it from a committed capture rather than re-running it at build time, and show no install line until the npm package is published and verified from a clean machine.

**16.6 How it works — light, three link cards**

`Scan` → `Watch` → `Extend`, one sentence each. The third carries the permissionless fact: *Evergreen has no authority over your contract. Extending a TTL needs no permission from anyone — it is a property of the chain, not a promise from us.* Never write "zero keys" in any form: the engine holds a funded testnet fee key. The authority sentence is the true claim, and the stronger one.

**16.7 Closing — dark, `--pine`**

The mission line in the display serif: **"Make TTL something you configure once instead of remember."** Primary pill to `/dashboard`. Footer: repo, npm, the grant, the chapter.

## 17. Docs — `/docs`

Install, quickstart, every flag, exit codes, the JSON schema. Mono blocks on `--off-black`, copy buttons, no login.

Content comes from the repository README and must not be paraphrased into drift — generate it where possible. A documentation page that disagrees with the tool is worse than no page.

## 18. Dashboard — `/dashboard`

**One combined surface: a scan field at the top, then our live contracts.** A visitor who arrives with no contract ID sees something working immediately; a visitor who has one uses the field at the top.

**18.1 Header strip**

Evergreen mark, then two views — **Scan & Status** and **Blast Radius** — as Stellar-style pills, active state inverted. A quiet link back to the landing site. Nothing else.

**18.2 Scan field — top of the surface**

A single large mono field accepting **one** contract ID. Placeholder is a real testnet contract. Beneath, collapsed: **data keys** (optional, with one line explaining that without them only instance and code entries are visible) and **ledgers to extend** for the cost estimate, defaulting to 518,400 (≈30 days).

Beside it, one line: *Checking several contracts that share a Wasm? Use **Blast Radius**.* — linked. The multi-contract case has its own entry point and this is the only place the single-scan view mentions it.

**18.3 Our contracts — the decay chart**

**This is the most persuasive thing the project can show, and it should be built as a first-class visualisation rather than a table.**

*Revised 2026-09-17. The earlier version drew two lines — a sawtooth for A and a decline for B — against the default threshold bands. That implied natural decay on guinea-pig A, which `W4-D28-01` already calls a false claim to a funder.*

**Plot entries, not contracts — three of them:**

1. **B's instance — the control.** Deployed on 5 September and calibrated once that day with a disclosed manual extend, then left alone. It expires on 21 September.
2. **A's instance.** Extended several times, by different actors.
3. **The shared code entry** — the one A, B and C all depend on. It ends at ledger 5,290,829 (about 20 October) and is extended on 26 September by `W3-D18-02d`.

The third series is the point. A's instance runs to December, but A stops working on 20 October without that code entry: the binding-date lesson and the blast-radius thesis in one line, which a two-series chart could not show.

**Small multiples, not one axis.** Three stacked panels share one horizontal axis, each with its own vertical scale, with B's panel first. One axis would flatten A into a straight line or compress B's death into invisibility, and normalising the series would be a transformation the viewer cannot check.

**Every point is an observation; every segment says what it is.**

- Observations are dots at real recorded readings, visually distinct from the thin line between them. Points may be irregularly spaced and should look it.
- A segment between two observations is solid. Decay is deterministic — one ledger per ledger closed — so the straight line is arithmetic rather than a guess, provided nothing was extended in between. Where something was, the step shows.
- A segment from the last observation to a known expiry ledger is dashed. B reaching zero at ledger 4,793,687 is arithmetic on a known value, not a projection — but it is not an observation either, and must not look like one.
- Nothing is drawn past a known expiry. No forecasts, no "auto top-up" points, no protocol-lifetime ranges.

**Threshold bands show what was in force.** The warning and action tiers are drawn as horizontal bands so crossings are visible rather than described. On A's panel the band follows the threshold actually in force, which was raised for the save.

**Every point and every step is inspectable.** A point shows the ledger observed, the remaining TTL, the health at that moment and a link to the evidence bundle it came from. An upward step shows:

- who acted — *engine, unattended* or *manual CLI*, which are different claims and must not blur;
- the threshold in force at that moment, because it changed;
- the transaction hash, linked to the explorer.

**The captions are where the honesty lives.**

- **A:** *A's action threshold was raised to bring its instance into range. The decay was arranged; the response was not — the engine detected the condition and submitted without a human.* What is demonstrated is autonomous response, not natural decay, and saying so costs nothing, because the autonomy is the part that matters.
- **B:** *B was deployed on 5 September and calibrated once that day with a disclosed manual extend. Nothing extended it after that. It expired on 21 September.*
- **The shared code entry:** *All three contracts share this entry. It is what actually binds A's expiry — A's instance runs to December, but without this code entry A cannot execute after 20 October.*

**B's expiry marker is permanent.** After the event the chart becomes the record of the event; it must not collapse into a status display.

Beneath the chart, a compact card per contract with the current scan result.

**18.4 Scan result**

Order matters, and it is not the CLI's order:

1. **Verdict banner.** Worst health, binding date, coverage statement. If the scan is partial, the banner says so in the same size as the verdict. Nearly every scan is partial: a single contract always carries an undetermined code entry, and a scan without data keys is coverage-limited. That is the product working, so say it once, plainly, beside the verdict — not as an alarm.
2. **Binding expiry, stated once, prominently.** *This contract stops working on **20 October 2026**, at ledger `5,290,829` — its code entry expires first.* The single most useful sentence the product can produce.
3. **Entry table.** Kind chip, truncated key in mono (click to copy full), remaining ledgers, expiry date with `~`, expiry ledger, health chip, blast radius.
4. **Blast radius panel.** Here it is always *undetermined* for a single contract — violet, explained, with the link into Blast Radius carrying the current ID prefilled.
5. **Cost panel.** Total first — *what leaves the account* — rent broken out beneath, per-entry split with the dominant entry called out. Always carry the provenance: priced by simulation at ledger N, varies with network state, an estimate to budget against. Round as the CLI does: two significant figures and *about*. Show the increment the user asked for, never `RentEstimate.extendToLedgers`, which holds the largest per-entry absolute target.
6. **Storage advice**, collapsed.
7. **JSON**, collapsible mono block with a copy button.

**18.5 Empty, error and degraded**

- **Invalid ID** — caught before any request, naming the expected shape.
- **Not found on chain** — *this is not "healthy"*. Violet, with the words *not found*, naming both causes: archived (restore it) or never deployed (check the ID). The CLI exits 3 here for exactly this reason.
- **Unread** — an entry came back without TTL metadata. Violet, the word *unread*, and a rescan as the remedy.
- **RPC failure** — a top-level *incomplete* state, never violet: the check did not run. It says which endpoint failed, and that the contract is unaffected by our failure to read it.
- **Partial** — a top-level state, never a per-row footnote.

## 19. Blast Radius — `/dashboard/blast-radius`

Its own entry point, because it is the differentiated capability and burying it inside the scan field would make it look optional.

**19.1 Framing**

Open with the problem in one sentence, because most visitors do not know they have it: *Contracts built from the same Wasm share one code entry. A scan of one contract cannot see the others. Give it all of them and it can.*

**19.2 Input**

A multi-line mono field, one contract ID per line, with a visible count. Paste-friendly — a maintainer has these in a list somewhere. An example set that populates on click.

**19.3 Result**

**The dependency graph is the output**, not a table. Contract nodes on one side, ledger entries on the other, edges where a contract depends on an entry. The shared entry is visually dominant — larger, pine-filled, labelled with its consumer count.

Then:

- **The verdict sentence.** *These 3 contracts share 1 code entry. It expires 20 October 2026. They fail together.*
- **Per-entry table** with `blastRadiusAtLeast` and the named consumers.
- **Cost panel** showing the split — this is where the 98% figure becomes personal rather than a marketing claim.
- **Still-undetermined notice.** Even a multi-contract scan only proves a lower bound: contracts you did not list may also depend on that entry. Say so. `blastRadiusAtLeast` is named that way for a reason and the interface must not round it up to a certainty.

## 20. About — `/about`

Team, grant, chapter, and a short section on method: measured rather than assumed, corrections kept in the record. Link the evidence directory. Aimed at reviewers; keep it short.

---

# PART SEVEN — COMPONENTS

| Component | Notes |
|---|---|
| **Status chip** | Pill, `--radius-full`, dot + label. Five variants per §8, with the three words of §10 on violet. Never colour alone — the dot shape differs per state for colour-blind readers. Labels in the §8 text tones. |
| **Entry row** | Kind chip, mono key (truncate **middle**, not end — the tail disambiguates), remaining, dates, health, blast radius. |
| **Stat cell** | Inter label, Newsreader numeral `--step-4`+, Inter caption. Hairline grid. One cell invertible. |
| **Terminal block** | `--off-black` surface, Space Mono, preserved whitespace, copy button, horizontal scroll on overflow, never wrapped. |
| **Decay chart** | §18.3. Irregular real points, inspectable, threshold bands, permanent expiry marker. |
| **Dependency graph** | §19.3. Inline SVG, no graph library unless the node count demands one. |
| **Link card** | Hairline border, Inter 600 heading, 70%-black body, bottom-aligned arrow link. |
| **Pill button** | Primary: pine surface, white label, sage arrow badge. Secondary: transparent, hairline border. |
| **Coverage banner** | Full-width, above results, scope in the verdict's own weight. |
| **Copy control** | On every ledger key, contract ID and transaction hash. Copies the **full** value, never the truncation. |

**Number formatting is a correctness requirement, not a preference.** Every formatted number must pin its locale explicitly. An unpinned `toLocaleString()` renders `120,909` as `120.909` in German and in Arabic changes the digits themselves. We found and fixed this in the CLI; the interface inherits the same hazard, and a reviewer checking our figures on their own machine is exactly the person who would hit it.

---

# PART EIGHT — RESPONSIVE, ACCESSIBILITY, PERFORMANCE

**Breakpoints:** ≤639 mobile, 640–1023 tablet, ≥1024 desktop. Content max-width 1280px, 24px minimum side gutter at every width.

**The entry table is the hard case.** Do not compress it into an unreadable grid. At mobile each entry becomes a stacked card: kind and health on the first line, key on the second, then a definition list of the numbers. Horizontal scroll is acceptable for the table only if the first column stays pinned.

**The decay chart at mobile** keeps both lines — dropping one loses the comparison that is the whole point. Reduce to two threshold bands and fewer axis labels rather than fewer series.

**Accessibility:**

- Contrast 4.5:1 text, 3:1 UI and graphics. The status colours fail as small text on light grounds — teal is 2.92:1 on white — so words use the §8 text tones
- Status never colour alone: chips carry a label, dot shape differs per state
- The decay chart needs a table equivalent behind a toggle, and the two series must differ by more than colour
- Full keyboard path through scan → result → copy
- Live regions announce scan completion and the verdict
- `prefers-reduced-motion` disables the hero wash and all transitions
- Visible focus ring on every interactive element, pine-derived, at Stellar's alpha

**Performance:** the landing page must be useful without JavaScript — and because it has no input field, it can be entirely static. The dashboard requires JS by nature. Self-host Newsreader, Inter and Space Mono as subset woff2 with `font-display: swap`. Inline critical CSS. No analytics that tracks individuals.

**Theming:** design light-first. If dark mode is implemented, re-derive the status palette rather than inverting it. On pine, the critical red and the violet fail even as marks (2.29:1 and 2.72:1), and neither the status colours nor their text tones pass as text.

---

# PART NINE — TECHNICAL CONSTRAINTS

**Deployment.** Cloudflare Pages at `evergreen-stellar.pages.dev`, auto-deploying from `main`. A custom domain may follow.

**Data.**

- **Landing** — fully static. Every figure it shows is baked at build time from committed evidence.
- **Dashboard status and decay chart** — a JSON snapshot committed at build time, derived from the evidence bundles. Zero infrastructure, correct as of the last deploy, and honest because the source is the evidence record itself.
- **Scan and blast radius** — call Soroban testnet RPC **directly from the browser**.

There is no backend, no database and no stored user state. This is not a limitation to work around; it is what makes the dashboard trivially trustworthy.

**Verified 2026-09-17: core bundles for a browser but does not yet scan correctly in one.** It builds with no errors. In a real browser a scan returns zero entries and a rent estimate of "0", with no error, because the read path validates base64 with Node's global `Buffer` and the failure is reported as bad data (#194). Client-side scanning stays the architecture, and the fix belongs in core; until it lands, a local shim behind a parity test stands in, and it is deleted the day core is fixed. **Do not fork the display logic.** Two implementations of the same rendering will drift, and the drift will be in the numbers. The regression test must run in a real browser: a test on Node, jsdom included, cannot see this failure.

**Reuse, do not re-derive.** Health tiers, formatting, thresholds and blast-radius rules all exist in `@evergreen-stellar/core`. The rules that compose them into what a person reads — the verdict, the PARTIAL rule, the wording, cost rounding — live in the CLI today and move into core under #195. A second implementation in the web app would be a second source of truth for values the CLI is authoritative on, and this project has already paid several times for exactly that.

---

# PART TEN — OUT OF SCOPE

Wallet connection. Extending from the interface. Any write to the chain. Mainnet. Accounts, login, saved watchlists, notifications configured in the UI. Payment or billing. Multi-tenant anything. Localisation beyond English.

**Evergreen never pays another party's extend fees**, and nothing in the interface may suggest otherwise.

**Nothing ships that is not in the repository, the PRD or the SOW.** No claims about programmes, organisations, infrastructure, uptime or custody beyond what those record. What stays, because it is true: the Stellar Instawards grant, the Stellar Ambassador Chapter Indonesia, Apex as the team, Fatih and Rakha with the roles in §3, the MIT licence, `evergreen-stellar.pages.dev` and the `@evergreen-stellar` npm scope.

---

# PART ELEVEN — DECISIONS MADE, AND WHAT IS STILL OPEN

**Settled — do not reopen:**

| Question | Decision |
|---|---|
| Status and scan | **One combined surface** at `/dashboard` |
| Landing vs dashboard | **Separate.** Landing carries product, docs and profile and has **no tooling**. The tool is reached by entering the dashboard. |
| Multi-contract | **Its own entry point** at `/dashboard/blast-radius` |
| Decay story | **Timeline of recorded evidence**, not present-state only. The expiry marker persists after the event. Three panels of entries, not two lines of contracts (§18.3, 2026-09-17). |
| Language | **English only.** Strings in one module; no i18n scaffolding yet. |
| Logo | **Does not exist.** Three directions to mock per §9 before choosing. |
| Page exports | **Not committed.** Only this spec and `DESIGN.md` are; every web PR attaches a render of what it built (2026-09-17). |
| Typefaces and surface | **Newsreader, Space Mono and the warm `#fcf9f8`** from the exports; the body sans is proposed as Inter and awaiting confirmation (2026-09-17). |
| Claims | **Nothing ships that is not in the repository, the PRD or the SOW** (Part Ten, 2026-09-17). |

**Answered 2026-09-17:**

1. **The decay chart anchors the landing page too** — as the same build-time SVG, captioned. If two caption lines cannot carry §18.3's captions honestly, the landing links to the chart instead.
2. **A cold visit with no ID and no JavaScript** gets the recorded state, pre-rendered: the chart and one card per contract, each labelled with the ledger it was recorded at. The scan and blast-radius inputs are not rendered without JavaScript; one sentence says scanning runs in the browser and that the CLI runs the same scan. With JavaScript, the cards refresh from a live read-only scan and say so.
3. **`/docs` is generated from the tool** — its help text, its exported exit codes, the annotated type declarations and marked README sections — and the build fails when a source moves.

**Still open, with proposed defaults:**

1. **The body sans.** Inter is named for body and interface text by `DESIGN.md` and loaded by every export. Awaiting confirmation.
2. **The decay chart's horizontal axis.** Proposed: ledgers, with approximate dates (`~`) as labels. The solid-segment rule in §18.3 is exact arithmetic in ledgers and only approximately so in time.
3. **An extension between two observations.** Proposed: draw the step at the transaction's ledger from its recorded before-and-after values; where those were not recorded, leave the two observations unconnected rather than draw a line that is not arithmetic.
4. **Observations after an expiry**, when the entry is absent. Proposed: annotations on the permanent expiry marker, with their ledgers and evidence links — never points on the line, which ends at the expiry.
5. **Provenance for engine steps.** Proposed: each engine step also names its trigger. `W3-D18-02a` ran on a local timer rather than the production scheduler, and its own record says so.
