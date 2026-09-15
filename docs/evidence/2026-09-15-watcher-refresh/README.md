# Weekend watcher refresh and inbox test — 2026-09-15

Runtime moved from5998862 to main0f14d65 with warn420/critical540. Old runtime and
historic evidence are retained unchanged. Public config, installed service copy,
source/hash provenance and successful inactive service status are captured here.
The finite timer's date/window is unchanged. No secret environment file is included.

`policy-verification.json` checks the new warning/critical boundaries and rejection
of the old warn30 policy. `inbox-preview.json` is the no-send rendering of the #170
scenario; `inbox-receipt.json` is the single accepted provider delivery. The supplied
record is explicitly a deliverability test, not an actual failed transaction.
`inbox-confirmation.json` records Rakha confirming this check reached inbox; prior not-spam training was already reported. No repeat send is needed.
No Stellar transaction or repeat save proof was performed.
