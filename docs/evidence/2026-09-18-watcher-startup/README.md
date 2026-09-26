# W3-D18-01 — actual watcher startup, Sep18

**Snapshot at09:08:28 WIB.** The systemd timer started the installed observer at
07:00 WIB without a new manual trigger. The journal shows26 starts through09:05,
spaced five minutes apart. Recorded results:25 healthy assessments and one observer
error. The three earlier inactive rows in watcher.log are pre-window manual checks.

At07:30 the watcher could not obtain a valid GitHub observation, persisted the
incident, and sent one critical alert accepted by the provider. Rakha supplied the
received message marked **Inbox**; confirmation is a separate artifact, not a
provider claim. At07:35 the watcher returned to healthy; at the snapshot the incident
was cleared and the latest service result was successful.

`observer-error` does not establish a failed/missed transaction or an archived
contract. Its absent lastStartedAt and zero overdue value are unknown-observation
fields, not proof that the scheduler was on time. systemd's label for exit2 is not
an independent diagnosis of malformed CLI arguments. No raw GitHub responses or
transport diagnostic were retained by this runtime, so the exact cause is unknown.

## Retained artifacts

- `systemd-journal.txt`: startup/failure/recovery timeline in host WIB.
- `watcher.log`: complete retained JSON output stream, copied without editing.
- `state.json`: final snapshot, no active incident, last assessment healthy.
- `start.json`, `execution.json`, hashed intent/receipt files: original incident
  records. Receipt retains receivedInInbox=unverified; it only proves acceptance.
- `inbox-confirmation.json`: recipient-provided message/Inbox confirmation.
- `verification.json`: correlation, counts/spacing, recovery and source-copy hashes.

All source snapshot files were copied byte-for-byte; no watch.env, API key or other
private credential file is included. Verify `SHA256SUMS` before consuming claims.
This is a bounded startup/incident observation, not the entire monitoring window.

No new email or transaction was triggered by inspection/publication. This is not a
B/C crossing capture. The unchanged main0f14d65 observer runtime and420/540 policy
remain the installed baseline documented in the earlier refresh evidence. Scheduled
monitoring continues; four manual B checkpoints remain separate future work.
