# W3-D17-01 — live EmailChannel delivery check

2026-09-14. Rakha explicitly authorized one email to the previously reviewed
recipient and clarified that relevant, necessary e2e tests should be completed
without repeated permission requests. Existing Testnet and protected-subject
constraints still apply; no Stellar transaction was needed for this test.

The built EmailChannel from published head b32f22d sent the exact reviewed
message through its real Resend transport. A private, exclusive intent file was
written before calling the channel. The same fixed event/payload idempotency key
was checked at the fetch boundary; exactly one POST was made. No automatic retry.

- Subject: Evergreen W3 — uji EmailChannel.
- Accepted at: 2026-09-14T05:45:24.973Z (12:45:24 WIB).
- Email ID: 7c9ac428-8a6c-43e6-936e-5d774aa88462.
- Provider response: HTTP 200; EmailChannel returned accepted.
- Inbox receipt: separately confirmed by Rakha in this session: “Sudah masuk inbox”.

[Sanitized channel result](send-result.json) preserves the original channel
outcome. [Message](message.json) preserves the reviewed text with addresses
redacted. The raw provider response is retained in ignored local state; no
API key, authorization header or mailbox address is published here.

A subsequent read-only GET for this ID returned 401/restricted_api_key:
this key permits sending only. Its permissions were not expanded.
[Read-back result](delivery-status.json). The available mailbox-search connector
returned tool-not-found, so it could not supply independent inbox evidence.

This tests the actual generic EmailChannel delivery path with an explicitly
labelled diagnostic message. It does not fabricate a successful BumpRecord,
repeat the W1 setup test implementation, or prove automatic engine success/failure
alerts. D17-03/04/05 still requires the appropriate real outcome and failure-path
proofs. No Stellar signature, transaction, TTL mutation or scheduler change.

[Recipient confirmation](inbox-confirmation.json) is a human inbox check, not a mailbox screenshot. The original send result deliberately retains receivedInInbox=unverified because confirmation happened afterwards. This completes D17-01 channel delivery validation; it does not close the engine outcome/automation gates.
