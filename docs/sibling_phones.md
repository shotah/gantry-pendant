# Sibling phones (live inbound)

One human, two mouths, one Durable Object. The room already stores
Ada's turns under her `sub`. What it does **not** do is push an
`inbound` she just sent on the PWA onto her still-open Cab socket (or
the other way around). That is a live-delivery hole, not a new mailbox
shape.

Walk: [architecture.md](architecture.md#mailbox-room). Mouths:
[frontends.md](frontends.md). Cab's quiet catch-up (no flash) is
documented there too; this page is the Worker end state.

---

## Why this is not a redesign

The mailbox is already:

```text
room  = crane slug          (one DO)
human = Google sub          (session, transcript key, socket tag)
mouth = PWA | Cab | later iOS   (sockets, not identities)
```

Crane `reply` / `typing` / `draft` already fan to **every** socket
tagged `sub:<userId>`. Face / backdrop / theme already announce to every
socket in the room. Reload already hydrates `t:<sub>` onto whichever
mouth reconnects.

The only missing send is: a phone `inbound` is live-routed to the
**crane**, stored for Ada, acked to the **sender**, and never copied to
Ada's other open sockets.

```text
today, Ada types on the PWA while Cab's socket is still up:

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

## Proposed end state

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

Today (`worker/mailbox.ts`, `dest === "crane"`): send to crane
peers, maybe queue for the crane, `rememberPhone` (queue + transcript)
when `persistInboundForPhone`, then `ack` the sender.

Add, after `rememberPhone`, when `meta.userId` is set:

1. `body` is already `encodeFrame(out)` with mailbox `seq` / `at`.
2. For each **open** socket in `this.peers(subTag(meta.userId))`
   except `ws`, `p.send(body)`.
3. Skip if there is no `userId` (spike / loopback). Those mouths stay
   on reconnect + Cab sweep.

Helper belongs next to `routeTag` / `persistInboundForPhone` in
`lib/mailbox/route.ts` so it is unit-tested without the DO:

```text
siblingPhoneTag(from, kind, userId) → subTag(userId)
  when from === "phone" && kind === "inbound" && userId is non-empty
  else undefined
```

Do **not** change `routeTag("phone", …)` itself. That tag is still
`role:crane`. Sibling fan-out is a second send, not a reroute of the
crane path.

Exclude `ws` so the sender is not painted twice as a new bubble before
`ack`. Cab / PWA would survive a duplicate `id`; skipping is cheaper
and keeps `pending` waiting on the real `ack`.

---

## Identity

| Mouth sign-in | Socket `userId` | Live sibling | Hydrate on reconnect |
| --- | --- | --- | --- |
| Google on both | same `sub` | yes, after this change | already (personal `t:<sub>`) |
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

**Cover after the Worker patch:**

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

1. Pendant: helper + test in `test/mailbox/route.test.ts`, send loop in
   `worker/mailbox.ts`, a mailbox integration test that two phone
   sockets on the same `sub` both see the inbound and a third `sub`
   does not.
2. Walk Cab + PWA on the deployed Worker (same Google account).
3. Leave Cab `MailboxClient.sweep` in place. Optionally later raise
   `SWEEP_EVERY_MS` or tick only on resume once the Worker has been
   live long enough that the 2 min poll is just Doze insurance.

Cab does not need a lockstep APK for (1). Walk it anyway —
[frontends.md](frontends.md) says a PWA-only paint is not enough when
the queue or thread order is in play.
