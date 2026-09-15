# W3 September18 readiness — early checks on September15

This folder records preparation, not future gate completion or crossing evidence.
No new transaction or email was sent. The B/C folders are complete sealed captures,
with original raw RPC and manifests; both before-action results are nonqualifying.

- `cadence-summary.json`, `scheduled-runs.json`, `jobs-*.json`: complete18-run sample
  of engine-cron actual job starts; median174.37/minimum not asserted/maximum368.58min.
- `timer-status.txt`, `service-status.txt`, `user-linger.txt`: armed finite calendar,
  inactive successful early invocation, and logout-survival setting.
- `evergreen-readiness-watch.*`: installed units, with explicit Sep18–21 date ranges.
- `provenance.json`, `RUNTIME-SHA256SUMS`: pinned main5998862 runtime, independently
  installed/build; checksum file paths are relative to the private operational runtime.
- `watch.json`: bounded operational policy, no secret. Private watch.env is excluded.
- `inactive-preview.json`, `current-preview.json`, `sandbox-preview-log.txt`: no-send
  preview and repeated-call deduplication under service sandbox. Exit1 means alarm,
  not service failure; SuccessExitStatus=1 handles it.

See [operator checklist and acceptance boundaries](../../W3-SEP18-READINESS.md).
