# Paket A operator runbook

Local implementation, 2026-09-14. Review and publication are separate.

## Execution and alert journal

Build with `pnpm build`. Run `node scripts/engine-alert-run.mjs --help` for the
explicit arguments. A run ID and private output directory are required. Default
is simulation plus notification preview; `--send-alerts` activates only email.
Live execution additionally requires `--submit --attempt-file /absolute/path` and
config `mode: live`. Keep `EMAIL_API_KEY`, `EMAIL_FROM`, `EVERGREEN_ALERT_TO` and
the config's signer variable in a private environment file. No command auto-loads
`.env`. Verify the secret's public identity matches the config payer first.

Each run stores start, original execution result, notification intents and delivery
receipts separately. Existing run directories and submission journals refuse reuse.
An accepted email ID means provider acceptance; record inbox confirmation separately.
If a receipt is missing or unknown, reconcile it before any resend. A mail failure
must never trigger another transaction. A storage/preflight error returns exit 2;
read both process output and retained files. Exit 1 can mean A succeeded while the
shared-code guard still raises a liveness alarm.

## Independent scheduler watcher

`node scripts/scheduler-watch.mjs --config /absolute/watch.json [--send-alerts]`
reads actual GitHub job starts, never dispatches work. Config fields:
`watchId`, `stateRoot`, `repository`, `workflow`, `branch: "main"`, `jobName`,
`policy: {startAt, endAt, warnMinutes:30, criticalMinutes:360, maxRunMinutes:10}`.
Times are epoch milliseconds; the window is finite, at most seven days.
Use `engine-cron.yml` and job `decide`. A queued run is not execution evidence.
API errors, failed jobs and stalls are separate findings, never healthy silence.

Use the templates in `ops/` with absolute paths and an email-only environment.
Keep the state directory across checks/restarts. Preview has separate delivery
state. Sent incident IDs deduplicate across restarts; a new actual job can resolve
the incident. An existing lock indicates overlap or interrupted work: inspect it,
do not automatically remove it or create another watch ID to bypass uncertainty.
Install an explicit stop timer with the watcher. The policy itself stops network
and email outside its window; the stop timer also releases the polling service.
The selected Linux machine must remain awake and connected. This proves a local
observer, not a hosted SLA or achieved GitHub cadence.

## Controlled failure rehearsal

`node scripts/rehearse-engine-alerts.mjs SCENARIO PRIVATE_ROOT RUN_ID [--send-alerts]`
supports `rpc-timeout`, `insufficient-balance`, and `missed-run`. It exercises the
real runner/watcher using explicitly synthetic RPC/history and real EmailChannel
when opted in. Stellar writes and signer access are denied. Labels identify E2E
fault injection. Timeout retains the existing three read attempts. The balance
case injects a simulation rejection, not a real on-chain insufficient-balance tx.
A second missed-run observation must deduplicate. Preserve rehearsal JSON and
per-message journal; do not reuse IDs for a fresh uncertain send.

## Scheduled A proof

The harness is a bounded local OS timer with persistent pre-send intent; it is not
a migration of the production GitHub cron. Shared acceptance remains Fatih's gate.
Build and commit the tested code, then snapshot it using
`node scripts/build-proof-runtime.mjs /tmp/evergreen-paket-a-runtime-UNIQUE`.
Use a private config copied from `evergreen.config.save-proof.json`, `mode: live`,
A only, target above the raised action threshold, expected dev payer and the
existing 2,000,000-stroop cap. Verify fresh Testnet TTL, ceiling, balance, unsigned
simulation and screenshot export before arming. B/C/shared Wasm remain protected.

Create manifest version 1 from the runtime manifest plus `runId` beginning
`paket-a-`, absolute `configPath`, SHA-256 `configSha256`, absolute `attemptFile`
and `outputRoot` (create this parent first), `notBefore`/`notAfter` epoch ms with
at most a one-hour window. Keep that same campaign and attempt path after restart.
Preview with the pinned `run-save-proof.mjs --manifest PATH`. Only the scheduled
service adds `--submit --send-alerts`; it requires systemd invocation metadata.
Record the actual timer/unit/journal independently; an environment variable alone
is not schedule provenance. Use `RemainAfterExit=yes` so metadata survives success.
Bound the service to 300 seconds and preserve alarm exit 1 (`SuccessExitStatus=1`).

Retain the attempt even after success. Never erase/recreate it for another proof.
Capture full RPC responses, signed envelope, hash, verified TTL increase, real
explorer screenshot, runtime/config hashes, trigger metadata and alert receipts.
Index any transaction in EVIDENCE immediately, then checksum and verify the bundle.
Describe A honestly: its threshold was raised above observed TTL; it did not decay
naturally to this trigger. No production signer belongs in the decide-only cron.
