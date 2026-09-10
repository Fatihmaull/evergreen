# Fixtures — recorded RPC responses

Unit tests never hit the network (CLAUDE.md hard rule 9). They run against **real observed shapes** recorded here, not invented ones.

## What is here

| Fixture | Recorded | Anchors |
|---|---|---|
| `getLedgerEntries-guinea-pig-a.json` | 2026-09-05 (`W1-D4-05`) | TTL parsing and the inclusive boundary. Mirrored in `docs/SOROBAN-PRIMER.md`. |
| `extendTTL-fees-guinea-pig-a.json` | 2026-09-09 (`W1-D7-08`) | The rent model at `W2-D9-02` and the optimizer's pricing at `W2-D12-01`. Three real extends with `rentFeeCharged` isolated from `resultMetaXdr`. |

Rules for anything added here:

- **Unedited.** Do not tidy, reformat, or trim a recorded response. The awkward parts are the point — `liveUntilLedgerSeq` is optional and absent for entry types that carry no TTL, and a hand-cleaned fixture hides exactly that.
- **Note when and against what it was recorded.** Testnet resets; a fixture recorded against a contract that no longer exists is still a valid shape, but its ledger numbers are historical.
- **No secrets.** These are public chain reads, but check before pasting.
