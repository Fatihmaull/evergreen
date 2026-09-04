# Fixtures — recorded RPC responses

Unit tests never hit the network (CLAUDE.md hard rule 9). They run against **real observed shapes** recorded here, not invented ones.

**To be filled at `W1-D4-05`:** paste the unedited `getLedgerEntries` response for guinea-pig A, and mirror it into `docs/SOROBAN-PRIMER.md`.

Rules for anything added here:

- **Unedited.** Do not tidy, reformat, or trim a recorded response. The awkward parts are the point — `liveUntilLedgerSeq` is optional and absent for entry types that carry no TTL, and a hand-cleaned fixture hides exactly that.
- **Note when and against what it was recorded.** Testnet resets; a fixture recorded against a contract that no longer exists is still a valid shape, but its ledger numbers are historical.
- **No secrets.** These are public chain reads, but check before pasting.
