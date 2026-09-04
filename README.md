# Evergreen

**A Soroban state-archival autopilot.** Monitor contract TTL, predict archival, estimate rent cost, and extend TTL automatically — non-custodially.

Soroban ledger entries expire. When a contract's TTL hits zero, its state is archived and the contract stops working until someone pays to restore it. Stellar has no dedicated tooling to automate this today, so developers track TTL by hand. Evergreen fixes that.

> 🚧 **In active development.** Built by [Apex](#team) during a 30-day Stellar Instawards engagement (2026-09-03 → 2026-10-02). Testnet only for now.

## What's in the box

| Component | What it does |
|---|---|
| **`evergreen` CLI** | Scan any contract: remaining TTL, projected archive date, estimated rent cost, storage inefficiencies. Human-readable or `--json`. |
| **Auto-Bump Engine** | A scheduled worker that submits `extendTTL` before expiry. You self-host it and fund its account; it can do nothing except pay to extend TTL. Email alerts on every bump. |
| **Dashboard + `evergreen-check`** | A public read-only view — scan any contract's TTL health, no wallet or signup — plus a GitHub Action that fails CI when a contract's TTL gets dangerously low. |

## Why this is non-custodial

Because Soroban makes it so. **TTL extension is permissionless**: anyone may submit `ExtendFootprintTTLOp` against any ledger entry, provided they pay the resource fee. Stellar's state-archival documentation states it directly — *"There is no access control for TTL extension operations."*

So Evergreen never asks for authority over your contract, because no such authority exists to grant. There is no key to hand over, no permission to revoke, no scope to trust. The engine holds nothing but the lumens it uses to pay fees.

Two consequences worth stating plainly:

- **You always pay your own rent.** Evergreen supplies the automation, not the money. Apex never funds another party's extend fees — see [`docs/adr/ADR-004`](docs/adr/ADR-004-payment-model.md).
- **Connecting a wallet authorizes a payment, never access.** The dashboard's optional "extend now" asks your wallet to pay a fee. It never asks for control of anything.

The engine's signing key is a hot key that sits on a server with lumens on it — and in v1 that server and that key are **yours**. Capping what it can do therefore protects *you*, which is what [`docs/POLICY-SIGNER.md`](docs/POLICY-SIGNER.md) is for: the hardened path for self-hosters, documented and demonstrated, not mandatory.

## Quickstart

*(Available once packages are published — W4-D27.)*

```bash
npx evergreen scan <contract-id>
```

## Documentation

| Doc | Read it for |
|---|---|
| [`docs/PRD.md`](docs/PRD.md) | What we're building, for whom, and what's explicitly out of scope |
| [`BACKLOG.md`](BACKLOG.md) | The 30-day plan: weekly milestones, daily tasks, slack ledger, cut order |
| [`docs/STATUS.md`](docs/STATUS.md) | Current state — what's done, in flight, and blocked |
| [`docs/EVIDENCE.md`](docs/EVIDENCE.md) | Grant deliverable evidence — tx hashes, screenshots, published artifacts |
| [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) | Modules, data flow, boundaries |
| [`docs/SOROBAN-PRIMER.md`](docs/SOROBAN-PRIMER.md) | TTL, rent, archival, and the RPC shapes we rely on |
| [`docs/SETUP.md`](docs/SETUP.md) | Getting a machine productive |
| [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) | Code style, commits, testing, secret handling |
| [`docs/adr/`](docs/adr/) | Why things are the way they are |
| [`CLAUDE.md`](CLAUDE.md) | Operating manual for AI agents working in this repo |

## Contributing

This repo is built with heavy agent assistance, so context lives in files rather than in anyone's head. Start with `CLAUDE.md` and `docs/STATUS.md` — between them they tell you the rules and the current state. Tasks come from `BACKLOG.md` and carry stable IDs (`W2-D8-01`) referenced in branches and commits.

## Scope boundaries (v1)

Testnet only. No mainnet auto-bump, no hosted billing, no rent subsidy, no multi-sig custody, no non-Soroban chains, no audit tooling. The engine is self-hosted by you; we do not run infrastructure on anyone's behalf. Those are deliberate non-goals for this grant — see [`docs/PRD.md`](docs/PRD.md) §3.

## Team

Apex — Fatih Maulana and Rakha, Stellar Ambassador Chapter Indonesia.

## License

MIT.
