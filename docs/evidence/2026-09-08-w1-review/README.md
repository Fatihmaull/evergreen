# W1 evidence snapshot and late recovery

Tasks: W1-D7-03, with historical evidence for W1-D4-04/04c/06/07. Captured **2026-09-08**, on Stellar **Testnet**. No transaction was submitted during this review.

## Working scan

The actual compiled CLI was run against guinea-pig A with human and JSON output. Both returned exit code 0. The human run started at 2026-09-08T13:26:21Z: observed ledger **4,570,079**, final live ledger **4,712,648**, remaining **142,569** ledgers. It is an instance-only scan, not complete storage discovery or an engine bump.

- [Scan image](scan-output.png), [local HTML presentation](scan-output.html).
- [Human stdout](scan-human.stdout.txt), [stderr](scan-human.stderr.txt), [JSON stdout](scan-json.stdout.txt), [stderr](scan-json.stderr.txt).
- [Commands, timestamps, exit codes and stdout hashes](scan-runs.json).

The image renders the saved stdout with execution metadata. It is not a screenshot of a terminal application. The raw files preserve the actual output; no values were filled in by hand. The runtime matches main `b0f0d0b`; the source checkout was `301cb36`. Human and JSON runs are separate observations and may observe different ledgers. Packages are still private until W4 publication, so the recorded command uses the compiled local CLI instead of claiming an npm release.

## Recovered transaction evidence

The W1 audit found historical hashes without complete attached evidence. While those transactions remained available, their full unedited `getTransaction` responses and live Stellar Expert pages were captured. **Transactions occurred on Sep 5; captures occurred on Sep 8.** These are late recoveries, not original same-day captures. They repair an evidence gap but do not erase the process failure; future transactions still require same-day capture.

The two experiment account histories returned **14 deployer-account transactions and 5 extender-account transactions**, all successful on Sep 5. The successful RPC envelopes were checked against their hashes. Decoded operation types, footprints and contract IDs identify A/B/C, seeding and calibration; labels are not inferred solely from transaction order.

- [Envelope, footprint, source-account and image-hash validation](validated-transactions.json).
- [Recovery manifest](recovery-manifest.json): capture times, original transaction times, hashes, RPC status and SHA-256 for each response.
- [Explorer capture metadata](explorer-captures.json): URL, time, exact hash and successful status verified in the page text.
- [Network response](recovery-network.json): Testnet passphrase verified before recovery.
- [Original deployer history](deployer-account-history.json), [original extender history](extender-account-history.json), [decoded bootstrap operations/footprints](bootstrap-decoded.json).

These are funding, deployment, seeding, permissionless/manual extends and deliberate initial calibration. None is an unattended engine proof. The shared-code extension during C preparation also affects A/B's shared code; it does not change B's instance/persistent decay target. B/C were only read during this review.

