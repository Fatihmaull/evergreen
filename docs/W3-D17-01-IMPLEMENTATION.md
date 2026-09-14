# W3-D17-01 — EmailChannel local implementation

Status: implementation and offline verification complete on
`feat/W3-D17-01-email-channel`, based on main cbd2a7e. Internal review complete: [one P2 record-owner mismatch fixed](W3-D17-01-REVIEW.md), no remaining blocking finding.
No commit, push, PR, Notion update or merge is claimed. D17-01 remains In progress;
actual email delivery/receipt and integration validation are still outstanding.

## What changed

The engine now implements the existing shared NotificationChannel interface with
`EmailChannel`. It reuses core templates and owns the single Resend transport.
No shared interface was changed and no dependency was added. The channel has no
signer, RPC or scheduler access; installing it does not activate engine alerts.

- Default mode previews without an API-key lookup or network request. Explicit
  send mode is required to contact the provider.
- `succeeded` renders success, `submitted` renders UNCONFIRMED, and `failed`
  renders the failure template. `simulated` records produce no email.
- `notify(record)` preserves the shared Promise<void> contract and propagates
  delivery errors. `deliver(notification, eventId)` provides a typed receipt for
  the command and future run-level alert adapters.
- Provider acceptance requires a valid email ID and remains distinct from inbox
  receipt. Timeout, transport failure, malformed JSON, absent/invalid IDs and 5xx
  results retain uncertainty. No automatic retry occurs.
- The 10-second bound covers both fetch and response-body consumption. Redirects
  are refused. A deterministic event identity and exact message/address payload
  produce a hashed idempotency key without putting private values in the key.
- Private sender/recipient configuration is validated. Diagnostics do not expose
  provider bodies, addresses or API keys. No fallback to the legacy EMAIL_TO.

The approved D17-03 integration correction changes failure wording: a failed live
record may follow transaction confirmation with unverified post-state, so it can
no longer claim unchanged TTL or safe retry. Inspect intent, transaction and TTL
before retrying. Failed simulation explicitly says no transaction was submitted.
The submitted warning no longer suggests the same account sequence can be consumed
twice. Temporary-entry and shared-consumer wording is retained. This correction
must be identified to Fatih with D17-03/#131 at the future publication checkpoint.

Notification config now rejects malformed values, unsupported explicit channels,
invalid environment-variable names and unknown behavior fields. Omitted channel
retains the existing email default; omitted notifications remains valid. Core's
existing `extensionKey` validator is exported for the record-input boundary.

## Command and migration

```sh
pnpm email:notify --help
pnpm email:notify --record .evergreen/bump-record.json --config evergreen.config.json
```

These build the workspace and preview. The command expects one public BumpRecord
from an execution result; it validates required fields, variants, canonical key,
public identities and observation structure. It rejects unknown fields and
contradictory success/simulation/hash combinations. It does not verify the supplied
record on chain: output declares `chainVerified: false`.

Recipient lookup uses config notifications.toEnvVar. EMAIL_FROM defaults to the
existing Resend readiness sender; EMAIL_API_KEY is read only on an explicit send.
The command does not auto-load .env and refuses --send in CI. An actual send needs
separate authorization for the concrete recipient/message. Generic channel code
can later be used by an explicitly configured scheduled integration.

The old `email:smoke` command is now an offline migration shim. Old --send fails;
the fixed W1 setup message and its duplicate provider implementation are retired.
Historical W1 delivery evidence remains intact. SETUP, ARCHITECTURE and environment
descriptions document the new behavior and its limits.

## Verification

Implementation baseline, before the subsequent review correction: full `pnpm check`: **785 tests = 706 Vitest + 79 Node**, exit 0, unchanged
gates. Coverage: 94.24% statements, 89.98% branches, 95.06% functions, 96.46% lines.
The backlog/Notion gate ran parse-only; no mirror update was made.

- Template/config regressions failed before the fixes, then all 66 targeted cases
  passed. The former dry-run-failure test had required the incorrect safe-retry
  statement; it now checks the actual evidence limit.
- Channel/command tests: 51 passed. They cover routing, opt-in, private config,
  record validation, uncertainty, timeout during body reading, nonzero errors,
  stable/different event keys and preserved BumpRecords on delivery failure.
- Built-command tests: 6 passed, using a complete offline fetch replacement and
  subprocesses with only test configuration. No network fallback is available.
- Retirement shim: 3 passed. Relevant provider protections from the former W1
  probe are exercised through the W3 channel/command path.
- Deliberately enabling send by default breaks the preview test; swallowing
  delivery errors breaks provider-failure tests. Both changes were restored
  byte-for-byte, and all 18 channel tests passed again afterwards.

[Full output](evidence/2026-09-14-email-channel/pnpm-check.txt),
[source hashes](evidence/2026-09-14-email-channel/verification.json), and
[mutation checks](evidence/2026-09-14-email-channel/mutations.json).

## Remaining gates

Internal review is complete; the reviewed tree passed 793 tests. Publication still requires an explicit publish request. No email, operational secret read,
Testnet RPC, transaction, scheduler change or external message occurred here.
Tests use synthetic records and provider fixtures; they do not establish delivery.

D17-02 stubs and D17-04/05 real outcome wiring, receipt evidence and failure-mode
alerts remain separate. A missed scheduler run needs a detection path outside
that missing run. These are not claims fulfilled by EmailChannel existing.

D16-01 code is already merged. Its controlled live validation can be coordinated
with D17-04's success-alert proof after the channel is ready and the concrete live
test is authorized. Manual execution does not satisfy the unattended D18-02a claim.
B/C and shared Wasm protections remain intact; the W2 A proof is not repeated.
