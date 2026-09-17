# Sibling phones (live inbound)

One human, two mouths, one Durable Object. The room stores Ada's turns
under her `sub`. The Worker also copies a live `inbound` she just
sent on the PWA onto her still-open Cab socket (and the other way
around). Spike (no `sub`) still waits on reconnect + Cab sweep.

Walk both mouths on a deployed origin (same Google). Design:
[architecture.md](architecture.md#mailbox-room). Mouths:
[frontends.md](frontends.md).

---

## Why this is not a redesign

The mailbox is already:

```text
room  = crane slug          (one DO)
human = Google sub          (session, transcript key, socket tag)
mouth = PWA | Cab | Helm        (sockets, not identities)
```

Crane `reply` / `typing` / `draft` already fan to **every** socket
tagged `sub:<userId>`. Face / backdrop / theme already announce to every
socket in the room. Reload already hydrates `t:<sub>` onto whichever
mouth reconnects.

Before this shipped, a phone `inbound` was live-routed to the
**crane**, stored for Ada, acked to the **sender**, and never copied to
Ada's other open sockets.

```text
before, Ada types on the PWA while Cab's socket is still up:

  PWA ──inbound──► DO ──► crane          (live)
                 DO ──ack──► PWA        (this socket only)
                 DO stores t:<ada>     (reload / reconnect)
                 Cab hears nothing until it reconnects
```

Cab keeps one socket open for hours (foreground service, Auto HUNs).
The PWA closes on tab hide and redials on visible, so it *looks* like
the browser "picks up" Cab's messages — it is just reconnect-flushing
the same store Cab never re-reads.

---

## End state (shipped)

Same body, same `id` / `seq` / `at`, live (not `replay`), to Ada's
**other** phone sockets. The sender still gets `ack`. The crane still
gets the frame. Storage is unchanged.

```text
  PWA ──inbound──► DO ──► crane
                 DO ──ack──► PWA
                 DO ──same body──► Cab (and any other ada sockets)
                 DO stores t:<ada>     (as today)
```

A mouth that already painted that `id` restamps `seq` / `at` and
keeps `pending` until `ack` (PWA `seenIds`, Cab `Mouth.ingest`). A mouth
that did not have it inserts by `seq` as "you" (`kind == inbound`).

No new `kind`. No new field. No lockstep APK. Additive, same bar as
`seq` / `at`.

---

## What does not change

| Already true | Stays |
| --- | --- |
| Room is per slug | yes |
| Transcript is `t:<sub>` plus broadcast `t:_` | yes |
| Queue / `ack` / `since` | yes. Sibling delivery is live; it is not a second unread row |
| Crane is the only thing that answers | yes. Sibling phones do not Handle |
| Ada does not see Bob's inbound | yes. Fan-out is `subTag(sender)`, not `role:phone` |
| Pins are not turns | yes. Do not fan `pin` |
| `replay: true` on hydrate | yes. Live sibling frames are not replay |
| Mouths paint `inbound` as "you" | already (`bubbleFrom`, Cab `fromYou`) |
| Toast / HUN / haptic | still `reply` / `push` only (`shouldSpeak`, `shouldNotify`, `buzzPush`) |
| Cab quiet sweep | keep. Frozen / Doze sockets, spike (no `sub`), and "I just opened the screen" still need a connect flush |

This is **not**: a group chat, a shared room transcript for every
human, a second mailbox, a Cab-side poll, or a screen flash / redial
that drops `up`.

---

## Worker change

`worker/mailbox.ts`, `dest === "crane"`: send to crane peers, maybe
queue for the crane, `rememberPhone` when `persistInboundForPhone`,
then fan, then `ack` the sender.

**Shipped:** after `rememberPhone`, when `meta.userId` is set, send
the same `body` (mailbox `seq` / `at`) to each **open** socket in
`this.peers(siblingPhoneTag(…))` except `ws`. Spike (no `userId`)
stays on reconnect + Cab sweep. Do **not** change `routeTag("phone",
…)` — that is still `role:crane`. Exclude `ws` so the sender keeps
`pending` until the real `ack`.

```text
siblingPhoneTag(from, kind, userId) → subTag(userId)
  when from === "phone" && kind === "inbound" && userId is non-empty
  else undefined
```

`test/mailbox/route.test.ts`.

---

## Identity

| Mouth sign-in | Socket `userId` | Live sibling | Hydrate on reconnect |
| --- | --- | --- | --- |
| Google on both | same `sub` | yes | already (personal `t:<sub>`) |
| Spike on Cab, Google on PWA | Cab has none | no | PWA sees Cab via broadcast `t:_`; Cab never sees PWA personal rows |
| Spike on both | none | no | both hydrate the broadcast row |

Spike is loopback. Production mouths share Google. A Cab still on
`MAILBOX_SECRET` is a different human as far as the DO is concerned —
that is why "force-stop Cab" can still miss browser turns. Sign Cab in
with Google; do not "fix" spike by broadcasting inbound to every phone.

---

## Mouths (walk both)

PWA and Cab already ingest a live `inbound` they did not send:

- Dedup by `id`. Live echo restamps; `pending` waits for `ack`.
- Unknown id → insert, `from: you`.
- `shouldSpeak` / Auto HUN / browser notify stay off for `inbound`.

**Walk:**

1. Google on Cab and PWA, both sockets up. Type in the browser — Cab
   paints it without going Offline, without clearing the thread, as
   "you", in seq order. Type in Cab — the browser does the same
   without a tab hide/show.
2. Two humans in the room: Ada's inbound does not appear on Bob's
   thread. Kit's `reply` to Ada still only hits Ada's sockets.
3. Old Cab / old PWA: extra `inbound` they already know how to paint.
   Worst case they restamp an id they sent. No new required field.
4. Cab sweep still runs. After this ships it is mostly "socket looks
   up but is frozen"; it is not how sibling turns arrive.

Do not wait for an iOS repo. The iOS mouth will be another socket on
the same `sub`.

---

## Alternatives (why not)

| Shape | Why not |
| --- | --- |
| Cab redials and flashes Offline | User said no. The DO already has the bytes; dropping `up` is a UI lie |
| Cab-only quiet sweep as the product | Works, and Cab shipped it. Pays a handshake + 80-row replay every resume / 2 min while watching. Sibling turns still wait on that tick. Fine as recovery, wrong as the live path |
| Broadcast inbound to `role:phone` | Ada's hatch photo lands on Bob. The room is not a group |
| Shared `t:_` for every inbound | Same leak, plus hydrate would mix humans |
| HTTP `GET /api/thread` | Second protocol. Connect flush is already the catch-up API |
| Mouths poll each other | Mouths do not know each other. The DO is the rendezvous |

---

## Ship

1. [x] Pendant helper + send loop (`siblingPhoneTag`,
   `worker/mailbox.ts`).
2. [ ] Walk Cab + PWA on the deployed Worker (same Google account).
3. Leave Cab `MailboxClient.sweep` in place.

---

## Cross-mouth notification dismissal (sized 2026-09-17; pendant side shipped same day)

Ask: reading or replying on the PWA should clear Cab's HUN. Read
against `gantry-cab` `drive/CabNotifier.kt`, `drive/MailboxService.kt`,
`Mouth.kt`, `mailbox/Wire.kt` (read only; the Cab checkout owns the
change).

What Cab has (verified):

- **One card.** `CabNotifier.kitMessage` posts a single
  `MessagingStyle` notification (`MESSAGE_ID`) with an in-memory
  `history` of Kit turns; `dismissKit()` clears both. Already called
  from `MainActivity.onResume`, the car thread screen, swipe, and
  "Mark as read". So "dismiss" is cancel-all — no per-`seq` mapping.
- **Posting** is in `MailboxService.onFrame`: `fresh && frame.spoken()`
  (live `reply` / `push`, not `replay`) then `shouldPost(...)`. A
  sibling `inbound` already comes through the same `onFrame` with
  `fresh == true` and `spoken() == false`.
- **Incoming `ack`** in `Mouth.ingest` is `frame.id?.let { ack(it) }` —
  clears a *pending own* line by id, otherwise a no-op. Safe to fan an
  ack at an old Cab.
- **`WireFrame`** is a fixed data class (`text kind id since images
  context commands seq at replay rev theme`); unknown JSON keys are
  dropped. An additive `seen` is invisible to an old build.
- No Cab FCM. Everything is what the socket hears.

What the wire carries today: the sibling `inbound` (shipped above);
and one phone `ack since:<seq>` on connect (PWA and Cab both), which
the Worker forwards to the **crane only**. `ack` means *delivered* —
Cab and (later) Helm ack from a background service and on every 2 min
sweep. The PWA drops its socket on tab hide and redials on visible,
so a PWA socket being up *is* "the human is looking".

| Tier | What | Where | Size | Worth it |
| --- | --- | --- | --- | --- |
| 1 — replied elsewhere | In `MailboxService.onFrame`: `fresh && frame.kind == "inbound" && !frame.replay` → `CabNotifier.dismissKit(this)`. The human just typed on another mouth | **Cab only.** ~3 lines + a `MailboxService` / `Mouth` test. No pendant change, no wire change, no lockstep | Small | Yes. Covers "reading and replying on PWA". Ship it regardless of the rest |
| 2 — read, no reply | Additive `seen: true` on phone `ack`. Worker fans a `seen` ack to `sub:<userId>` sockets except the sender — never a plain ack (background delivery acks must not dismiss each other). PWA sets `seen` on its connect `ack since` (visible by construction) and sends `ack id seen` on each live `reply` / `push` while visible. Cab: `WireFrame.seen`, and in `onFrame` `kind == "ack" && seen` → `dismissKit` | Pendant: `frame.ts` whitelist + `ClientFrame`, `mailbox.ts` fan (`siblingPhoneTag` shape), `PhoneShell` two send points, `test/worker` + `PhoneShell` tests, `frontends.md`. Cab: one field, one `if`, one test. Helm later, same two lines | Small-medium; two repos, additive, old Cab unaffected | Only if "opened the PWA, read, did not reply" is common. Not a mess — same shape as sibling fan — but it is a wire change for one case |
| 3 — the other way | Cab reads → PWA Web Push cards close | PWA service worker `getNotifications()` + close on visible / on a `seen` ack | Medium | Shipped the cheap half: PWA closes its own tray on connect and on a `seen` ack. A closed PWA tab has no socket — see the limit in [frontends.md → Seen](frontends.md#seen-what-every-mouth-must-do-the-same) |

Traps, as handled: a bare `seen` ack (no `since`, no `id`) is copied
to siblings and **not** forwarded to the crane (`bareAck` in
`lib/mailbox/seen.ts`), so the PWA may send one on a fresh device;
phone acks spend the phone's 30/min bucket, one per live reply is
fine; an `ack id` from the PWA deletes that reply's queued row for the
`sub`, which `ack since` already does today — Cab catches up from the
transcript, not the queue.

- [x] **Decide:** Tier 1 + 2. Pendant side shipped 2026-09-17:
      `frame.ts` `seen`, `lib/mailbox/seen.ts`, Worker fan in the
      phone-ack branch, PWA connect / per-reply `seen` sends and
      `browserCloseShownNotify`. Contract:
      [frontends.md → Seen](frontends.md#seen-what-every-mouth-must-do-the-same).

Cab (that checkout owns these; the pendant Worker already speaks it):

- [ ] **Tier 1 — sibling inbound dismisses.** `MailboxService.onFrame`:
      `fresh && frame.kind == "inbound" && !frame.replay` →
      `CabNotifier.dismissKit(this)`. Test in `MailboxService` /
      `Mouth`.
- [ ] **Tier 2 receive.** `WireFrame.seen: Boolean?` (parse `true`
      only). `onFrame`: `frame.kind == "ack" && frame.seen == true` →
      `dismissKit`. `Mouth.ingest`'s by-id ack stays (no-op).
- [ ] **Tier 2 send (reverse, to the PWA / Helm).** `seen: true` on
      the connect `ack since` only when the phone or car thread is on
      screen (`onResume`, `carThreadVisible`) — not from the service
      redial or the sweep; `ack id seen` per live `reply` / `push`
      painted on screen; bare `{ kind: "ack", seen: true }` from
      "Mark as read" / swipe when the socket is up.

Cab does not need a lockstep APK for (1). Walk it anyway —
[frontends.md](frontends.md) says a PWA-only paint is not enough when
the queue or thread order is in play.
