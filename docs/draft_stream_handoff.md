# Draft stream — pendant / crane handoff

Written in the Cab checkout (`gantry-cab`) on 2026-09-17 for the
mailbox (`gantry-pendant`) and crane (`ai-gantry`) checkouts. Copy
into `gantry-pendant/docs/`. Cab's own half is at the bottom.

**Open** (everything else below is `[x]`): pendant Worker — protocol
pong under load (Walk 5). Cab — the Walk on a sideload. PWA — Walk 3
and 5 on the deployed origin.

**Symptom on the phone.** Ask Kit something. The typing chip shows,
the streaming draft paints, then the draft **vanishes**. Nothing for
many seconds. Then the finished `reply` lands. Other times the same
question streams and finalizes cleanly. Cab-side trace below; the
Cab paths are exhausted, so the rest is wire and Worker.

Wire: pendant `docs/frontends.md`. Sibling fan:
[sibling_phones.md](sibling_phones.md). Cab's draft code:
`Mouth.kt` (`applyDraft`, `commit`, `setUp`), `MailboxClient.kt`.

---

## What Cab does with the stream today (do not guess)

| Frame / event | Cab | Number |
| --- | --- | --- |
| `typing` | chip on; off after TTL with no refresh | `TYPING_TTL_MS` 6 s (crane refresh ~4 s) |
| `draft` with text | replace the one draft bubble, always sorted last | — |
| `draft` with **blank or missing `text`** | **remove** the draft bubble | — |
| `reply` with text or image | replaces the draft (same Compose key, no remount) | — |
| `reply` with **no text and no image** | **remove** the draft; paint nothing | — |
| `error` | mark your bubble failed; chip off; draft untouched | — |
| socket down (`onClosed` / `onFailure`) | chip off; **draft stays** (was: removed, until 2026-09-17) | retry 2 s → 60 s |
| terminal stop (auth lost, timeout, sign-out) | draft removed | — |
| socket up | `ack since:<seq>`, take the replay; a held `draft` from the flush repaints it | — |
| stale draft | no new words and no `typing` for `DRAFT_TTL_MS` → removed; an identical re-sent draft is not life | 60 s, checked every 15 s |
| OkHttp protocol ping | every 20 s; **fails the socket** if no pong in 20 s | `pingInterval(20 s)` |
| sweep | second socket while the thread is on screen; first socket **closed with 1000** once the second is open (was: `cancel()`, a TCP abort) | every 2 min, and on resume, min gap 10 s |
| connect flush replay | stored `inbound` / `reply` / `push` with `replay: true`; restamps ids already painted | — |

Drafts are never stored on the phone. `ThreadCache` and hydrate drop
them. A draft that leaves the screen only comes back as a new `draft`
frame or as its `reply`.

## The three ways a draft leaves before its reply

1. **A socket gap.** Any close or failure mid-answer cleared the draft
   (Cab, by design — reconnect was "start clean"). Reconnect + replay
   brought stored frames, not the in-progress draft. If the crane
   sent no more drafts (finishing, or inside a tool call), the
   bubble stayed gone until `reply`. Causes: network blip; a late
   protocol pong; the Worker closing the socket. Both halves fixed
   below: the Worker re-sends the held draft, and Cab no longer
   drops it.
2. **A blank `draft`.** Cab reads missing / whitespace `text` as
   "clear." If the crane resets its buffer at a tool call, or the
   Worker's coalescer flushes empty, the bubble vanishes.
3. **An empty `reply`.** No text, no image → Cab drops the draft and
   paints nothing.

How to tell in the field: if the header loses **Live** or shows
"Mailbox socket down — …" at the moment the draft goes, it is (1).
If the header is calm and the PWA loses the draft at the same
instant, it is (2) or (3).

---

## Pendant (`gantry-pendant`) — Worker

