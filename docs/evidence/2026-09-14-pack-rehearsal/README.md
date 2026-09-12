# Pack rehearsal — conclusive configuration, 2026-09-14

`W2-D14-02b`, re-run after the packaging decision landed in #93. The row had
been `[~]` pending that decision — *"a rehearsal cannot pass while `core@0.0.0`
is unpublishable"* — and the decision made it runnable.

## Why the earlier run was a false pass

2026-09-10 installed **all three tarballs together**, so the CLI's
`@evergreen-stellar/core@0.0.0` resolved from a **sibling file on disk** rather
than the registry. A stranger has no such file. The guard produced the false
answer, which is the sharpest version of this failure.

## The configuration that makes it conclusive

| condition | this run |
|---|---|
| packages installed | **the CLI tarball alone** — no siblings |
| directory | fresh, outside the repo |
| cache | clean, dedicated `--cache` path |
| workspace above it | none — only the directory's own `package-lock.json` |
| packer | `pnpm pack`, matching `pnpm publish` at `W4-D27-02` |

## Result

```
npm install ./evergreen-stellar-cli-0.0.0.tgz   exit 0
evergreen scan <A>                              exit 0
evergreen scan <A> <B> <C>                      exit 0
evergreen scan <A> --json                       exit 0
```

**The decisive line is what is NOT in `node_modules`:**

```
node_modules/@evergreen-stellar/
└── cli          ← and nothing else
```

No `core`, no `shared-types`. They are **bundled into the CLI**, not resolved —
which is precisely the thing the Sep 10 run could not distinguish. If they were
still runtime dependencies, this directory is where a 404 would appear.

The shipped manifest carries exactly one runtime dependency, pinned, from the
public registry:

```json
"dependencies": { "@stellar/stellar-sdk": "17.0.1" }
```

and **no `workspace:*` literal appears anywhere in the tarball** — 0 matches
across every file. That was the `EUNSUPPORTEDPROTOCOL` defect measured on
Sep 10, and it is the reason `W4-D27-02` must publish with `pnpm`.

## Incidentally confirmed from a stranger install

The scan reports A's instance ending at ledger **6,026,591** — Rakha's live
extension from #105, read back by a binary installed on a machine that never
saw this repository.

And the slide-8 demo runs end to end:

```
⚠ shared: this code entry is shared with 2 other contracts — they fail together
```

That is `W2-D10-01c` working from the published artifact, not the dev tree.
