# W3-D18-03a — offline expiry compatibility assessment

The final B reads were taken on time, but the version1 capture classifier expected
expired entries to disappear. Stellar RPC instead returned their XDR with absolute
`liveUntilLedgerSeq: 0`. The [official method reference](https://developers.stellar.org/docs/data/apis/rpc/api-reference/methods/getLedgerEntries)
permits zero for an entry that is no longer live. This differs from **remaining
TTL zero**, which is still the final live ledger.

The original classifier/verifier and sealed results are deliberately unchanged.
Editing their `unverified` verdict into `expiry-observed` would destroy provenance.
The compatibility command produces a **separate assessment** from those records:

```sh
pnpm verify:expiry docs/evidence/2026-09-21-b-crossing-1200/attempts/120035
```

For a JSON file, use the direct Node command and check its exit status before using
the file. Store reports **outside** the original sealed directory:

```sh
node scripts/reassess-expiry-capture.mjs docs/evidence/2026-09-21-b-crossing-1200/attempts/120035 > assessment.json
```

Success means a separate report with `phase: expiry-observed` and exit0. The
`recordedVerdict` field still shows the original outcome. Failure exits2 with a
bounded reason. This is offline: no RPC request, signing, simulation, restoration,
funding, threshold change or original-bundle write takes place.

## Conditions for acceptance

1. Existing verifier validates checksums, inventory, raw RPC replay, decoded
   owner/key bindings, baseline, stdout/stderr and the **original** recorded verdict.
   Historical runtime fingerprints are allowed as in the dated gate; the replay
   must still match. No captured code is executed.
2. Both source and baseline are non-rehearsal. The embedded baseline is a verified
   live capture of the same subject, with advancing observation ledger.
3. A and shared-code controls remain live. Shared-code expiry equals its baseline.
4. Both B instance/persistent baseline end ledgers have passed. Thus the earliest
   possible current B assessment is ledger4,793,689, not either zero-TTL boundary.
5. Each expired subject entry is either absent, or returned with an **explicit
   numeric zero** and byte-identical XDR to the corresponding baseline entry.
   A missing TTL, string zero, arbitrary expired positive value, changed payload,
   still-live entry or extended entry is not accepted by this narrow compatibility
   path. Inspect separately rather than weakening the conditions to make it pass.
6. Only the supported original verdicts (`expiry-observed`, or the relevant
   unverified TTL/expiry failures with successful producer reads) are eligible.
   Other read/guard failures do not silently become success.

The assessment compares source fingerprints before and after replay and rechecks
the complete checksum inventory before emitting a report; detected source changes
fail instead of binding the report to newly changed bytes.

Reports bind source manifest, checksum inventory, result and embedded baseline by
SHA256, and record the assessor script hash and current runtime fingerprints. Those
hashes are reproducibility pointers, not signatures from the RPC provider. Two
observations do not establish that no intervening write ever occurred.

## Observed result and review boundary

The three [original final attempts](evidence/2026-09-21-b-crossing-1200/README.md)
remain byte-for-byte unchanged and continue to replay as `unverified` with exit2.
The [separate local assessments](evidence/2026-09-21-b-expiry-assessment/README.md)
all report `expiry-observed` under the documented non-live representation.

This fixes the offline acceptance path without rebuilding or replacing the frozen
capture runtime. It does not change CLI scan rendering or version1 capture output,
and does not authorize a restore or another live proof. Reviewer acceptance and
publication of this compatibility change remain separate from local test success.
C's required later capture and broader W3 closeout remain outstanding.
