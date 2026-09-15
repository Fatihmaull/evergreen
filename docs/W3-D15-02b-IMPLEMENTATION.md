# W3-D15-02b — temporary retention implementation

Local implementation on `feat/W3-D15-02b-temporary-policy`, based on main 5998862.
Publication and Fatih merge remain separate checkpoints.

## User configuration

Add `temporaryEntryPolicies` to the contract registration. Each policy contains
`entryKey` (the exact temporary ledger key already in `dataKeys`) and `autoExtend`
(boolean). Omitted/false disables retention; all repeated registrations of the same
contract must explicitly consent. Invalid ownership, durability, undeclared keys,
duplicate policies and non-booleans are rejected. Instance/persistent behavior and
manual CLI extension remain unchanged.

```json
{
  "dataKeys": ["<temporary-ledger-key-xdr>"],
  "temporaryEntryPolicies": [
    { "entryKey": "<same-temporary-ledger-key-xdr>", "autoExtend": true }
  ]
}
```

This is a schema example, not runnable configuration. A concrete Testnet example
is retained in the [evidence directory](evidence/2026-09-15-temporary-policy/config.json).
The repository's routine dogfood configuration remains untouched.

## Execution and notification

One pure consent resolver is reused in decision and execution selection. Refreshed
reads include the exact temporary key and recheck consent before preparing any
transaction. Key kind is decoded from XDR durability rather than labelling all
non-instance entries persistent. Existing fee caps, signature checks and exact-key
footprints remain mandatory.

Default-off due entries still alarm. Opted-in temporary findings are critical until
a verified successful extension. That urgency survives the bump-record alert path;
unconfirmed outcomes remain explicitly unconfirmed. There is no restore advice for
deleted temporary data and no new notification transport.

## Operational preparation

Work now starts from main 5998862 rather than the old merged branch. A new local
watcher config `.evergreen/temporary-policy/sep18-watch.json` covers Sep 18 00:00
through Sep 21 18:00 UTC with critical=540 (minimum480). Offline validation confirms
inactive before the window and critical after 541 minutes without a job. The old
360-minute historical configuration is unchanged. No timer was installed or activated;
operator acceptance/activation is still needed for that planned window.

## Live verification

A disposable contract with a unique Wasm custom section was uploaded/deployed/seeded
so no shared A/B/C code is used. Default-off produced no execution records and did
not read a signer. Opt-in selected and extended exactly one temporary key, confirmed
on Testnet: expiry 4,686,093 → 4,785,404, inclusion ledger 4,685,404.

The first live-path attempt stopped before simulation/send because refresh omitted
temporary keys. The end-to-end fixture reproduced it, the refresh was corrected,
and the next attempt succeeded. The failed attempt remains retained as evidence.
A single labelled critical email is generated from that retained pre-submit failure;
it is a controlled validation, not a current incident. Provider and inbox outcomes
are recorded in the evidence README.

Evidence includes raw RPC, envelopes, receipts, before/after, explorer screenshots
and checksums. No A proof, B/C write or shared-Wasm extension occurred.
