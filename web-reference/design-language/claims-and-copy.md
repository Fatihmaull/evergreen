# Claims and copy

Anything appearing as on-screen text is a claim this project is making. This
file is the difference between a video that survives a grant review and one
that has to be re-cut.

## The voice

Pragmatic, specific, and willing to say what it does not know. Sentences that
would survive being moved to a different product do not belong here.

| Instead of | Say |
|---|---|
| "Powerful TTL monitoring" | "Reads what expires first, and what fails with it" |
| "Never lose your contract state again" | "Three of the four entry kinds are a bill. One is a burial" |
| "Enterprise-grade security" | "It holds a funded testnet key. Here is what constrains it" |
| "100% reliable" | The measured delivery rate, with its date |

## Never appears

These are not stylistic preferences. Each one is either false, forbidden by
the project's own record, or has already been removed once.

Phase 2 (`phase-2/PHASE2-PLAN.md`) will make some of them true. **A row lifts
only when the feature is on `origin/main` and verified on production**, not
when it is planned, merged to a branch, or announced. Lifting one is an edit to
this file, with the evidence named, made by the design authority. Cards are
named by their registered task IDs in `BACKLOG.md` § Phase 2 (`PH2-…`).

| Never | Why | Lifts when |
|---|---|---|
| Any **mainnet** reference, path or promise | Testnet only. The config compares the network passphrase rather than trusting a label | Mainnet **read-only scan** may be named once it ships (`PH2-E1-03`). Mainnet writes, extends and autopilot: not until DoD-2 is met (`PH2-E5-02`) and the mainnet launch ships (`PH2-E5-04`) |
| A **protocol version number** | This project does not publish one. The design export said "Testnet v21"; it was removed | Never |
| **Wallet connect**, sign-in, accounts, or any disabled control standing in for one | Cut deliberately as the next scope's headline. A disabled control is a promise with a date on it | Login and wallet linking ship (`PH2-E3-01`). A **disabled** control standing in for an unshipped feature never appears |
| "**Non-custodial**", "zero-privilege", "no keys" | False. The engine holds a funded testnet payer. A "Zero-Privilege Node · No Keys" panel was removed from the export for exactly this | Only in the words of the **public custody statement Fatih approves** (`PH2-E4-06`), quoted, not paraphrased. The allowance design is "allowance, not custody" in the plan; that phrase is not copy until then |
| **Fees, prices, percentages, billing**, "paid tier", "free" as a price | No fee exists. The spec's out-of-scope list forbids payment and billing (Part Ten) | A fee number appears only after Fatih sets it (`PH2-E5-03`) and it ships. "Open source, MIT" is true now and may be said |
| "**Support Evergreen**", tips, donations | Not built | When the CLI tip or the website page ships (`PH2-E1-08`, `PH2-E3-07`). Never with a promise of what a tip buys |
| "**Policy signer**" as a shipped feature | `docs/POLICY-SIGNER.md`: "Stage2 policy signer is not available"; the engine rejects that payer kind | That document changes |
| A **daemon**, uptime figure, or "always on" | ADR-001 chose a scheduled job and rejected a long-running service by name | "Always on" never. An uptime or delivery figure only as measured, with its date. A hosted autopilot is described as **scheduled** when it ships (`PH2-E4-01`–`PH2-E4-05`) |
| **Discord, Telegram, Slack or webhook** notifications | Email is the only implemented channel | Per channel, when that channel ships (Telegram and webhook: `PH2-BL-02`) |
| `evergreen bump` or `evergreen estimate` | The commands are `scan` and `extend`. Forecasting is `scan --cost` | Never; new commands are named as they ship |
| `@evergreen/cli`, `evergreen.sh` | The package is `@evergreen-stellar/cli`; that domain is not ours | Never |
| A **rounded** measured number | See below | Never |
| A **fabricated** figure of any kind | If a panel has no real number, it shows no number | Never |

**Fixed 2026-10-22.** The landing page's closing section said "Stellar
testnet, read-only, no key and no account". It now says "You need no key and
no account to scan", which says whose key. Re-check it when `PH2-E3-01` ships.

## The real numbers

Use these. They are measured, committed, and every one of them is on the site
already.

| Figure | What it is |
|---|---|
| **98%** | Of guinea-pig A's rent held by one shared code entry — 8,116,648 of 8,264,289 stroops, across all four of its entries |
| **99%** | The same entry scanned against instance and code only. Identical rent, different denominator — *the scope travels with the number* |
| **120,960 / 17,280 ledgers** | The warning and act-now thresholds, about seven days and one day |
| **720 ledgers** | A temporary entry's minimum, about an hour, read from the network's own configuration |
| **688** | What our own temporary entry had left when first sampled |
| **4,793,687** | The ledger guinea-pig B's instance ended at, ~21 September 2026 |
| **5.000000 s ± 0.000050** | Measured ledger close, 2026-09-10. Not "about five seconds" when quoted as a measurement |
| **5,064 / 44,725 stroops** | Two real extension fees, with transaction hashes on the extension history |

## Phrases that carry weight

These are load-bearing and should be quoted rather than paraphrased:

- **"Absence is not health."** A clean scan covers only what was asked for.
- **"Ledgers are the truth, dates are a convenience."** Every date is derived at
  five seconds per ledger and travels with a `~`.
- **"Three are recoverable. One is not."** The four entry kinds.
- **"One entry. Every contract built from that Wasm. They fail together."**
- **"Undetermined, unread, not found."** Three ways a scan declines to
  conclude, and they are not the same as an error.

## Obligatory

The footer states on every page: **"Testnet only."** Any deliverable that
shows the product should be able to say the same without qualification. On a
canvas it is the label line "Stellar testnet" ([`formats.md`](formats.md)).

**No surface says the site never signs** (Fatih, 2026-10-22). "Read-only: these
pages never sign or submit anything", "never asks you to sign", and any
equivalent are retired from every page, banner, footer, meta description and
README, because the product now asks a wallet to sign (wallet linking,
`PH2-E3-01`; the allowance and extend flows, `PH2-E3-04`, `PH2-E3-05`). A
retired sentence is not replaced with a new blanket one. What may be said
instead is narrow and true:

- **"Signing in with email cannot move XLM."** ADR-008: nothing that moves XLM
  is ever authorised by an email session. It appears only where sign-in
  appears, so it follows the "Wallet connect, sign-in, accounts" row above.
- A **page-specific** statement of what that page does ("A scan is a read",
  "No wallet, no signup") where it is true of that page.
- Custody wording ("we never hold your keys", "XLM moves only under an
  allowance you signed") stays behind the custody row above: only in the words
  of the custody statement Fatih approves (`PH2-E4-06`).

## Attribution

Short form, as it appears on the site: **"Built for Stellar, backed by
Instawards."** The full form — the team, the Stellar Ambassador Chapter
Indonesia, the grant's size and dates, and the MIT licence — lives on `/about/`
and should be taken from there rather than retyped.

## Review

Anything made for Evergreen — by the marketing agent, a web agent, or a
person — passes this file before it is published. The design authority
rejects any output that breaks it, whoever made it, and says which row. The
quick check:

1. Every number is in § The real numbers or names its committed source, and
   none is rounded.
2. Every number has its scope beside it.
3. Nothing in § Never appears, unless that row has lifted.
4. "Stellar testnet" is visible wherever the product is.
5. No sentence that would survive being moved to a different product.

