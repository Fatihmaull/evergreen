# D11-02/03 planning preflight — 2026-09-11

Unsigned preflight of A instance only, from D11 code at ccf7374. CLI exit 0, mode dry-run. Request: +1,000 ledgers, Rakha public payer, fee cap 25,000 stroops. Prepared fee 15,073 stroops and target 1,407,276 at ledger 4,619,313. One operation, one read-only instance key, zero writable keys and signatures.

No secret argument/environment lookup or send occurred. The fetch recorder allows only the official Testnet endpoint and getNetwork/getLedgerEntries/simulateTransaction. Raw response files are unedited. The account response contains public Testnet balance/sequence, not a private key.

The recorded XDR/hash is an expired unsigned preflight, **not a transaction receipt and never to be submitted**. Rebuild and simulate fresh during a later explicitly approved execution. [Concrete plan](../../W2-D11-02-LIVE-PROOF-PLAN.md) defines scope, fee cap, readiness and evidence gates.

[CLI JSON](cli-report.json), [stderr](cli-stderr.txt), [decoded verification](verification.json), and numbered raw RPC bodies preserve the observations. The in-app browser also demonstrated an actual screenshot of A's explorer page in the session; no transaction screenshot is claimed. Native terminal before/after capture and image-file saving remain execution readiness items.
