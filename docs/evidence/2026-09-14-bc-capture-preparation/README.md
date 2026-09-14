# W3-D18-03 — September 14 read-only capture preparation

These are preparation observations, **not Sep 20/25 crossing evidence**.
All three directories were copied byte-for-byte from the local captures. Each
contains its original manifest, checksums and full RPC transcript. No transaction
was submitted, so transaction hash/explorer evidence is not applicable.

| Capture | UTC observation | Result |
| --- | --- | --- |
| [B-before](B-before/result.json) | 2026-09-14 15:48:12.949 | Before action, 118,227 ledgers remaining |
| [C-before](C-before/result.json) | 2026-09-14 15:48:29.929 | Before action, 204,633 ledgers remaining |
| [B-rehearsal](B-rehearsal/result.json) | 2026-09-14 15:48:34.800 | Explicit raised-threshold rehearsal; cannot qualify |

Each capture made five read-only RPC calls. A, subject instance/persistent and
shared Wasm controls were returned; the declared temporary key was absent.
Source: `2ac20f4cda5dca2b34798287a2a9be412a1e108b`, with a fresh build.
Strict replay requires that recorded checkout. Current-code historical replay is
also verified, including under de-DE after the locale correction:

```sh
node --input-type=module -e "import {verifyCrossingCapture} from './scripts/verify-crossing-capture.mjs'; for (const name of ['B-before','C-before','B-rehearsal']) console.log(await verifyCrossingCapture('docs/evidence/2026-09-14-bc-capture-preparation/'+name,{checkRuntime:false}));"
```

All three report `qualifiesCrossing: false`. The historical mode retains checksum,
closed-inventory and semantic checks; it only permits runtime fingerprint changes.
See [operator procedure](../../W3-D18-03-CAPTURE.md) and
[review](../../W3-D18-03-REVIEW.md). Future actual event capture and Shared acceptance
remain outstanding. B/C/shared-Wasm protection was not changed.
