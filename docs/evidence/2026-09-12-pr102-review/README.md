# W2-D14-03 — PR #102 review verification

Reviewed exact head `06041e5c1f3057831a4157b0c058b5fa708e5988`, base `c3ba97b`. No branch code edits, transaction, secret access or live Notion write by the proposed sync script.

- `pnpm install --offline --frozen-lockfile` initially lacked a cached Vitest tarball; normal frozen-lockfile install completed from npm, without changing the lockfile.
- Full `pnpm check` exit 0: **452 Vitest + 44 Node = 496 tests**. [Original output](pnpm-check.log). Coverage 94.16% statements / 88.94% branches / 93.89% functions / 95.84% lines.
- Packed only `@evergreen-stellar/cli` via pnpm and installed its tarball into `/tmp/evergreen-pr102-stranger`, outside the repo, with a fresh npm cache and no workspace sibling packages.
- Installed CLI help: exit 0. Installed single-A [fixture scan](installed-scan.json): exit 0. Installed A+B [fixture scan](installed-multi.json): exit 3 because the A fixture contains no B entry; both requested contracts remain in the output roster. All RPC calls were served by a fetch stub from the committed A fixture, not live RPC.
- Installed `extend A --ledgers 1000 --dry-run --submit`: exit 2 with the [expected mutual-exclusion error](contradictory-flags.txt), before any RPC or signing.

These checks support closure of the pack/install rehearsal itself. npm registry publication and the Sep 28 public-install rehearsal remain separate W4 work. They do not depend on making core/shared-types public.

Parser reproductions are in the [review report](../../W2-D14-03-PR102-REVIEW.md). The proposed mirror was not run with a real token: its transport/apply behavior still needs a separately configured integration check. The eight new sync tests test pure parse/diff behavior, not authenticated Notion writes.
