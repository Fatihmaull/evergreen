# Pack-and-install rehearsal, re-run at HEAD — 2026-09-16

**`W2-D14-02b` last passed on 2026-09-12, roughly thirty merges ago.** It is the check
that has caught two real packaging defects (`E404` on Sep 9, `EUNSUPPORTEDPROTOCOL` on
Sep 10), and both times every local gate was green and `--dry-run` would have missed
them, because a dry run packs without resolving.

`W4-D27-02` publishes on Sep 24–25 and belongs to Rakha. A regression in the shipped
artifact between Sep 12 and then would surface **on publish day, in someone else's
hands**. So it was re-run rather than assumed.

**It passes.** Nothing below is a change request.

## Procedure — the one that failed for the wrong reason on Sep 10

The Sep 10 run passed while testing the wrong thing: all three tarballs were installed
together, so the CLI's `core@0.0.0` resolved from a **sibling file on disk** rather than
from the registry. A stranger has no such file. The corrected procedure is used here:

| Requirement | How it was met |
|---|---|
| CLI tarball **alone** | `pnpm pack` in `packages/cli` only |
| Fresh directory outside the repo | a new scratchpad dir, `node_modules` created by this run |
| Dedicated cache | `npm install --cache <fresh dir>` |
| **No workspace above it** | every ancestor directory scanned for `package.json`, `pnpm-workspace.yaml`, `node_modules` — **none found**, checked rather than assumed |

## Result

| Check | Result |
|---|---|
| `pnpm pack` | exit 0 — 33 files, [listed](tarball-contents.txt) |
| `workspace:` literal anywhere in the tarball | **0 hits across 447,438 bytes** |
| `npm install <tarball>` | exit 0, 42 packages |
| 🔴 `node_modules/@evergreen-stellar/` contains | **only `cli`** — no `core`, no `shared-types` |
| Any installed manifest carrying `workspace:` | 0 |
| `evergreen scan <A>` from that directory | exit 0, [output](scan-from-installed-tarball.txt) |
| `evergreen scan <A> <B> <C>` | exit 0, resolves `shared with 2 other contracts` ([output](scan-blast-radius.txt)) |

`core` and `shared-types` are still `private: true`; the CLI still declares
`publishConfig.access: public` and exactly **one** runtime dependency
(`@stellar/stellar-sdk@17.0.1`). The [shipped manifest](shipped-package.json) shows
pnpm rewriting `workspace:*` to `0.0.0`, as it must.

### The grep was commissioned before its zero was believed

A `grep -c "workspace:"` returning **0** and a grep that matched nothing because it
scanned nothing are the same output. This exact failure happened in the `W4-D27-01` dry
run, where a secrets scan reported "no secrets found" over **zero files**.

So the instrument was proved: the same grep against `packages/cli/package.json` returns
**2**, and the tarball scan reports the byte count it read. A zero from an instrument
with no input is not a result.

## Two things this re-run proves that the Sep 12 one could not

### 1. The shipped bundle is the current build, not a stale one

The installed CLI prints:

```
Worst entry health: HEALTHY (warn below 120,960 · act below 17,280 ledgers)
```

Two tiers. Before #154 — merged **after** the Sep 12 rehearsal — `scan` graded against
the action threshold alone and printed one number. **A stale bundle would have printed
the single-threshold form**, so this line is a build-freshness marker inside the
artifact a stranger receives, not just in the repo.

### 2. 🔴 The locale pin from #164 holds in the bundle, not only in the source

#164 pinned formatting to `en-US` and added `pnpm check:locale` to keep it pinned. That
gate reads **source**. What ships is an esbuild bundle, and the claim in the D1 capture
README — *"that is now true on every machine"* — is about the shipped artifact.

Run five times from the installed tarball under different locales:

| Locale | Output | File |
|---|---|---|
| `en-US` | `1,668,699` | [capture](locale-en-US.txt) |
| `de-DE` | `1,668,699` | [capture](locale-de-DE.txt) |
| `fr-FR` | `1,668,698` | [capture](locale-fr-FR.txt) |
| `ja-JP` | `1,668,698` | [capture](locale-ja-JP.txt) |
| `ar-EG` | `1,668,697` | [capture](locale-ar-EG.txt) |

**The values differ and the formatting does not.** Each run is a separate live read and
testnet closes a ledger every ~5 seconds, so the *number* moving is the chain, not the
tool — the same effect documented across the D1 captures.

Comparing the values directly would have reported a failure that is not there. The
comparison that answers the question replaces every digit with `0` and compares what is
left:

```
  remaining:  0,000,000 ledgers — live      ← identical in all five
```

Comma separator, `U+002C`, ASCII digits, in every locale. What an **unpinned**
`toLocaleString` would have produced from the same value:

| Locale | Unpinned | Why it breaks a reviewer |
|---|---|---|
| `de-DE` | `1.668.699` | `.` reads as a decimal point |
| `fr-FR` | `1 668 699` | separator is **U+202F**, a narrow no-break space — looks like a space, fails a byte comparison invisibly |
| `ar-EG` | `١٬٦٦٨٬٦٩٩` | **the digits themselves change** — not the separator, the numerals |

`ar-EG` is the sharpest case and the one the source-level gate cannot demonstrate: a
reviewer re-running our documented commands on an Arabic-locale machine would have seen
output sharing **no characters** with the committed evidence, and been right to call it a
failure to reproduce.

## What this still does not prove

- **Authentication, 2FA and org membership.** `npm whoami` returns `E401` here. Whether
  the publishing account may publish into this scope is unverified and remains part of
  `W4-D27-02`. `W4-D27-00` (enable 2FA) is an account security setting and is Fatih's to
  perform — it is not something this session can or should do.
- **`npx @evergreen-stellar/cli`.** Nothing is published, so the install line in the
  README still cannot be exercised end to end. `packages/cli/README.md` correctly says
  publication has not happened rather than printing a line that would 404.
- **The version.** The tarball is `0.0.0`; `W4-D27-02` sets the real version at publish
  time and nothing here asserts what it should be.

## Scope

Read-only against Testnet. No transaction, no publish, no credential. Guinea-pigs B and
C were **scanned** in the blast-radius check and not touched — `scan` never signs or
sends, and their TTLs in that capture match natural decay.
