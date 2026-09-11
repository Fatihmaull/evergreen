# W2-D11-02/03 — controlled live A-instance proof

Executed 2026-09-12 **02:41:42 Asia/Jakarta**, corresponding to **2026-09-11 19:41:42 UTC**. The folder follows the operator's local date; raw RPC times remain unchanged.

**One successful Testnet transaction:** [e18e0822d7131b6dc4ffb0953d880baf91135bc0e7a1e3ee40b4ea5071a4115a](https://stellar.expert/explorer/testnet/tx/e18e0822d7131b6dc4ffb0953d880baf91135bc0e7a1e3ee40b4ea5071a4115a).

| Property | Observed |
|---|---|
| Contract | A: CANZNTAW7DYMCZ6EAY5BP672H4AL2O2HVRBP4O4HRUEZRATHQRRLXL6L |
| Selected storage | Instance only; one read-only footprint key, zero writable keys |
| Payer | GCEUQTTH53VMOY6JNXS6ZWGHUCBP64JOWZZIIJSC6LQLBMQGGVIVO6UB |
| Requested additional lifetime | 1,000 ledgers |
| Plan read ledger / remaining | 4,626,421 / 1,399,168 |
| Resolved extendTo target | 1,400,168 |
| Inclusion ledger | 4,626,423 |
| Expiry before / after | 6,025,589 → 6,026,591 |
| Absolute expiry increase | 1,002 ledgers: requested 1,000 + 2 ledgers between plan read and inclusion |
| Approved fee ceiling | 25,000 stroops = 0.0025 XLM |
| Prepared envelope maximum | 15,073 stroops = 0.0015073 XLM |
| Actual fee charged | **5,064 stroops = 0.0005064 XLM**, decoded from raw resultXdr |
| Send attempts | **1**; initial NOT_FOUND polls queried the same hash, no replacement |
| Protected controls | B/C instance + persistent (4 entries), shared Wasm (1 entry): expiry unchanged |

## Durable artifacts

- [Actual transaction explorer screenshot](explorer.jpg): hash, success, inclusion ledger, operation and fee.
- [Actual before scan screenshot](before.jpg), [actual after scan screenshot](after.jpg).
- [Full unedited RPC](live/), including `09-sendTransaction-request.json`, `09-sendTransaction-response.json`, and successful `14-getTransaction-response.json` with envelope/result/meta XDR.
- [CLI result](live-result.json), [pre-sign preview on stderr](live-stderr.txt), [attempt marker written before send](send-attempt.json).
- [Fresh unsigned simulation](simulation.json), [decoded inspection](simulation-verification.json).
- [Before scan](before/), [after scan](after/), [protected controls before](controls-before/), [after](controls-after/).
- [Execution baseline and gate](pre-send.json), [verification](verification.json), [negative verifier checks](verifier-negative-checks.json).

Screenshots are original CUA captures. Scan images show a real CLI process in a **read-only ttyd PTY**, not reconstructed text. ttyd 1.7.7 was downloaded from the official tsl0922/ttyd GitHub release, checked against its SHA256SUMS, and bound only to 127.0.0.1 with origin checking and one client. Its child runs a fixed scan with a clean environment, no signer secret, no interactive shell. CUA returned JPEG bytes; extensions were corrected to `.jpg` without image manipulation. Probe screenshots and raw probe reads are retained as capture-readiness evidence.

The CLI stdout was streamed directly into the terminal and an output file. Both scans exit 0 for the healthy **observed scope** while reporting undeclared data coverage and undetermined sharing. This does not prove full contract storage coverage. Only instance expiry is the claimed extension result. A separate five-key read verifies protected entry expiries remained unchanged over this proof window; it does not predict their future state.

## Verification and safety

Runtime source matches merged main `c3ba97b` (#101), including #100's guard; execution branch baseline `3a0b79f`. `pnpm check` passed 470 tests with coverage before sending. The evidence recorder separately verifies Testnet, payer, instance footprint, +1,000 target, fee cap and signed envelope before its one permitted send. Exclusive creation of `send-attempt.json` prevents a second attempt even across process restarts. The actual secret was supplied through the existing private environment and never written here. No B/C extension, shared-code extension, contract invocation, funding or restore was performed.

Replay verification **offline**, without credentials:

```bash
node docs/evidence/2026-09-12-manual-extend-proof/verify-proof.mjs
```

This binds the sent and confirmed envelope hashes, operation/footprint, exact target, inclusion and post-read ledgers, actual fee, raw before/after entries, protected control requests/responses and saved images. Corrupting post-expiry, changing one control expiry, or removing the explorer screenshot each fails the verifier in a separate temporary copy. No raw original was changed.

The preliminary valid-time envelope gate test used a record timestamp taken before envelope preparation and failed the time-window assertion; the valid historical test was corrected to use a point inside its encoded validity window. The first full check found missing explicit Node imports in the evidence helpers; fixed before send, then the full check passed. These did not cause a transaction attempt.

**Never rerun the live command or replay the saved envelope.** This is completed historical evidence, not a reusable instruction to send. Further transactions require their own scope. The post-state and matching confirmed envelope support this proof, but a separate concurrent extension cannot be excluded solely by sampled TTL reads.

Final evidence-tree `pnpm check` also passed 470 tests with coverage: 93.88% statements, 88.69% branches, 93.75% functions, 95.67% lines. The private seed was checked absent from every evidence file without printing it.

Result is ready for Rakha's internal review. Evidence publication as a PR is a separate checkpoint; Fatih handles review/merge.
