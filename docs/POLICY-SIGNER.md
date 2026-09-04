# Policy signer — setup guide

> 🚧 **Not written yet. Due `W3-D21-02`** (Week 3, Sep 17–23). See [`BACKLOG.md`](../BACKLOG.md).
>
> This stub exists because the README links here and the repo is public. It is a placeholder, not a document.

## What this will cover

How to run the Evergreen engine with a **capped policy signer** instead of a plain funded account — the hardened path, per [ADR-002](adr/ADR-002-policy-signer-provider.md).

## Why you would want it (the short version, so the stub is still useful)

Evergreen is non-custodial whichever signer you use, and it is worth being precise about why: **`extendTTL` is permissionless.** Anyone may extend any ledger entry's TTL provided they pay the resource fee, so Evergreen never needs authority over your contract — there is no permission to grant and none to revoke. See [`SOROBAN-PRIMER.md`](SOROBAN-PRIMER.md).

The policy signer is not what earns that property. It protects something narrower and still worth protecting:

When you self-host the engine, it signs with a key that sits on a server with lumens on it — **your** server, **your** lumens. If that key leaks, an attacker cannot touch your contract, but they can drain the account's balance. Scoping the signer to `extendTTL` only means a leaked key can do nothing but pay to extend TTLs. That is a real reduction in your blast radius, which is why this path exists.

## Until this is written

Use the plain funded account described in the [engine README](../packages/engine/README.md) and the [quickstart](../README.md#quickstart). Fund it with only what it needs to pay extend fees, and treat it as a hot, expendable key ([`CLAUDE.md`](../CLAUDE.md) hard rule 4).
