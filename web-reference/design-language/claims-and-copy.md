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

| Never | Why |
|---|---|
| Any **mainnet** reference, path or promise | Testnet only. The config compares the network passphrase rather than trusting a label |
| A **protocol version number** | This project does not publish one. The design export said "Testnet v21"; it was removed |
| **Wallet connect**, sign-in, accounts, or any disabled control standing in for one | Cut deliberately as the next scope's headline. A disabled control is a promise with a date on it |
| "**Non-custodial**", "zero-privilege", "no keys" | False. The engine holds a funded testnet payer. A "Zero-Privilege Node · No Keys" panel was removed from the export for exactly this |
| "**Policy signer**" as a shipped feature | `docs/POLICY-SIGNER.md`: "Stage2 policy signer is not available"; the engine rejects that payer kind |
| A **daemon**, uptime figure, or "always on" | ADR-001 chose a scheduled job and rejected a long-running service by name |
| **Discord, Telegram, Slack or webhook** notifications | Email is the only implemented channel |
| `evergreen bump` or `evergreen estimate` | The commands are `scan` and `extend`. Forecasting is `scan --cost` |
| `@evergreen/cli`, `evergreen.sh` | The package is `@evergreen-stellar/cli`; that domain is not ours |
| A **rounded** measured number | See below |
| A **fabricated** figure of any kind | If a panel has no real number, it shows no number |

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

The footer states on every page: **"Testnet only. Read-only: these pages never
sign or submit anything."** Any deliverable that shows the product should be
able to say the same without qualification.

## Attribution

Short form, as it appears on the site: **"Built for Stellar, backed by
Instawards."** The full form — the team, the Stellar Ambassador Chapter
Indonesia, the grant's size and dates, and the MIT licence — lives on `/about/`
and should be taken from there rather than retyped.
