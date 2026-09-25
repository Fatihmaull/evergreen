# Verifying the published package — and the defect it exposed

**2026-09-25.** `@evergreen-stellar/cli@0.1.0` reached the registry on 2026-09-24.
npm versions are **immutable**, so the only useful time to find a broken publish
is before anything is recorded against it. This is that check, run against what
the world actually receives rather than against a local tarball.

**Outcome: the package is sound. The `evergreen-check` Action was not, and the
defect was found by running it for the first time.**

---

## 1 · Installed from the real registry, in a clean room

A directory that had never seen this repository, with **no workspace above it**
(checked by walking every parent for a `package.json` or `pnpm-workspace.yaml`)
and an **isolated npm cache**, so nothing could resolve from a local build.

```
npm install @evergreen-stellar/cli --cache <fresh dir>
added 42 packages in 3s
```

| | measured |
|---|---|
| version | **0.1.0**, `dist-tags.latest` |
| published | 2026-09-24 by `rakhargo` |
| declared dependencies | **exactly one** — `@stellar/stellar-sdk@17.0.1` |
| `dist.shasum` | `b4d56463b311eb772e48b4ae6d3e4beb97e48075` |
| unpacked size | 352,991 bytes |
| licence | MIT |

Raw registry metadata: [`npm-view.json`](npm-view.json).

## 2 · `core` is bundled, not fetched

This was the specific risk: a published CLI that reaches for private workspace
packages at runtime would 404 for every user.

- `node_modules/@evergreen-stellar/` contains **only `cli`**. Nothing else under
  the scope was resolved, so no `core` came from the registry.
- **Zero `workspace:` literals** anywhere in the installed package.
- Shipped files are **exactly** what `check:publish` pins — `LICENSE`,
  `README.md`, `package.json`, `dist/evergreen.mjs`, `dist/evergreen.mjs.map`.
- `@evergreen-stellar/core` and `@evergreen-stellar/shared-types` both return
  **E404 from the registry, by design.** They are bundled, not published.

Core's logic is present *inside* the 89,454-byte bundle — `sharing-undetermined`,
the 17,280 and 120,960 thresholds, and `Absence is not health` all appear in it.

**`REFUSED BY WRITE GUARD` does NOT appear**, and that is correct: the write guard
belongs to the engine's signing path and has no business inside a read-only
scanner. Its absence is a property worth keeping.

## 3 · `--threshold` is really there

The flag the release rebase existed for. Present in `evergreen --help`'s usage
line, documented in its own help paragraph, and behaving:

```
exit 0  scan <A>                                    (no scope asserted)
exit 0  scan <A> --no-data-keys                     (scope asserted, healthy)
exit 1  scan <A> --no-data-keys --threshold 2000000  (every entry at/below)
exit 0  scan <A> --no-data-keys --threshold 1        (nothing at/below)
exit 2  scan <A> --threshold 0                      (rejected: not a positive int)
exit 2  scan NOTACONTRACT                          (malformed id)
exit 3  scan <A> --require-declared-scope           (the Action's default)
```

Full matrix: [`exit-codes.txt`](exit-codes.txt). Every documented code — 0, 1, 2
and 3 — is reachable from the published binary.

**One cross-check worth recording.** The scan reports A ending at ledger
**6,370,261**, which is the post-state expiry recorded for
[the unattended save](../2026-09-14-scheduled-a-save/README.md) on 2026-09-14.
The published package, read from the registry, independently agrees with a
committed engine record from eleven days earlier.

## 4 · The demo's install line, run for real

The literal line in the demo script and the README, three contracts together:

```
npx --yes @evergreen-stellar/cli@0.1.0 scan <A> <B> <C>

Scanned 3 contract(s): CANZNTAW…, CCYGO7KQ…, CCLW55OI…
  ⚠ shared:   this code entry is shared with 2 other contracts — they fail together
Worst entry health: CRITICAL (warn below 120,960 · act below 17,280 ledgers) · 1 shared entry
Scan is PARTIAL — 3 issue(s). Absence is not health.
exit 1
```

Full output: [`npx-three-contract-scan.txt`](npx-three-contract-scan.txt). The
shared-entry line and `PARTIAL — 3 issue(s)` are what the script says will appear.
`CRITICAL` is guinea-pig B, which is archived — not a new problem.

---

## 5 · The defect: `evergreen-check` failed in any repository using pnpm

Dispatching the demo workflow was unsafe before the publish, because both jobs
would have failed on `npx` E404 and a red job failing for the wrong reason reads
as a working demonstration. With `0.1.0` live that hazard was gone, so it ran —
**for the first time ever.**

**Run [36095134361](https://github.com/Fatihmaull/evergreen/actions/runs/36095134361):
both jobs failed, including the one named `green · must pass`, and the scan step
never ran at all.**

```
##[error]Unable to locate executable file: pnpm
```

`actions/setup-node@v5` defaults `package-manager-cache` to **true**. It then
detects the **caller's** lockfile and shells out to that package manager. Any
repository with a `pnpm-lock.yaml` and no pnpm on the runner — the default for
every pnpm user — died before the action ran a line of its own.

**This was not a demo-workflow problem.** It was a defect in the published
composite action, on the surface SOW §6.1 item 10 is assessed by, and it would
have hit a large share of the audience on first use. The action installs with
`npx --yes` and reads no lockfile, so it has nothing to cache;
`package-manager-cache: false` is not a workaround, the feature simply does not
apply.

A regression test now reads `action.yml` directly and was commissioned by
mutation — flipping the value back to `true` fails the suite. No existing test
could have caught it: the harness executes the `run:` body and never sees `uses:`
steps.

## 6 · The genuine green-and-red pair

**Run [36095411235](https://github.com/Fatihmaull/evergreen/actions/runs/36095411235)**,
with the fix, same contract, only the threshold differing:

| job | conclusion | why |
|---|---|---|
| [`green · must pass`](https://github.com/Fatihmaull/evergreen/actions/runs/36095411235/job/107946545887) | ✅ **success** | A is above the 17,280-ledger default |
| [`red · must fail`](https://github.com/Fatihmaull/evergreen/actions/runs/36095411235/job/107946545676) | ❌ **failure** | **exit code 1** — every entry at or below a configured 2,000,000 |

**The red job's exit code is the thing to check, and it is 1.** Exit 1 is
`EXIT_BELOW_THRESHOLD` — the check working. Had it been 2 (error) or a setup
failure, the red would have been decoration.

This is honest rather than staged: both jobs scan guinea-pig A and **only the
threshold differs.** The claim demonstrated is *"the job fails when an entry is at
or below the threshold you configured"*, and a threshold above A's remaining TTL
is exactly that claim. **It is not a claim that A is decaying** — A runs to
December.

> This pair was produced from branch `feat/W4-D27-03-publish-unblocks`, because
> the fix had to exist before the green job could pass. Re-dispatching on `main`
> after merge costs one command and nothing else; the run above is real either
> way.
