# W1-D6-04 — local persistence and runtime experiment

**Result:** the local PostgreSQL experiment passed all eight checks. A separate stopped-database check failed as expected, before any schema or work was created. This supports the Actions + PostgreSQL proposal in [ADR-003](../../adr/ADR-003-toolchain-hosting-persistence.md). **Hosted provider selection and testing remain pending, by request, until these results are reviewed.**

The database contained synthetic data only. The script has no RPC, signing or send path. Its synthetic success records and repeated-letter hashes are not evidence of a Stellar transaction. Production recovery and unattended-bump behavior remain Week 3 work.

## Database checks

| Check | Observed result |
|---|---|
| Two independent processes claim the same entry | Exactly one winner; process and database backend IDs recorded. |
| Claim two different entries | Both succeed independently. |
| Expire a claim before preparing a send | A new generation can take over; expired, stale-generation and wrong-owner updates fail. Expiry is injected using database time. |
| Expire a pending transaction marker | Another claim is refused; the original hash remains. |
| Reject a history insert | The completion update rolls back too; the claim remains pending. |
| Confirm the expected hash | Completion/history commit together; wrong-hash and duplicate completion are refused. Two payer/signer identities and exact stroop strings are retained. |
| End the client and read from a new process | Both history records survive unchanged. This is client/process persistence, not a server-crash durability test. |
| Use an ended database connection | New work rejects. |

[Unedited final stdout](local-result.json) was captured at **2026-09-08T05:01:02.633Z** against PostgreSQL **17.11**, using Node **24.13.0** and `pg` **8.23.0**. [Environment metadata](environment.json) records the container image digest and source base. [Source checksums](source-sha256.json) identify the tested implementation independently of later commits.

The disposable database ran under rootless Podman, bound only to loopback. The final query found **zero** remaining `evergreen_spike_%` schemas. Each run creates and removes its own random schema. The task container and its disposable volume were removed after capture.

### Database unavailable

The task container was explicitly stopped, then the same `--run` command was invoked against its unavailable loopback port. [Unedited command output](database-unavailable-output.txt) records `status: "failed"`, `databaseWrites: false`, `cleanup: "not-needed"`, failed check `connect`, and the package runner's exit-code-1 report. The database was restarted for the final successful run above. This checks a connection refusal before work; it does not emulate a lost acknowledgement during a real chain send.

### Reproduce

Follow [SETUP.md](../../SETUP.md#local-persistence-experiment--w1-d6-04) to start a disposable database. Preview with `pnpm persistence:spike`; opt into database writes with `pnpm persistence:spike --run`. `pnpm check` and `pnpm test:persistence` remain offline. Never pass a hosted password in a recorded command or publish the connection URL. A hosted run must separately validate TLS, database privileges, endpoint/pooling behavior and recovery.

## Workers read path

Wrangler **4.129.1**, compatibility date **2026-09-08**, ran SDK **17.0.1** through `wrangler dev --local`. The [exact portable probe source](workers-probe.mjs.txt) and [configuration](workers-wrangler.jsonc) produced this [unedited response](workers-response.json):

- SDK import and instance-key XDR succeeded.
- `getNetwork()` verified the Testnet passphrase before the entry read.
- `getLedgerEntries()` decoded A's instance with ledger **4,563,980** and final live ledger **4,712,648**.

These are derived SDK results, not raw JSON-RPC responses. **No signing, transaction submission, Cloudflare deployment, cron trigger or D1 operation was performed.** Workers local read compatibility is established for these methods; full engine compatibility remains unverified. The local dev server was stopped after capture.

To reproduce from the repository root after dependency installation:

```bash
probe_dir=$(mktemp -d /tmp/evergreen-workers-XXXXXX)
cp docs/evidence/2026-09-08-persistence-spike/workers-probe.mjs.txt "$probe_dir/worker.mjs"
cp docs/evidence/2026-09-08-persistence-spike/workers-wrangler.jsonc "$probe_dir/wrangler.jsonc"
ln -s "$PWD/node_modules" "$probe_dir/node_modules"
cd "$probe_dir"
WRANGLER_SEND_METRICS=false pnpm dlx wrangler@4.129.1 dev --local --ip 127.0.0.1 --port 8799 --config wrangler.jsonc
# In another terminal: curl --fail-with-body http://127.0.0.1:8799/
# Stop the dev server afterward. No deploy command or account is needed.
```

Wrangler was temporary tooling and was not added to the repository dependencies. The permanent addition is the PostgreSQL experiment and its pinned `pg` development dependency.

## Validation and remaining work

`pnpm check` passed conflict detection, typecheck (including 17 shared-types negative examples), lint, formatting and **47 offline tests**: 11 workspace, 11 TTL, 9 scheduler, 9 email and 7 persistence. The database integration above is explicit and separate from CI. The original `.env`, RPC fixture, shared-types source, email receipt evidence and stash were preserved.

Task #30 remains **In progress**. Next: review the local result, select Neon or Supabase, run the hosted database check, then finalize the ADR and prepare the PR. There is no provider-specific implementation or PR yet.
