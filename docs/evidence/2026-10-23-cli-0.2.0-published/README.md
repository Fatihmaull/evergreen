# PH2-E1-06 — public npm CLI 0.2.0 readback

Readback of the registry after Rakha published `@evergreen-stellar/cli@0.2.0`.
Candidate record: [`../2026-10-23-cli-0.2.0-candidate/README.md`](../2026-10-23-cli-0.2.0-candidate/README.md).
No GitHub Release is claimed for 0.2.0 (PM decision, #385).

## Registry

- `npm view @evergreen-stellar/cli dist-tags`: `latest` = `0.2.0`.
- Registry `time.0.2.0`: `2026-10-23T10:50:03.699Z` (17:50 WIB).
- Tag `cli-v0.2.0` resolves to commit `8886adb632845e0167d025e76f7f367bb9905f23`.
- `dist.integrity`:
  `sha512-QVDzAw58x5BWqAywrOar2ZZnPUnFtMpDs1nGHyruyeSbxGs0e4Y7xmzcoBx+WCF0dZNKdS+IV6zf353sXcIh9Q==`.
  `dist.shasum`: `6e8e0dbe789f3ed514fa1ce4d223af2abd155502`.
- Fresh `npm pack @evergreen-stellar/cli@0.2.0` tarball SHA-256:
  `e81f70148f36bba8c2f03b7602030c71ecfbfdab404080bb29500109483ce6e7`,
  identical to the candidate dry-run. Byte-for-byte readback, not a version string.

## Stranger install smoke (Node 24, empty directory)

- `npm i ./evergreen-stellar-cli-0.2.0.tgz` into an empty dir: exit 0.
- `evergreen --help`: prints the `scan` / `extend` usage, including `--network testnet|mainnet`.
- `evergreen extend --network mainnet`, run under `unshare -rn` (no network
  interface, so no network call is possible): **exit 2**, message
  `Refusing: extend is testnet-only until DoD-2 is met (PH2-E5-02)…`.