| Task | What the transaction did | Ledger | Tx hash | Full unedited response | Explorer screenshot |
|---|---|---:|---|---|---|
| W1-D4-06 | Fund experiment deployer account | 4,512,604 | `081a0ad0241bd519732128998d57f1cf39174f92a9de90d420de8116b9df4fba` | [RPC JSON](deployer-funding-transaction.json) | [Explorer](deployer-funding-explorer.png) |
| W1-D4-06 | Fund separate experiment extender account | 4,512,605 | `6f6a9589a69d2c7ca03b58cd8e6cf6be18c80d35c313b945972ba818fb9bc6c1` | [RPC JSON](extender-funding-transaction.json) | [Explorer](extender-funding-explorer.png) |
| W1-D4-04 | Upload guinea-pig Wasm | 4,512,608 | `c8c0c7a1721f7d490e09c6c189bc915956653517b3b0957a7405393dcb60ec90` | [RPC JSON](guinea-pig-wasm-upload-transaction.json) | [Explorer](guinea-pig-wasm-upload-explorer.png) |
| W1-D4-04 | Deploy A | 4,512,609 | `44956dbd7cdaab3c459a1f7f862a85bd41d63bc3d42270fcbe50520e318dbe98` | [RPC JSON](a-deploy-transaction.json) | [Explorer](a-deploy-explorer.png) |
| W1-D4-04 | Seed A | 4,512,610 | `b693500dbad1add1b0583b4f2aa308cc0e66fdc229a5158215510d5b056699c2` | [RPC JSON](a-seed-transaction.json) | [Explorer](a-seed-explorer.png) |
| W1-D4-06 | Permissionless extend: A instance | 4,512,648 | `484e5c33fe47d65ce8afef1d62c7963cb3c5367c446b3d5f14097688715af41e` | [RPC JSON](a-instance-extend-transaction.json) | [Explorer](a-instance-extend-explorer.png) |
| W1-D4-06 | Permissionless extend: shared Wasm | 4,512,652 | `54d59191c1e9adccc35c846f169d774419b714dfa4758af834f93215086e1c0b` | [RPC JSON](a-code-extend-transaction.json) | [Explorer](a-code-extend-explorer.png) |
| W1-D4-06 | Permissionless extend: A persistent | 4,512,658 | `b0bf79efa1421cfe9d6cfef763b572a05909fa7a38553c1b89c101a30a9375ae` | [RPC JSON](a-persistent-extend-transaction.json) | [Explorer](a-persistent-extend-explorer.png) |
| W1-D4-06 | Permissionless extend: A temporary | 4,512,659 | `e796eb55c16839c25a9e20b5899ea5df4bab68aceb99d1a82ca88d098792a2b3` | [RPC JSON](a-temporary-extend-transaction.json) | [Explorer](a-temporary-extend-explorer.png) |
| W1-D4-04c | Deploy B | 4,512,931 | `3c1eae9ca1725ba8ef1da01dd6e5ff6da4a5c86b433d9b287ea191f950d835ea` | [RPC JSON](b-deploy-transaction.json) | [Explorer](b-deploy-explorer.png) |
| W1-D4-04c | Seed B | 4,512,933 | `11e27604ef5422e57aac67f34564e4eef864b8fa486659b45d67920856d2c837` | [RPC JSON](b-seed-transaction.json) | [Explorer](b-seed-explorer.png) |
| W1-D4-04c | Calibrate B instance | 4,512,940 | `54117bd95783ef3d9f19d6caf9831064243fd85ddece3421bbc3a8606757fbb1` | [RPC JSON](b-instance-calibration-transaction.json) | [Explorer](b-instance-calibration-explorer.png) |
| W1-D4-04c | Calibrate B persistent | 4,512,941 | `a99a93bfc7af5bfd783a53f1f3fb04880c9fa74d3194f827490c3e7f8d7b7390` | [RPC JSON](b-persistent-calibration-transaction.json) | [Explorer](b-persistent-calibration-explorer.png) |
| W1-D4-04c | Calibrate shared Wasm with B | 4,512,942 | `9731d135f7a0a3c645eafb93efa971f946a6d786355d9c341ee3179364c38554` | [RPC JSON](b-code-calibration-transaction.json) | [Explorer](b-code-calibration-explorer.png) |
| W1-D4-07 | Deploy C | 4,513,210 | `ec4e577341fb9680a03681710136222ab0d95a3acdb3c5c811578fae32b5dbaa` | [RPC JSON](c-deploy-transaction.json) | [Explorer](c-deploy-explorer.png) |
| W1-D4-07 | Seed C | 4,513,212 | `11ec309c42e17925e1f5116309a16bd93dfeb995956bfd8187cf4d8ed8579785` | [RPC JSON](c-seed-transaction.json) | [Explorer](c-seed-explorer.png) |
| W1-D4-07 | Calibrate C instance | 4,513,226 | `8154bbb4cabcde32eb0bf1ea8b56fe79c2dd03696a882423b87d70ce59da5e6e` | [RPC JSON](c-instance-calibration-transaction.json) | [Explorer](c-instance-calibration-explorer.png) |
| W1-D4-07 | Calibrate C persistent | 4,513,228 | `f15a887c8d015185c1d29bccd76144904906e2e37f71c8222a2eea970ca97c7c` | [RPC JSON](c-persistent-calibration-transaction.json) | [Explorer](c-persistent-calibration-explorer.png) |
| W1-D4-07 | Extend shared Wasm past sprint while preparing C | 4,513,229 | `e3629c266e1351e1d1280c5946aaac4ec5643d5fc01e8a46c724c5c77829eef9` | [RPC JSON](shared-code-extension-transaction.json) | [Explorer](shared-code-extension-explorer.png) |

## Completeness boundary

This bundle contains all 19 records returned by the two documented experiment-account history requests, plus the fresh read-only CLI proof. It does not claim to enumerate every transaction on every developer account. Five earlier funding/boundary transaction bundles remain unchanged in EVIDENCE, bringing the indexed W1 transaction inventory to **24 unique transactions**. Simulation logs and synthetic persistence hashes are not counted as transactions.

Future natural-decay proofs remain due in W3. The optional policy signer and engine alerts remain future work. The recurring drift task continues until Sep 20.
