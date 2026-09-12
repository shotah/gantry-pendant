# Agent typing — make it real

Telegram already shows when Kit is working. Pendant says **live**
because the phone socket is up. Those are not the same thing.

This is the walk to copy Telegram's **chat action**, not a hatch that
guesses after you hit send. Streaming CoT into a bubble is a later
layer — do not mix it into this walk.

Pitch: [README.md](../README.md). Room: [architecture.md](architecture.md).
Backlog: [todo.md](todo.md). Harness mouth:
`repos/ai-gantry/internal/channel/`.

A line is done when the **walk** works without a second brain. Scope is
which checkout you touch.

---

## Fit gates

Same as [design.md](design.md#principles), plus:

1. **The crane emits it.** The phone never infers "he's thinking"
   from an inbound ack. If Handle has not started, there is no typing.
2. **Ephemeral.** Do not queue. Do not mint an `id`. A reconnect must
   not replay "still typing" from last hour.
3. **Targeted like `reply`.** `user_id` required. Ada's turn does not
   paint dots on Bob.
4. **Not `ack`.** `ack` is delivery. Do not overload it.
5. **Not CoT.** Wire kind is `typing`. In ai-gantry, `thinking` already
   means `SHOW_THINKING` / `UpdateThinking` (chain-of-thought in the
   bubble). Do not collide those names.

---

## How Telegram actually does it

Two independent layers. Pendant has neither.

### Layer 1 — chat action (this walk)

`internal/channel/telegram/telegram.go`: `deliver` wraps `Handle`.

```text
inbound allowed
  → startTyping() goroutine
  → Handle(ctx, msg)          // model + tools, can be minutes
  → send reply / stream Finish
  → stopTyping()
```

`startTyping` sends `SendChatAction(ChatActionTyping)` **immediately**,
then every `typingInterval` (4s) until the stop func runs. Telegram
expires an action in ~5s, so the refresh keeps the dots alive through
prefill and tool rounds. It is **not a message**. It is not stored.
It is not the bubble.

Discord is the same shape (`ChannelTyping` every 5s). Slack has no
action. Cron `Push` does **not** type — only the inbound `Handle` path.

Silent pin / bare location returns before `deliver`, so no typing.

### Layer 2 — stream bubble (later, not this)

If `STREAM_REPLIES` (default on), Telegram also attaches an `editStream`
on the context (`ReplyWriter` / `ThinkingWriter` / `ProgressWriter` /
`StatusWriter`). The agent then:

| Signal | When | What Telegram shows |
| --- | --- | --- |
| `UpdateStatus` | `SPINUP_NOTICE_MS` / first turn after boot | disposable `⏳ …` line, cleared by real output |
| `UpdateThinking` | `SHOW_THINKING` | live italics CoT, final expandable blockquote |
| `UpdateProgress` | `TOOL_TRACE` | `Making Calls: ✓, ✗` between prose |
| `Update` / `Finish` | token stream | placeholder `…` then `editMessageText` ~1/s |

`run.go` already passes `StreamReplies` / `ShowThinking` into Telegram,
Discord, Slack, stdio. **Pendant `New` does not.** `dispatch` blocks on
`Handle` and writes one `reply` frame. Spinup, tool trace, and CoT
never leave the crane.

Architecture already said placeholder + edit can wait. Keep waiting.
This walk is layer 1 only.

---

## What pendant does today

| Side | Today |
| --- | --- |
| Phone header | `status === "up"` → **live** (your WebSocket). Down / idle otherwise. |
| Wire kinds | `inbound` `reply` `push` `ack` `error` `pin` `cmds` `allow` |
| Mailbox | Relays + queues `reply`/`push`. Does not know if Handle is running. |
| Crane `dispatch` | Ignore `ack`/`error`/`reply`/`push`/`cmds`/`allow`. Silent pin → `here.Set`, return. Else `Handle`, then one `{ kind: "reply", user_id }`. |
| Inbound ack | Phone gets `ack` when the DO accepted `inbound` — **including when no crane socket** and the frame is queued. |

So: live ≠ crane online ≠ thinking. The inbound `ack` is the trap that
makes a fake hatch look right on a happy path and lie when Kit is
asleep.

---

## Not a fake hatch

Do **not**:

- Flip the subtitle to typing after `sendText` until a `reply` arrives
- Treat inbound `ack` as "Handle started"
- Time out a local guess
- Paint a Kit bubble that says "thinking…" (that's layer 2)

Anti-walk (must stay **false**): yank the crane, send from the phone,
header must stay `live` (or `down` if the phone socket died) — **never**
`typing…`. The inbound is queued. Nobody is in `Handle`.

---

## Wire

Crane → mailbox → that phone:

```text
{ "kind": "typing", "user_id": "<google sub>" }
```

No `text`. No `id`. No `since`. No images.

| Rule | Why |
| --- | --- |
| Crane-only (phone publish → `error` `bad frame`) | Same as `cmds` / `allow` |
| `routeTag` like `reply`: `user_id` or drop | Bob does not see Ada's turn |
| `shouldQueue("typing") === false` | Reconnect must not resurrect dots |
| Early-return in the DO **before** minting `id` | Same pitfall as forgetting `cmds` — unknown kinds still queue today |
| Still `take()` rate | 4s refresh ≈ 15 frames/min; 30/min cap. Flood fails closed. Tiny JSON. |
| Stop the ticker **before** writing `reply` | Same socket as the bubble. A late `typing` after `reply` would re-light dots. Telegram's action is a different API so they can defer-stop after send; we cannot. |

Refresh: 4s, matching Telegram. Phone TTL: ~6s after the last
`typing` frame (interval + slack). Clear immediately on `reply` /
`push` / `error` for that room.

No explicit stop frame in v1. Empty `/cancel` reply: ticker stops,
TTL burns off. Fine.

Cron / spark / watch `Push`: do not type.

---

## Phone UI

Keep **live** as socket health. Overlay the action:

```text
live
live · typing…
down
```

Eleven-pixel subtitle next to the name — not a thread bubble, not a
compose placeholder. Clear on reply or TTL. Do not haptic / badge on
`typing`.

Dev `?sample=` stays canned. Loopback mock replies stay canned. The
walk is a real crane (or `/` + live `CHANNEL=pendant`), not
`sample=thread`.

---

## Knock-out — gantry-pendant

Wire + mailbox + header. No hatch.

- [x] `FrameKind` includes `typing`. `parseFrame` accepts
      `{ kind: "typing", user_id }`. Reject phone-originated `typing`
      (`phoneMustNotPublish` sibling of cmds/allow).
- [x] `shouldQueue("typing")` is false. `persistRole` undefined.
      `routeTag("crane", { kind: "typing", user_id })` is that `sub`.
      Missing `user_id` → no fan-out.
- [x] DO: crane `typing` fans to `getWebSockets(user_id)` and
      **returns** (no `newQueueId`, no `putQueued`). Tests: not in
      flush/peek after a typing frame; Ada's socket gets it, Bob's
      does not.
- [x] `PhoneShell`: on `kind === "typing"` set a typing flag + TTL;
      do not `setMessages`. `reply` / `push` / `error` clear it.
      Subtitle `live · typing…`.
- [x] Tests: `test/mailbox/frame.test.ts`, `route.test.ts`,
      `queue.test.ts` (`shouldQueue("cmds")` is already false — add
      `typing`). Header/shell coverage for the subtitle + TTL +
      "inbound ack does not type".
- [x] `npm test`, `npm run typecheck`, `npm run lint` on what you
      touched.

---

## Knock-out — ai-gantry (`internal/channel/pendant`)

Copy Telegram `startTyping`, not the stream writer.

- [x] Split `dispatch`'s Handle+reply into a `deliver`-shaped path.
      After allowlist + not-silent-pin, `startTyping(sub)` then
      `Handle`, then **stop**, then write `reply` if non-empty.
- [x] `startTyping`: write `{ kind: "typing", user_id }` immediately
      and every 4s on the live conn (`writeOn` / `writeMu`). Stop
      channel + context cancel. Interval overridable in tests.
- [x] Ignore inbound `kind: "typing"` (add to the existing ignore
      list next to `ack`/`reply`/`push`/`cmds`/`allow`).
- [x] Do **not** type on silent pin, missing text, deny, or `Push`.
- [x] Tests in `pendant_test.go`: fakeConn sees one or more `typing`
      writes for that `user_id` **before** `reply`; pin-only inbound
      writes nothing; Push is still a single `push` frame.
- [x] `cmd/gantry/run.go`: still no `ReplyWriter` on pendant. Do not
      sneak layer 2 in with this.

---

## Walk (done when this is boring)

Pocket or two-tab is fine. Crane must be `CHANNEL=pendant`.

- [ ] Send a slow turn (local model, or a tool-y question). Header
      goes `live · typing…` **before** the Kit bubble. Reply lands,
      dots die.
- [ ] Stop the crane, send again. Phone gets inbound `ack` (or
      pending bubble). Header does **not** type. That is the hatch
      test.
- [ ] Two allowlisted phones, one crane: Ada's turn does not type on
      Bob.
- [ ] Silent pin: cursor updates, no typing, no Completer.
- [ ] Cron/spark ping: labeled **ping**, no typing beforehand.

Do not close this on `?sample=` shots.

---

## Later (not this doc)

Already on [todo.md](todo.md) under ai-gantry: `ReplyWriter` so the
phone **replaces** the last Kit bubble instead of appending per chunk.
That is Telegram layer 2 (spinup line, tool trace, CoT, token edits).

When that happens: `typing` can stop once `Started()` is true (dots
then the bubble), or keep refreshing under the stream. Decide then.
Do not invent a second `thinking` kind for CoT — that belongs in the
bubble body, as Telegram already does.

Mouth UI that sits next to this walk (not instead of it): crane-up vs
phone `live`, and a stop control while `typing…` —
[todo.md](todo.md#mouth-ui). Presence must not reuse inbound `ack`. Stop
is `/cancel` plus Handle abort, not a fake hatch.
