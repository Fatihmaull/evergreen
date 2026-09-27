# Evergreen

**A Soroban state-archival autopilot.** Monitor contract TTL, predict archival, estimate rent cost, and extend TTL automatically — non-custodially.

Soroban ledger entries expire. An entry is still live on its final ledger — remaining TTL zero means one ledger left, not expired. After that, what happens depends on the entry type: **persistent, instance and code entries are archived** and the contract stops working until someone pays to restore them, while **temporary entries are deleted outright and cannot be recovered at all.** Stellar has no dedicated tooling to automate this today, so developers track TTL by hand. Evergreen fixes that.

> 🚧 **In active development.** Built by [Apex](#team) during a 30-day Stellar Instawards engagement (2026-09-03 → 2026-10-02). Testnet only for now.

## What's in the box

| Component | What it does |
|---|---|
| **`evergreen` CLI** | Scan any contract: remaining TTL, projected archive date, estimated rent cost, storage inefficiencies. Human-readable or `--json`. |
| **Auto-Bump Engine** | A scheduled worker that submits `extendTTL` before expiry. You self-host it and fund its hot payer account; the normal engine path restricts operations and fees, but the raw v1 key is not cryptographically scoped. Email alerts on every bump. |
| **Dashboard + `evergreen-check`** | A public read-only view — scan any contract's TTL health, no wallet or signup — plus a GitHub Action that fails CI when a contract's TTL gets dangerously low. |

**Try it without installing anything: [evergreen-stellar.pages.dev/dashboard/](https://evergreen-stellar.pages.dev/dashboard/)** — paste any testnet contract ID. No wallet, no signup, no account.

## Why this is non-custodial

Because Soroban makes it so. **TTL extension is permissionless**: anyone may submit `ExtendFootprintTTLOp` against any ledger entry, provided they pay the resource fee. Stellar's state-archival documentation states it directly — *"There is no access control for TTL extension operations."*

So Evergreen never asks for authority over your contract, because no such authority exists to grant. There is no key to hand over, no permission to revoke, no scope to trust. The engine holds nothing but the lumens it uses to pay fees.

Two consequences worth stating plainly:

- **You always pay your own rent.** Evergreen supplies the automation, not the money. Apex never funds another party's extend fees — see [`docs/adr/ADR-004`](docs/adr/ADR-004-payment-model.md).
- **Connecting a wallet authorizes a payment, never access.** The dashboard's optional "extend now" asks your wallet to pay a fee. It never asks for control of anything.

The engine's signing key is a hot key on **your** server, paying from **your** funded account. Stage 1 checks operations and fees in its normal execution path, but a leaked raw key can bypass those software checks. A hardened policy signer is **not currently available**; the accepted v1 disposition is to ship policy scoping as partial and defer full scoping to SOW 2. [`docs/POLICY-SIGNER.md`](docs/POLICY-SIGNER.md) explains the implemented path and its limits.

## Quickstart

**Works today from npm.** Needs Node 24.

```bash
npx @evergreen-stellar/cli@0.1.0 scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
```

To work from source, use Node 24 (`.nvmrc`) and pnpm 11:

```bash
git clone https://github.com/Fatihmaull/evergreen.git
cd evergreen
pnpm install
pnpm build
```

Then scan our public test contract — no key, no account, no signup. **Scanning
is a permissionless read; nothing here can spend anything.**

```bash
pnpm cli scan CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
```

```
HEALTHY  instance  AAAABgAAAA…
  remaining:  1,512,868 ledgers — live
  ends at:    ledger 6,370,261
  expires ~:  2026-12-21T17:41:36.907Z (estimate — ledgers are the truth)
  observed:   ledger 4,857,393
  health:     HEALTHY — Above threshold.
```

**Your `remaining` will be lower than this** — it falls about one ledger every five
seconds, which is why `observed` is printed. `ends at` is the stable number.

> Re-captured from the published `0.1.0` on 2026-09-25. It previously read
> `ends at: ledger 6,026,591`, which was A's expiry **before the engine extended
> it on 2026-09-14** — so nobody following this page could have reproduced it.

That contract is deliberately long-lived, so it reads the same for you as it did
for us. Swap in any Testnet contract ID.

### What will it cost to keep alive?

```bash
pnpm cli scan <contract-id> --cost --ledgers 518400
```

```
Cost to extend 2 entries by 518,400 more ledgers
  total   about 0.82 XLM  (8,212,413 stroops) — what leaves the account
    rent  about 0.82 XLM  (8,188,780 stroops)
    fees  about 0.0024 XLM  (23,633 stroops) — non-refundable resource + base fee
```

Priced by simulating the real operation against live network config, not by a
local formula. It is an estimate: rent varies with network state, and we have
measured ~18% between days.

### The thing most people do not know they have

Contracts built from the same Wasm **share one `ContractCode` ledger entry**. If
it expires, every one of them breaks at once — and a scan of a single contract
*cannot tell you* whether others depend on it. Pass them together:

```bash
pnpm cli scan <contract-a> <contract-b> <contract-c>
```

```
⚠ shared:   this code entry is shared with 2 other contracts — they fail together
```

On our three test contracts that one shared entry is **97% of the rent bill** —
it is simultaneously the biggest availability risk and the biggest line item.
The exact share depends on which entries are in scope; scanning one of them with
its data keys puts it at 98%. Either way the shape is the point: the entry
everything depends on is also the entry that costs.

### Other things worth knowing

```bash
pnpm cli scan <id> --json        # complete record, including every caveat
pnpm cli scan <id> --optimize    # storage advice, with its evidence and limits
pnpm cli extend --help           # manual extendTTL — simulates unless you pass --submit
```

Exit codes are meaningful: `0` healthy, `1` low TTL observed, `2` error, `3` the
scan came back incomplete. **A clean exit means "everything I was asked to check
is healthy", never "this contract is fully healthy"** — scanning cannot enumerate
a contract's storage, so coverage is printed with every scan.

### Run the published CLI

```bash
npx @evergreen-stellar/cli@0.1.0 scan <contract-id>
```

## Use it in CI

`evergreen-check` fails a job when any watched ledger entry is at or below your
TTL threshold. It is read-only — it scans, and never signs or submits.

```yaml
- uses: Fatihmaull/evergreen@v1
  with:
    contracts: CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L
    threshold: '120960'        # ledgers; default 17,280 (~1 day)
    keys-file: evergreen.keys.json
```

**Set `threshold` to the margin you actually want.** A repository that wants a
week of warning fails at 120,960, not at our default of one day.

**`require-declared-scope` is on by default, and leaving it on is the point.** A
scan with no declared data keys reads only the instance and code entries, so a
green build would mean *"the entries I could see are healthy"* — silent about
persistent storage. Declare scope with `keys-file`, or assert `no-data-keys: 'true'`
if the contract genuinely has none.

The job fails on **1** (at or below threshold), **2** (error) and **3**
(incomplete) — an incomplete scan is not evidence of health.

Same threshold from the CLI:

```bash
npx @evergreen-stellar/cli scan <contract-id> --threshold 120960
```

## Documentation

**Assessing this for the Stellar Instawards grant?** Start at
[`docs/SUBMISSION-WALKTHROUGH.md`](docs/SUBMISSION-WALKTHROUGH.md) — ten steps,
about ten minutes, no terminal, with what each step proves and every incomplete
item named at the step where you meet it. For coverage rather than a route,
[`docs/SUBMISSION-INDEX.md`](docs/SUBMISSION-INDEX.md) has one row per SOW §6.1
evidence item, browser-openable artifact first.

| Doc | Read it for |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | What we're building, for whom, and what's explicitly out of scope |
| [`BACKLOG.md`](BACKLOG.md) | The 30-day plan: weekly milestones, daily tasks, slack ledger, cut order |
| [`docs/STATUS.md`](docs/STATUS.md) | Current state — what's done, in flight, and blocked |
| [`docs/EVIDENCE.md`](docs/EVIDENCE.md) | Grant deliverable evidence — tx hashes, screenshots, published artifacts |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Modules, data flow, boundaries |
| [`docs/SOROBAN-PRIMER.md`](docs/SOROBAN-PRIMER.md) | TTL, rent, archival, and the RPC shapes we rely on |
| [`docs/SETUP.md`](docs/SETUP.md) | Getting a machine productive |
| [`docs/ENGINE-SETUP.md`](docs/ENGINE-SETUP.md) | Current Testnet engine self-host path and its live-scheduler limits |
| [`docs/ACTION-GUIDE.md`](docs/ACTION-GUIDE.md) | Copyable read-only CI check with declared storage scope |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Code style, commits, testing, secret handling |
| [`docs/adr/`](docs/adr/) | Why things are the way they are |
| [`docs/ONBOARDING.md`](docs/ONBOARDING.md) | **Start here if you're an agent** — orientation, the five things that will bite you |
| [`AGENTS.md`](AGENTS.md) | Operating manual for any coding agent — canonical, tool-agnostic |

## Contributing

This repo is built with heavy agent assistance, so context lives in files rather than in anyone's head. Start with [`docs/ONBOARDING.md`](docs/ONBOARDING.md) for orientation, then [`AGENTS.md`](AGENTS.md) for the rules and `docs/STATUS.md` for current state. `AGENTS.md` is canonical for every agent tool; `CLAUDE.md` is just a pointer to it. Tasks come from `BACKLOG.md` and carry stable IDs (`W2-D8-01`) referenced in branches and commits.

## Scope boundaries (v1)

Testnet only. No mainnet auto-bump, no hosted billing, no rent subsidy, no multi-sig custody, no non-Soroban chains, no audit tooling. The engine is self-hosted by you; we do not run infrastructure on anyone's behalf. Those are deliberate non-goals for this grant — see [`docs/PRD.md`](docs/PRD.md) §3.

## Team

Apex — Fatih Maulana and Rakha, Stellar Ambassador Chapter Indonesia.

## License

MIT.
