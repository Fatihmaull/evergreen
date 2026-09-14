# W3-D17-02 — notification channel stubs

**Status:** Rakha approved local implementation on 2026-09-14.
Owner: Rakha. Local implementation and relevant e2e verification are complete, internal review passed; Rakha authorized publication after review; the stub does not gain any live delivery capability.

**Goal:** provide honest, interface-compatible WebhookChannel and TelegramChannel
stubs so future transports can be added without changing the engine contract.

**Architecture:** reuse shared-types' existing NotificationChannel; add two small
engine classes and one typed unavailable-channel error. No dependency, framework,
provider integration, shared-type change, endpoint or secret configuration.

**Spec:** BACKLOG W3-D17-02 explicitly requires stubs, not working transports.
PRD P0 requires email and an extensible interface; actual webhook/Telegram sending
is follow-on scope. This task does not replace D17-04/05's September 18 alert gate.

## Baseline and branch

At refresh, #137 remains open at 4451394 without Fatih review. D17-01's live email
was accepted and separately confirmed in the inbox; its verified task is Done,
while the PR still awaits merge. D17-02 remains Pending/Rakha and has no open PR.

The shared interface already exists on main, so D17-02 does not need #137 to merge.
After approval, refresh main/ownership and create `feat/W3-D17-02-channel-stubs`
from main. Preserve the current local drafts/handoff and the D17-01 branch. Keep
the diff independent of #137; reconcile the small engine/index export addition
if Fatih merges that PR first. No automatic change to another open PR.

## Behavior to implement

Retain the existing interface:

```ts
interface NotificationChannel {
  readonly name: string;
  notify(record: BumpRecord): Promise<void>;
}
```

| Export | Behavior |
| --- | --- |
| WebhookChannel | name is webhook; notify rejects with ChannelNotImplementedError |
| TelegramChannel | name is telegram; notify rejects with ChannelNotImplementedError |
| ChannelNotImplementedError | code CHANNEL_NOT_IMPLEMENTED; channel webhook or telegram; message states that actual delivery is SOW 2 scope |

Constructors take no credentials, recipient, URL or client. notify accepts the
record for interface compatibility but does not inspect, mutate, serialize or log
it. The error contains only the fixed channel name and unavailable-feature message.

Recommended behavior is an explicit rejected promise. A successful no-op would
hide a missing alert; a partial network implementation would expand scope and
consume time needed for the live email/engine integration. There is no fallback
to EmailChannel, no fake accepted receipt and no simulated-delivery claim.

Do not add webhook/Telegram to the config parser, command help as usable options,
or scheduler configuration. Current configuration remains email-only. These are
programmatic extension points clearly documented as unavailable.

## Files and execution steps

1. Add `packages/engine/test/channel-stubs.test.ts` first. Use a minimal typed
   BumpRecord fixture defined in that file, without depending on #137's email
   test fixtures. Check each class through a NotificationChannel reference:
   name is correct; await notify rejects with the expected type/code/channel;
   original record is unchanged. A record wrapped in a throwing property-access
   Proxy proves the stub never reads its contents. Spy on global fetch and assert
   zero calls. Assert the error omits record contents.
2. Add `packages/engine/src/channel-stubs.ts` with the two small classes and shared
   error. Explicitly consume the unused record argument without reading fields,
   keeping the concrete method signature callable as notify(record). Export the
   three public classes from `packages/engine/src/index.ts`.
3. Add `packages/engine/test/channel-stubs-artifact.test.ts`. After pnpm build,
   a fresh Node subprocess imports the built engine/index module and invokes both
   stubs through their public exports. Require both rejections to report
   CHANNEL_NOT_IMPLEMENTED; a resolved promise is a failure. Replace fetch with
   a failure sentinel and guard credential environment-variable reads. No real
   bot, chat ID, webhook endpoint, email or Stellar operation is used.
4. Write `docs/W3-D17-02-IMPLEMENTATION.md` describing the API, exact unavailable
   behavior and acceptance evidence. Add a short channel-availability note to
   ARCHITECTURE after reconciling any #137 changes. Update BACKLOG/STATUS with the
   actual outcome. The definition of done for a stub is correct refusal, not
   successfully delivering through the unimplemented transport.
5. Run focused source/artifact tests and full pnpm check. Temporarily replacing
   each stub's rejection with a resolved promise must fail its behavior test;
   restore the source and re-run focused checks. Internal review then precedes
   the explicit publication checkpoint; Fatih handles review/merge.

```sh
pnpm build
pnpm exec vitest run packages/engine/test/channel-stubs.test.ts packages/engine/test/channel-stubs-artifact.test.ts
pnpm check
```

## Acceptance and next task

- Both stubs satisfy the unchanged shared interface and are usable from the built
  package's public import path.
- Calling either produces a clear unavailable error and no external side effect.
- No record details or credentials leak through errors or logs.
- Configuration does not advertise an unimplemented delivery channel.
- The full check and internal review pass, with documentation/tracking accurate.

These checks complete the relevant end-to-end path for this task. Sending a real
webhook or Telegram message would implement follow-on scope, so it is neither
necessary nor an honest acceptance test for the stub.

Keep this task small. Next, plan D17-05's engine failure/alert wiring together with
the D17-04 proof sequence, then execute each scoped change. Relevant real email
and Testnet validation is already authorized by Rakha's standing instruction;
do not ask again merely because the test is live. Preserve protected subjects,
bounded operational spend and evidence capture. A scheduler that never runs
requires a detection/backstop path outside that missing run.
