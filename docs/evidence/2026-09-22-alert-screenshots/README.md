# Engine alert inbox screenshots — 2026-09-22

These are manual screenshots of the two original engine-alert messages received
in Rakha's Gmail inbox on 2026-09-14 at 15:34 WIB. The messages belong to the
accepted scheduled A-save proof in
[`../2026-09-14-scheduled-a-save/`](../2026-09-14-scheduled-a-save/README.md):

- [`success-alert-inbox.png`](success-alert-inbox.png) — the confirmed A-instance
  extension, Resend email ID `07992c67-18c1-4dfe-8515-0dce865e8b21`.
- [`shared-code-refusal-alert-inbox.png`](shared-code-refusal-alert-inbox.png) —
  the critical shared-`ContractCode` write-guard refusal, Resend email ID
  `3429c29c-8c8e-4638-b2f7-cbd99df5277c`.

The visible subjects and bodies were inspected against the retained intent files.
The success screenshot carries the same contract, entry key, transaction hash and
expiry change. The critical screenshot carries the same run, contract, shared-code
entry key, remaining TTL and refusal reason. Both show the Gmail `Inbox` label and
the original sender. No other messages, credentials or unrelated mailbox content
are visible.

## Provenance and limits

The screenshots were captured on 2026-09-22, eight days after delivery. They prove
that the original messages are present and render in the recipient mailbox; they
are not screenshots taken at the instant of delivery. No message was resent and no
Stellar read or transaction was performed for this capture.

The historical
[`inbox-confirmation.json`](../2026-09-14-scheduled-a-save/inbox-confirmation.json)
remains unchanged. It records Rakha's confirmation that these two email IDs
arrived; it does not claim that a screenshot existed. This dated folder supplies
the later screenshot evidence separately rather than rewriting that record.

Run `sha256sum -c SHA256SUMS` from this directory to verify the retained bytes.