Ordered by payoff. All additive; an old APK sees only frames it
already knows. Done in `worker/mailbox.ts`; contract in pendant
[`docs/frontends.md` → Draft](https://github.com/shotah/gantry-pendant/blob/main/docs/frontends.md).

- [x] **Fan-out past a stale socket.** Found while checking (1):
      `getWebSockets` still lists the socket Cab `cancel()`ed (no
      close frame → CLOSING until the peer answers), and `send()` on
      it throws. Every fan loop was unguarded, so a stale sibling
      ahead of the live one aborted the loop and the `draft` /
      `typing` / `reply` never reached the phone. That is (1) with a
      calm header. Every fan now goes through `fanOut` (open filter +
      per-socket try/catch); the crane queue decision counts sockets
      that actually took the frame.
- [x] **Re-send the in-progress draft on a phone connect flush.**
      Latest `draft.text` per `sub` in DO memory (`drafts` map, no
      storage write per token). Connect flush: transcript, unread
      queue, then one plain `draft` (no `replay`, no `seq`). Dropped
      on that human's `reply` / `error`. If the room hibernates
      mid-stream the phone waits for `reply` as before.
- [x] **Blank-draft semantics: a blank is the clear, only while a
      draft is held.** Taken from the push-back below. Blank + a held
      draft for that `sub` → fanned as `text: ""` and the held text
      forgotten; blank + nothing held → dropped (the noise case). The
      PWA already reads blank as "clear" (`PhoneShell` `onmessage`,
      `draft` branch drops the `__draft__` bubble when `text.trim()`
      is empty), same as Cab `applyDraft`; it fires exactly when the
      crane `Discard`s.
- [x] **Push-back: a blank `draft` while a draft is held is a clear;
      forward it.** Done as above. Pinned:
      `forwards a blank draft as the clear while a draft is held, then
      forgets it` (first blank fanned, second blank dropped, next
      connect gets no draft).
- [x] **Push-back: drop the held draft when the crane goes away.**
      Both halves. `webSocketClose` / `webSocketError` on a **crane**
      socket forget every held draft when no other crane socket is
      open (a fresh-dial socket closing while the main one is up does
      not count; a phone socket closing never does). And a held draft
      expires after `HELD_DRAFT_TTL_MS` 60 s with no new words and no
      `typing` for that `sub` — `typing` bumps it, matching Cab's
      `DRAFT_TTL_MS` life rule. Expiry is lazy at the connect flush
      (the only reader), so no alarm and no storage. `HeldDrafts` in
      `lib/mailbox/draft.ts`.
- [x] **Never fan a `reply` with no text and no images.** Refused as
      `error bad frame` back to the crane with the frame `id`;
      nothing fanned, stored, queued, or pushed. Photo-only `reply`
      still passes.
- [x] **Socket close bookkeeping.** Checked: no per-`sub` singleton,
      no "last socket" map, no sibling closes. `webSocketClose` /
      `webSocketError` only `close()` the one socket. The stale-socket
      fan was the only way an abort hurt a sibling.
- [x] **`typing` off the crane rate bucket.** Not in the brief, but
      the crane item below (refresh ≤ 4 s through a tool call) would
      spend the 30/min bucket on chips and bounce the `reply` as
      `rate`. `typing` now skips `take()` like `draft` already did.
- [ ] **Protocol ping / pong under load.** Cab fails the socket if a
      WebSocket-level pong is 20 s late. Hibernation API handles
      protocol pings in the runtime; still verify on a long answer in
      the Walk (5), not by reading docs. The text `ping` / `pong` the
      mailbox already does is separate and fine.
- [x] **`frontends.md`.** Draft section: cumulative full text, blank
      is the clear while held (dropped otherwise), empty reply
      refused, connect flush may end with one `draft` (forgotten on
      crane gone / 60 s quiet), fan-out guard, `typing` rate.

### Tests (`test/worker/mailbox.test.ts`)

Fake `DurableObjectState` (storage map, tagged sockets that stay
listed after `close()` and throw on `send()` like workerd).

- Connect flush for a `sub` with an answer in progress emits the
  stored transcript, then one `draft` with the current text; a `sub`
  with no answer in progress and an anonymous socket get no draft.
- `reply` / `error` for that `sub` clears the held draft; the next
  connect gets none.
- Blank `draft` with nothing held: dropped. Blank while held: fanned
  as `text: ""`, held text forgotten, a second blank dropped.
- Last crane socket close or error forgets every held draft; a
  fresh-dial crane socket closing beside the main one keeps them; a
  phone socket closing keeps them.
- Held draft expires 60 s after the last words or `typing` (fake
  timers); `typing` at 50 s keeps it alive at 100 s.
- Empty `reply` refused as `bad frame`; storage untouched; photo-only
  passes.
- Two phone sockets, same `sub`; first half-open (or throwing while
  OPEN); a following `typing`, `draft`, `reply` reach the second.
  Same for a room notice and for the crane queue decision.
- 40 `typing` + 40 `draft` then `reply`: no `rate`; 31 replies: `rate`.

---

## Pendant (`gantry-pendant`) — PWA

The PWA half of the same mouth. Done 2026-09-17 in
`app/components/chat/PhoneShell.tsx` (`ws.onclose`, `onmessage`
`typing` / `draft` / `reply` branches), together, as Cab did —
keeping the draft without an expiry would leave a ghost on a dead
crane. Belt and braces with the Worker's held draft.

- [x] **Blank `draft` removes the bubble.** `text.trim()` empty →
      the `__draft__` bubble is filtered out and the TTL disarms.
      Fires exactly when the crane `Discard`s (the Worker forwards a
      blank only while a draft is held).
- [x] **Draft survives a socket gap.** `ws.onclose` no longer filters
      the `__draft__` bubble (it still drops the chip and sets
      `down`). `reply` replaces it, the connect-flush `draft`
      refreshes it in place (same `li`, no remount), a blank clears
      it, the TTL expires it. The unmount cleanup clears the timer.
      Pinned: `keeps the draft through a socket gap; the connect
      flush repaints the same bubble`.
- [x] **Draft TTL.** `DRAFT_TTL_MS` 60 s in `lib/mailbox/draft.ts`
      (`HELD_DRAFT_TTL_MS` is the same constant on purpose). A
      `draftTimer` ref is armed on a `draft` whose text differs from
      the last one, re-armed on `typing` while a draft is up, and
      disarmed on `reply` or a blank; when it fires the bubble comes
      down. An identical re-sent draft (the Worker's flush) is not
      life. Runs through a socket gap — that is how a dead crane's
      bubble still clears. Mouth-local; nothing on the wire. Pinned:
      `drops a draft after DRAFT_TTL_MS quiet; typing and new words
      are life, a re-sent copy is not` (fake timers: alive at 100 s
      with `typing` at 50 s; new words re-arm; re-send at 59.999 s
      does not; gone at 60 s), and `forgets the draft text on reply
      so the same words paint again next turn`.

---

## Crane (`ai-gantry`)

Checked 2026-09-17 against `internal/channel/pendant/{stream,pendant}.go`.
All three already held; each is now pinned by a test so it stays that
way.

- [x] **Tool calls do not blank the draft.** `editStream` keeps one
      cumulative bubble: a finished segment is committed to `body`, the
      live segment is `answer`, and every `draft` is `body + answer`.
      `pushLocked` never writes empty text; an `Update("")` at the
      start of a tool round is a no-op. The only blank `draft` the
      crane ever sends is `Discard` (cancel / empty turn / error), and
      the Worker now drops those. Pinned:
      `TestEditStream_ToolRoundKeepsDraftWhole`.
- [x] **Keep `typing` alive through a tool call.** `startTyping` is a
      ticker for the whole `Handle`, not per model call; a tool call is
      just a slow `Handle` to it. `typingInterval` is 4 s. Pinned:
      `TestDispatch_TypingRefresh` (handler blocked, refreshes keep
      coming). If the chip still drops on a long tool call in the Walk,
      it is the wire (Worker rate bucket / stale-socket fan, both fixed
      above), not the cadence.
- [x] **No empty `reply`.** `replyFrames` returns nothing for blank
      text with no image; `Finish` and the non-stream path write no
      frame. `writePush` likewise sends nothing for blank text (it used
      to fall through to a text-only frame). Pinned:
      `TestEditStream_FinishEmptyWritesNothing`,
      `TestPush_EmptyTextWritesNothing`.

Also fixed while here: a `Handle` error now lands as a short `reply`
(`channel.HandleFailedText`) after the draft is discarded, so a
provider 400 is not "draft vanishes, then nothing." Pinned:
`TestDispatch_HandleErrorTellsHuman`.

Also fixed, not in the brief: the `reply` was written only on the
socket captured at dispatch. If the crane's own mailbox socket dropped
mid-turn (`close 1006` in the logs), `Finish` failed and the reply was
lost — drafts stop, chip expires, nothing lands. `reply` frames (final,
error line, non-stream) now take the same fresh-dial fallback `push`
already had (`writeReply` → `writeDialed`). Drafts and `typing` do not
dial; they are ephemeral and the serve loop replaces the socket once
`Handle` returns. Pinned: `TestDispatch_ReplyFallsBackToDialWhenSocketDies`
(stream and non-stream; exactly one dial).

---

## Cab (`gantry-cab`) — done 2026-09-17

Belt and braces with the Worker's held-draft re-send, on purpose —
same as hydrate dedup.

- [x] **Draft survives a socket gap.** `Mouth.setUp(false)` drops the
      chip, not the draft. The reconnect replay's `reply` replaces it
      on the same live Compose key; the flush's held `draft` repaints
      it. Terminal stops (`giveUp`: auth lost, timeout) call
      `Mouth.dropDraft()`; sign-out changes the room and clears the
      thread. `MouthTest.socketDownKeepsTheDraftAndDropsTyping`,
      `terminalStopDropsTheDraft`.
- [x] **Stale draft expires.** `DRAFT_TTL_MS` 60 s with no new words
      and no `typing`; `MailboxService` ticks `Mouth.expireDraft()`
      every `DRAFT_TICK_MS` 15 s. A long tool call is alive because
      the crane keeps `typing` coming; the Worker re-sending the same
      held text on a flush is not life. `draftExpiresWhenTheCraneGoesQuiet`,
      `typingAndNewWordsKeepADraftAlive`, `aReSentIdenticalDraftIsNotLife`.
- [x] **Sweep retires with a close frame.** `close(1000, "sweep")`
      on the first socket once the second is open, not `cancel()`.
      The mailbox answers and drops it at once instead of holding a
      half-open zombie until the edge notices. `onMessage` now checks
      `mine()`, so anything still fanned to the retiring socket
      during the handshake never reaches the thread.
      `MailboxClientTest.sweepSwapsInASecondSocketWithoutADownState`
      asserts 1000, no failure, and a `stale` frame dropped.
- [ ] **Walk** below on a sideload against the deployed Worker.

---

## Walk

PWA and Cab side by side, same Google, deployed origin.

1. Ask something that makes Kit call a tool. Both drafts stay on
   screen through the tool call; the chip stays; the `reply` replaces
   the draft. No blank.
2. Ask again; while Kit is streaming, leave Cab and come back after
   ~15 s (forces a sweep on resume). The draft is on screen when you
   return — either it never left (Cab fix) or the connect flush
   brought it back (Worker fix).
3. Same, but hide and show the PWA tab mid-answer. Draft comes back
   on redial.
4. Airplane mode for 3 s mid-answer, off again. Cab header drops and
   returns; the draft is there after reconnect.
5. Long answer (> 60 s of streaming). Header never shows "socket
   down"; if it does, it is the pong item.

## Watch

- Additive only. No new `kind`, no new required field. A re-sent
  `draft` on connect is a frame every mouth already paints.
- Do not replay drafts as part of the transcript or with
  `replay: true` — Cab's `shouldSpeak` and hydrate do not know
  drafts, and a stored draft would land in the thread cache.
- Do not "fix" (1) by having the Worker keep phone sockets alive
  longer; the sweep is deliberate. Gapless on the phone comes from
  the `mine()` check on the retired line's callbacks, not from how
  it is closed — close it gracefully (1000) so the mailbox can drop
  it; a `cancel()` is what left the zombie.
- The Worker's fan-out guard and Cab's graceful close overlap on
  purpose. Keep both; either one alone is a version skew away from
  the bug coming back.
- The chip and the draft are separate: `typing` TTL is a Cab
  constant; draft persistence is this doc.
