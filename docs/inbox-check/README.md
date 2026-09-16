# Inbox deliverability check — one command, before Sunday

**For Fatih, as part of the `#140` decision.** Everything is prepared; your part is
running one command and saying where it landed.

## Why this exists

`#140` records that **one balance-test email initially went to spam** and had to be
marked not-spam. Rakha flagged it himself and wrote *"acceptance is not
automatically inbox placement."*

It matters because of what the alert is for. `W3-D18-02b` says guinea-pig B's
crossing happens **on a Sunday with nobody watching, so the alert is the evidence
trail.** An alert that arrives in spam on Sunday night is functionally the silent
failure `W3-D17-05` exists to prevent: the send succeeded, the receipt says
accepted, and nobody sees it.

Provider acceptance and inbox placement are already treated as different things
everywhere else in this repo. This is the one case with a date attached.

## Run this

```bash
EVERGREEN_ALERT_TO='<the address that will be watched on Sunday>' \
EMAIL_API_KEY='<the Resend key>' \
pnpm email:notify \
  --record docs/inbox-check/deliverability-record.json \
  --config evergreen.config.dogfood.json \
  --send
```

**Use the address that will actually be watched on the day**, not a convenient one.
The whole question is whether *that* mailbox files *this kind of message* as spam.

## What a pass looks like

Two separate things, and only the second is the point:

1. **Command exits 0** and prints `"status": "accepted"` with an email id. That is
   provider acceptance — it says Resend took the message, nothing more.
2. **The message is in the inbox, not spam.** Open the mailbox and look.

**A pass is 1 and 2. A fail is 1 without 2** — and that failure is invisible from
the command's output, which is the entire reason for looking.

## If it lands in spam

That is a real finding rather than an annoyance, and it needs a decision before
Sunday, not a workaround on the day:

- marking it not-spam once trains that mailbox, and may be enough
- `EMAIL_FROM` defaults to `onboarding@resend.dev`, a shared Resend sender — a
  verified sender domain is the durable fix, and it is not a Sunday-afternoon job
- `#141`'s watcher observes GitHub independently, but its alerts use the same
  Resend EmailChannel and configured mailbox. It is not an independent delivery
  channel and cannot compensate for shared provider failure or spam filtering.
  Inbox placement and the accepted delivery risk remain part of the `#140` decision.

## What was already checked, so you are not re-doing it

The command and the record are verified in **preview** — it renders a `critical`
failure alert with the correct template and exits 0 without contacting any
provider. The only untested step is the one that needs a real key and a real
mailbox.

**The record names the disposable contract from `#160`, never a guinea pig.**
Deliberate: a fake *"failed to extend"* message naming B could be read later as an
attempt on B, and this file will outlive the check. It also carries its purpose in
the reason field — *"Deliverability check ... Not a real incident."* — so a reader
finding it in a mailbox in three weeks knows immediately what it is.

No Stellar transaction is attempted, and nothing about guinea-pig B, C or the
shared code entry is touched.
