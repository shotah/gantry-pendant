# Frontends

This Worker is the mailbox. The mouths are **other checkouts**.
Wire: [architecture.md](architecture.md). The crane end of the same
wire: [backends.md](backends.md). Who pastes what:
[setup.md](setup.md). Gotchas: [edgecases.md](edgecases.md).

A frame change here is a change for every client that already shipped.
Do not treat `app/components/chat` as the only phone.

---

## Mouths

| Mouth | Checkout | What it is |
| --- | --- | --- |
| Pendant PWA | this repo `app/` | Handheld browser / Add to Home Screen |
| Cab | [gantry-cab](https://github.com/shotah/gantry-cab) (`repos/gantry-cab`) | Full Android app + Android Auto (`MessagingStyle`). Same mailbox, not a TWA wrapping this PWA |
| Helm | [gantry-helm](https://github.com/shotah/gantry-helm) (`repos/gantry-helm`) | Full iOS app + CarPlay communication notifications. Same mailbox, not a WKWebView wrapping this PWA |
| Crane stand-in | this repo `/crane` | Loopback only (`PENDANT_DEV`) |

Gantree is not a mouth. ai-gantry is the crane, not a phone.

Cab and Helm talk like the PWA: `GET /api/auth/config`,
`GET /api/auth/nonce`, `POST /api/auth/token` (native JWE),
`GET /api/auth/me`, then `wss /ws/<slug>?role=phone`. Google is the
pendant **Web** client id (`aud`) plus a **new** native OAuth
client (Android package / iOS bundle) — walk is on that checkout.
Cookie CSRF is PWA-only. Neither OkHttp nor URLSession stores
`pendant_session`.

Sign-in nonce. The happy path already calls `GET /api/auth/nonce`
and posts that value. `POST /api/auth/token` is 401 for any other
nonce, including one minted when that GET fails.

- Cab
  - [x] **No local nonce.** `CabViewModel.signIn` posts only the value
        from `GET /api/auth/nonce`. A failed GET stops sign-in
        ("Could not start sign-in") and never opens Google.
        `mintNonce` is gone. `repos/gantry-cab`.
- Helm
  - [ ] Same. `repos/gantry-helm`.

---

## When you change this repo

If the edit is **wire, auth, queue, or thread order**, walk Cab
and Helm before you call it done. A PWA-only paint is not enough.

| Kind of change | Other mouths |
| --- | --- |
| Additive JSON (`seq`, `at`, extra `context`) | Old clients must keep working. Cab `parseFrame` and Helm `parseFrame` drop unknown keys — that is the bar |
| New required field, new `kind`, or a required header | Cab and Helm must ship in lockstep, or the mailbox must tolerate the old client |
| Auth (`/api/auth/*`, session JWE, 4401) | Cab and Helm POST the ID token and store the JWE. Spike query creds are PWA loopback only. Cookie CSRF is PWA-only — do not send `pendant_session` from OkHttp or URLSession. Additive `version` and `voice` on `GET /api/auth/config` are dropped today (`AuthConfig` keeps `mode` / `google`). `GET /api/auth/nonce` is required: `POST /api/auth/token` is 401 unless that nonce is still stored and unused. A locally minted nonce (the old fallback when GET fails) does not sign in. Cab and Helm must send the nonce from that GET. Close `4401` / handshake 401 drops the stored JWE; 403 does not. `POST /api/auth/token` is `403 { "error": "unauthorized" }` when no crane lists the Google account — no JWE is minted; Cab (`AuthException`) and Helm (`AuthError`) already throw on any non-2xx there. `POST /api/tts` is the same door: a session that no crane lists is 403 and Google is not called. |
| Queue / `ack` / `since` / `seq` | Cab and Helm parse `seq` / `at`, insert like `placeInThread`, ack the highest seq. Transcript hydrate is the same frames plus `replay` — see below |
| Scroll / draft bounce | Cab already pins with reverseLayout (`ChatScroll.kt`). Helm pins the last bubble. Do not assume either needs the PWA CSS |
| Draft→reply remount | PWA `live` React key, Cab / Helm `composeKey` (`kit-live`) so Markdown does not remount when `__draft__` becomes `r1`. Not on the wire. |
| `draft` / `typing` (answer in progress) | Cumulative full text, one bubble per `sub`, ended by `reply` / `error` or a blank `draft` (the clear). The Worker forwards a blank only while a draft is held, refuses an empty `reply` (`error bad frame` to the crane), and re-sends the latest `draft` on a phone connect flush (forgotten when the crane goes or after 60 s quiet). Additive — every mouth already paints `draft` at any time — [Draft](#draft-what-every-mouth-must-do-the-same) |
| `seen` on a phone `ack` (read on another mouth) | Additive `seen: true` on the phone's own `ack`. The Worker copies it to that human's **other** `sub:<userId>` sockets as `{ kind: "ack", seen: true, user_id, since?, id? }` — never a plain ack, which is delivery. A mouth that hears one drops its notification cards. A bare `{ kind: "ack", seen: true }` (no cursor yet) goes to siblings only, not the crane. Old Cab drops the key (`Mouth.ingest` acks by id → no-op) — [Seen](#seen-what-every-mouth-must-do-the-same) |
| `react` (emoji on a bubble, both ways) | New `kind`, existing fields: `{ kind: "react", user_id, id: <bubble id>, text: "👍" }`; empty `text` clears. Worker stores it per human (`r:<sub>`), fans it to the human's `sub:` sockets (and to the crane when a phone sent it — queued for a down crane), replays it after the transcript on connect. Not a turn: no `seq`, phone queue, push, or cursor move. **Old Cab paints a stray bubble** — it needs `ignoredKind` for `react` before the crane starts reacting — [Reactions](#reactions-what-every-mouth-must-do-the-same) |
| `aims` (goals board) | New `kind`, crane only: `{ kind: "aims", aims: [{ area, sentence, rating30, sum7, streak, note, days[], weeks?, slope?, block?, effect? }], links? }`. Pushed on dial after `cmds` and when the board changes; the Worker stores the latest (`aims`, or `aims:<sub>` with a `user_id`) and replays it on connect. Empty `aims` clears. Not a turn. Old Cab: no `text`, so no stray bubble — [Aims board](#aims-board-what-every-mouth-must-do-the-same) |
| `todo` (tasks board) | New `kind`, crane only: `{ kind: "todo", todo: [{ id, slug, text, at, priority? }] }`, oldest first, uncapped (phone keeps 100). Priority is the `!!` / `!` marker leading `text` (or an additive `priority` key); mouths sort urgent, high, rest at paint. Pushed on dial after `aims` and when the list changes; the Worker stores the latest (`todo`, or `todo:<sub>`) and replays it on connect. Empty `todo` clears. Not a turn. The checkbox is an ordinary `inbound` `/todo done <id>`. Old Cab: no `text`, so no stray bubble — [Tasks board](#tasks-board-what-every-mouth-must-do-the-same) |
| `act` (device actions: alarms, timers, DO schedules) — **planned, not on the wire yet** | New `kind`, request/response, not a turn. Crane → phone `{ kind: "act", id, name, turn, device?, input }`, phone → crane the same `id` with `ok` / `output` / `error`. Worker routes by `device`, then the `turn` socket, then any socket on the `sub` with the cap; answers `offline` / `no_device` / `ambiguous` / `timeout` itself; `schedule.*` and `device.list` are Worker-answered. Phones announce `device` / `kind` / `caps` / `label` on the upgrade. Old Cab drops it (no `text`). Contract and checklists for all three repos: Cab [`docs/device_actions.md`](https://github.com/shotah/gantry-cab/blob/main/docs/device_actions.md) |
| Photo caps, encode ladder, `error` tokens | Every mouth encodes to the same budget and paints refusals the same way — [Photos](#photos-what-every-mouth-must-do-the-same) |
| Face / backdrop blobs and their notices | Cab and Helm refetch `/api/avatar` on `face` and `/api/backdrop` on `backdrop`. Notices are not turns — [Face, backdrop, and theme](#face-backdrop-and-theme-what-every-mouth-must-do-the-same) |
| Header face (size, hang, stroke) | Cab TopAppBar and Helm header overlay, not PWA-only — [Header face](#header-face) |
| Room theme | Cab and Helm follow Kit when `followTheme` is on; GET `/api/theme` on connect — [Theme](#theme-what-every-mouth-must-do-the-same) |
| PWA-only UI (font, Install) | Cab has Compose. Helm has SwiftUI. |
| Voice (STT / TTS) | Mouth-local. No audio on the wire. Cab Auto / Helm CarPlay already read `reply` / `push` and stuff spoken Reply into `inbound`; Cab tags that inbound `context.input: spoken` (`MailboxService.sendSpoken`, HUN Reply and the in-dash thread). PWA hold-to-talk auto-sends `inbound` + `context.input: spoken` and reads the reply through `POST /api/tts` (Chirp 3 HD, session or Bearer). Cab / Helm may reuse the route — [voice.md](voice.md) |
| Language (Settings → Language) | Per device, **not on the mailbox wire**. Closed set `en` \| `ja` \| `zh` \| `vi`, default `en`. Sets the recognizer locale and rides on `POST /api/tts` as additive `lang`; the Worker swaps the Chirp locale and keeps the speaker. Old mouths that post `{ text }` still speak — [Language](#language-what-every-mouth-must-do-the-same) |
| `context.surface` | Closed set: `browser` \| `android` \| `android_auto` \| `ios` \| `carplay`. Unknown names (including Cab’s old `pendant`) are dropped. Additive; old APKs still send `android` / `android_auto`. The crane gives `android_auto` / `carplay` the read-aloud hint on `[surface]` |
| `context.input` | Closed set of one: `spoken`. How the human produced the turn (PWA hold-to-talk, Cab Auto host STT); `surface` still says which device. Additive — old APKs and Helm drop it unread; the crane stamps `[input] spoken` with the same read-aloud hint (bare when `surface` is already driving) — [voice.md](voice.md#wire) |

**Cover:** after a mailbox frame change, read
`repos/gantry-cab/app/src/main/java/com/gantree/cab/mailbox/Wire.kt` and
`Mouth.kt`, and `repos/gantry-helm/Sources/Mailbox/Wire.swift` and
`Mouth.swift`; for caps, ladder, or photo size, Cab `mailbox/Photo.kt`
/ `SendError.kt` and Helm `Photo.swift` / `SendError.swift`; for face
/ backdrop / room theme, `Avatar` / `Look` / `ThemeApi` on both; for
the header circle itself, Cab `ui/KitAvatar.kt` + `ui/CabScreen.kt`
and Helm `HelmScreen` (82 / 80×40 / −2/−4 / 2 pt `line`). If either
native mouth would paint wrong or drop a turn, file it there (or
patch both). Sign in with Apple is still a mailbox auth change
([security.md](security.md)); APNs is lock-screen, same later as Cab
FCM. Do not grow a second Durable Object.

---

## `seq` / `at` (what Cab and Helm see today)

The Durable Object stamps `seq` (monotonic) and `at` (mailbox
epoch ms) on queued frames. The PWA inserts by `seq`, then `at`, and
reconnect-acks the **highest seq**. Drafts stay last.

Cab (`mailbox/Thread.kt`, `Mouth.ingest`, `MailboxClient`) and Helm
(`Sources/Mailbox/Thread.swift`, `Mouth.ingest`, `MailboxSocket`):

- Parses `seq` / `at`. Junk (`0`, negatives, strings) is dropped, same
  as `orderSeq` / `orderAt` here.
- Inserts with `placeInThread` (seq, then `at`, then id). Drafts stay
  last. Catch-up can arrive out of order.
- Reconnect-acks the **highest seq** (`since` is a numeric string).
  Falls back to last id when no seq has been seen yet.
- Does not *send* `seq` / `at` — `encodeFrame` omits them. The mailbox
  strips client order.
- **Transcript hydrate** replays existing `inbound` / `reply` / `push`
  with additive `replay: true`. Paint is the same `ingest` / `placeInThread`
  path. Cab and Helm `THREAD_MAX` is 80 (mailbox hydrates 80). **Ship
  those builds with this mailbox** so Auto / CarPlay HUNs skip
  `replay` (`shouldSpeak(kind, replay)`). An old APK still paints and
  still toasts every hydrate frame.
- **Sibling phones, live.** The Worker fans the same inbound body to
  `sub:<userId>` except the sender (`siblingPhoneTag`). Hydrate still
  covers a *new* socket. Cab `MailboxClient.sweep` and Helm
  `MailboxSocket.sweep` stay catch-up / Doze / frozen-socket insurance.
  Additive; mouths already paint `inbound` as "you" and skip HUN /
  notify. Walk: [sibling_phones.md](sibling_phones.md).
- **Thread on the device.** The PWA keeps the last thread per room per
  `sub` in IndexedDB (`app/lib/threadStore.ts`, `thread:<slug>:<sub>`,
  `THREAD_MAX` 500, drafts and `sending` bubbles excluded) and paints it
  before the socket is up. Hydrate frames then fold in by `id`
  (`mergeThread`, live wins) — same dedup as a reconnect. The first
  `ack` of a fresh load carries `since` = the highest cached `seq`, so
  the mailbox drops what the phone already holds instead of waiting for
  a reconnect. **Mailbox contract is unchanged**: it still flushes the
  transcript first and treats `ack since` the same as before. Cab already
  does this with `ThreadCache` (JSON on disk, not Room); Helm does
  the same in `Sources/Mailbox/ThreadCache.swift`. First `ack`
  `since` is the highest cached seq.

---

## Draft (what every mouth must do the same)

While Kit is mid-answer the crane sends `typing` (chip) and `draft`
(bubble) to `sub:<userId>`. Neither is stored, stamped, queued, or
replayed. The mailbox rules, so no mouth has to guess:

- **`draft.text` is the whole answer so far**, not a delta. A mouth
  replaces its bubble with the new text. Later `draft`s only grow it.
- **A blank `draft` is the clear, and only while a bubble is up.**
  The crane's one blank is `Discard` (cancel, empty turn, error), so
  when the Worker holds a draft for that `sub` a `draft` with missing
  or whitespace `text` is fanned as `text: ""` and the held text is
  forgotten. Mouths remove the bubble on it (Cab `applyDraft`, PWA
  `PhoneShell` `draft` branch) — keep that code. With nothing held a
  blank is noise and is dropped before fan-out, so a stray empty
  flush cannot blank a phone that has no bubble.
- **A `reply` with no text and no photo is refused.** The crane gets
  `{ kind: "error", text: "bad frame", id }` and nothing is fanned,
  stored, or pushed. A photo-only `reply` still passes. So `reply`
  always replaces the draft with something to paint.
- **Connect flush may end with one `draft`.** After the transcript
  replay and the unread queue for that `sub`, if Kit is mid-answer
  for that human the Worker sends the latest draft text as a plain
  `draft` (no `replay`, no `seq`). Cab `Mouth.ingest` and Helm take a
  `draft` at any time, so a sweep, a tab hide, or a 3 s airplane
  blip mid-answer gets the bubble back. Held in Durable Object memory
  per `sub` (`HeldDrafts`), forgotten on that human's `reply`,
  `error`, or blank `draft`; when the **last crane socket** closes or
  errors (drafts stop, `reply` dials fresh — a fresh-dial socket
  closing while the main one is up does not count); and after
  `HELD_DRAFT_TTL_MS` 60 s with no new words and no `typing` for that
  `sub` — the same life rule as Cab's `DRAFT_TTL_MS`, so a re-sent
  identical draft is never a ghost that outlives the phone's own
  expiry. If the room ever hibernates mid-stream the phone simply
  waits for `reply`, as before. Do not cache a `draft` in the device
  thread store.
- **Fan-out never stops at a stale socket.** `getWebSockets` still
  lists a socket Cab `cancel()`ed after a sweep or a hidden PWA tab
  until the peer answers the close; `send()` on it throws. Every
  Worker fan (`fanOut`) skips non-OPEN sockets and swallows a throw so
  the live sibling still gets the frame. Nothing for a mouth to do.
- **`typing` and `draft` do not spend the crane's rate bucket**
  (`RATE_FRAMES_PER_MIN` is for turns). The crane may refresh
  `typing` every ≤ 4 s through a tool call without bouncing its next
  `reply`.

Cover: `test/worker/mailbox.test.ts`, `test/mailbox/draft.test.ts`,
`test/app/components/chat/PhoneShell.test.tsx` (draft cases).

**Mouth-local, every mouth the same:** the draft **survives a socket
gap** (Cab `setUp(false)`, PWA `onclose` — neither clears it; the
flush `draft` or the `reply` is what changes it) and **expires after
60 s** with no new words and no `typing` (Cab `DRAFT_TTL_MS`, PWA
`DRAFT_TTL_MS` in `lib/mailbox/draft.ts`; the Worker's
`HELD_DRAFT_TTL_MS` is the same number). An identical re-sent draft is
not life on either. Helm: same two rules when it grows drafts. Walk:
[draft_stream_handoff.md](draft_stream_handoff.md).

---

## Seen (what every mouth must do the same)

Reading or answering on one mouth clears the other mouths' cards.
Two signals carry it; both are already on the wire, one is new.

**The signals.**

1. **A sibling `inbound`** (shipped — [sibling_phones.md](sibling_phones.md)).
   The human typed on another mouth. Live (`replay` absent), same
   `sub`, an `id` you did not send. That *is* "read and replied".
2. **A `seen` ack** (new, additive). A phone puts `seen: true` on its
   own `ack` when the thread is on screen there. The Worker copies it
   to the same human's other `sub:<userId>` sockets, never back to
   the sender, never to another human, and forwards the original to
   the crane as before:

   ```json
   { "kind": "ack", "seen": true, "user_id": "1182", "since": "42" }
   { "kind": "ack", "seen": true, "user_id": "1182", "id": "r7" }
   { "kind": "ack", "seen": true, "user_id": "1182" }
   ```

   A plain `ack` (no `seen`) is **delivery**, not reading — Cab acks
   from a background service and on every 2 min sweep — and is never
   copied. A bare `seen` ack (no `since`, no `id`) is copied to
   siblings and **not** forwarded to the crane: nothing to acknowledge.

**What a mouth sends** (the PWA does this; Cab and Helm do the same):

- On connect with the thread on screen: `ack since:<seq> seen:true`
  (the cursor ack it already sends, plus the key). No cursor yet
  (fresh device, empty cache): bare `{ kind: "ack", seen: true }`.
  A PWA socket is only up while the tab is visible, so its connect
  ack is always seen. Cab: only when the phone thread or the car
  thread is on screen (`onResume`, `carThreadVisible`) — **not** from
  the foreground service's redial or the sweep.
- Per live `reply` / `push` painted while the thread is on screen:
  `{ kind: "ack", id, seen: true }`. Not on `replay`; not for a turn
  with no `id`. One ack per live reply is inside the phone's rate
  bucket. That `ack id` also drops the reply's queued row for the
  `sub`, which `ack since` does today — siblings hydrate from the
  transcript, not the queue.
- Cab "Mark as read" / swipe: `{ kind: "ack", seen: true }` (bare)
  when the socket is up, so the PWA (if open) and Helm hear it.

**What a mouth does on hearing one.**

| Signal | Cab (`MailboxService.onFrame`) | PWA | Helm |
| --- | --- | --- | --- |
| `fresh && kind == "inbound" && !replay` | `CabNotifier.dismissKit(this)` | closes its tray via `browserCloseShownNotify` on connect — a live sibling inbound needs the tab visible, which already closed them | same as Cab when it has a card |
| `kind == "ack" && seen` | `CabNotifier.dismissKit(this)`; `Mouth.ingest` may still run its by-id ack (no-op) | `browserCloseShownNotify()` — closes every card the service worker holds (Web Push and local toasts share it) | same |
| plain `ack` | nothing new | nothing new | nothing new |

Cab needs `WireFrame.seen: Boolean?` (parse `true` only), the two
`if`s above, and the two send points. An old APK drops the key and
keeps its card — no lockstep, no crash. Helm: identical shape.

**The honest limit, the other way.** A hidden or closed PWA tab has
**no socket**. Nothing on the mailbox wire reaches it; only Web Push
does. The PWA closes its own cards the moment it is visible (connect →
`browserCloseShownNotify`), so "open the PWA" clears the PWA tray, and
a `seen` from Cab clears it only while the tab is up. Clearing a
closed PWA's tray from Cab would need a **silent Web Push** to the
service worker; Chrome and Firefox charge silent pushes against a
budget and Chrome paints "This site has been updated in the
background" when it runs out. Not doing that. If it ever matters, box
it here first.

Cover: `test/mailbox/seen.test.ts`, `test/worker/mailbox.test.ts`
(seen acks), `test/app/components/chat/PhoneShell.test.tsx` (seen /
tray cases).

---

## Reactions (what every mouth must do the same)

An emoji on a bubble, both ways. Kit reacts to what the human said;
the human reacts to what Kit said. The crane side (kernel `[react 👍]`
token, `ReactionSink`, settle, triage) is
[ai-gantry `docs/reactions.md`](https://github.com/shotah/ai-gantry/blob/main/docs/reactions.md).
This is the wire and the paint.

**One frame, one new `kind`.** Existing fields only.

```json
{ "kind": "react", "user_id": "1182", "id": "m-9f2c", "text": "👍" }
{ "kind": "react", "user_id": "1182", "id": "r1758140000123", "text": "❤️" }
{ "kind": "react", "user_id": "1182", "id": "r1758140000123", "text": "" }
```

- `id` is the bubble reacted to: the human's `inbound` id when Kit
  reacts, Kit's `reply` / `push` id when the human does. Every
  `reply` now carries a crane-stamped id (`r<unix-nanos>`; the Worker
  keeps a supplied id), so there is always something to land on.
- `text` is the emoji set — one, or several space-separated (the
  crane reads `strings.Fields`). **Empty `text` clears.** The Worker
  normalizes whitespace, refuses control characters, caps it at
  `REACTION_TEXT_MAX` (64 bytes), and refuses a `react` with no `id`
  (`error bad frame`).
- **Not a turn.** No `seq`, no `at`, no phone queue row, no Web Push,
  no cursor move, no toast, no haptic. It does not clear `typing` or a
  `draft` — Kit sends its `react` *before* the reply, mid-typing. The
  one queue it touches is crane-bound: a phone's `react` waits for a
  down crane the way an `inbound` does (a drained row carries the
  queue's `seq` / `at`; the crane ignores them).
- Picker and model share one list, `REACTION_PALETTE` in
  `lib/mailbox/react.ts` (= crane `channel.Palette`):
  `👍 👎 ❤️ 🔥 🤣 😢 🤔 🙏 👀 🎉 💯 👏`. The Worker accepts anything
  short and printable so the list can grow without lockstep.

**What the Worker does.**

| From | Worker | Rate |
| --- | --- | --- |
| crane `react` (`user_id` required) | Validate; store `r:<sub>` → `{ id: emoji }`; fan to every `sub:<user_id>` socket | off the bucket, like `typing` |
| phone `react` | Stamp `user_id`; validate; store `r:<sub>`; fan to the human's **other** `sub:` sockets (not the sender); fan to the crane. No crane socket up → queued for the crane like an `inbound` (`q:crane:<bubble id>`, so a second reaction on the same bubble replaces the first — latest wins; drained on the crane's next connect; queue TTL applies). The crane then runs its reaction turn late — accepted | in the phone's bucket |
| phone connect flush | After the transcript replay, one `react` per stored reaction whose bubble was just replayed, with `replay: true`, in thread order | — |

`r:<sub>` keeps only ids the transcript still has (pruned on every
write; `REACTIONS_MAX` 200 hard cap; a clear deletes). A reaction on a
broadcast `push` sits in the reacting human's `r:<sub>`, never in a
shared row, so Ada's 👍 is not Bob's.

**What a mouth does on hearing one** (live or `replay`): find the
bubble by `id`; set its chip to `text`; empty → remove the chip. No
bubble with that id → drop it. Never paint a `react` as a bubble.

**What a mouth sends.** Long-press (450 ms hold, cancelled by a
10 px drag) or right-click on one of Kit's `reply` / `push` bubbles
→ palette → `{ kind: "react", id, text: emoji }`. Paint the chip at
once. Tap the chip to reopen; picking the emoji already set sends
`text: ""` (clear). No picker on your own bubbles, a `draft`, or a
bubble with no `id`. Socket down → do nothing (no optimistic paint
that hydrate would contradict).

Where each mouth stands:

- PWA — shipped. `Thread.tsx` (chip, hold / context-menu picker,
  `canReact`), `PhoneShell` (`react` in → `reaction` on the bubble;
  `onReact` out). The device thread cache keeps `reaction` with the
  bubble.
- Cab — shipped in tree (`mailbox/React.kt`, `Mouth.applyReaction`,
  `ui/ChatTurn.kt`; `ReactTest` / `MouthTest` / `ChatTurnTest`).
  - [x] **`ignoredKind` first.** `Mouth.ingest` lands a `react` on
        the named bubble and never paints a stray bubble.
  - [x] **Paint.** `ChatLine.reaction`; `react` in → set / clear by
        id (live and `replay`); chip on the bubble.
  - [x] **Send.** 450 ms hold (10 px cancel) on a Kit bubble → the
        same palette → `react` out; tap the chip to reopen; picking
        the set emoji clears. Auto read-only.
  - [x] **Do not** notify, buzz, or move the `since` cursor on a
        `react` (`movesCursor`); it does not clear the draft.
- Helm — shipped in tree. Context menu on the bubble is the iOS shape.
  CarPlay read-only.
  - [x] **`ignoredKind` first.** `Mouth.ingest` lands a `react` on the
        named bubble and never paints a stray bubble.
  - [x] **Paint.** `ChatLine.reaction`; chip on the bubble.
  - [x] **Send.** Context menu on a Kit bubble → the same palette →
        `react` out. CarPlay read-only.
  - [x] **Do not** notify or move the `since` cursor on a `react`.

Cover: `test/mailbox/react.test.ts`, `test/worker/mailbox.test.ts`
(Mailbox reactions), `test/app/components/chat/Thread.test.tsx`
(Thread reactions), `test/app/components/chat/PhoneShell.test.tsx`
(react in / out).

---

## Aims board (what every mouth must do the same)

The crane keeps a goals ledger — aims, day scores, streaks, ratings
([ai-gantry `docs/aims-progress.md`](https://github.com/shotah/ai-gantry/blob/main/docs/aims-progress.md)).
The phone does not open `gantry.db` and does not query for it. The
crane **pushes a snapshot** the way it pushes `cmds`; the mailbox
keeps the latest and replays it on connect; a mouth paints it. The
only way back into the harness is the `/aims` slash command the crane
already answers, as an ordinary visible turn.

**One frame, one new `kind`.** This is the wire the crane's `board.go`
must emit — the pendant parser (`lib/mailbox/aims.ts`) is the contract
until the crane ships, so its json tags are these names:

```json
{
  "kind": "aims",
  "aims": [
    {
      "area": "training",
      "sentence": "gym 3 mornings/wk",
      "rating30": 1.4,
      "sum7": 6,
      "streak": 2,
      "note": "asked",
      "note_at": "2026-09-25",
      "days": [
        { "day": "2026-09-22", "score": 2, "events": [411] },
        { "day": "2026-09-23", "score": -1, "events": [413] },
        { "day": "2026-09-24", "score": 0, "events": [] },
        { "day": "2026-09-25", "score": 3, "events": [415] },
        { "day": "2026-09-26", "score": 0, "events": [416] }
      ],
      "weeks": [
        { "start": "2026-09-13", "mean": 0.9, "up": 3, "against": 1, "metrics": [] },
        { "start": "2026-09-20", "mean": 1.4, "up": 4, "against": 1,
          "metrics": [{ "metric": "weight", "mean": 191.4, "unit": "lb", "n": 3 }] }
      ],
      "slope": 0.3,
      "block": { "days": 10, "up": 4, "against": 2, "mean": 0.4, "pct": 0.4 },
      "effect": { "a": "training", "b": "", "metric": "weight", "r": -0.42, "n": 9 }
    }
  ],
  "links": [
    { "a": "training", "b": "weight", "r": 0.38, "n": 12 }
  ]
}
```

- `aims` is the whole board, oldest aim first, **cap 5** (the `[aims]`
  cap). Extra rows are dropped. `{ "kind": "aims", "aims": [] }` is a
  real frame — the mouth clears its screen.
- Required per row: `area` (the `aim/<area>` key, `[a-z0-9_-]`),
  `sentence`, `rating30` (30-day mean day score, `-3.0 … +3.0`),
  `sum7`, `streak`, `note` (`nudged | asked | offered | praised |
  quiet | ""`), `days` (oldest first; an empty day is `score 0,
  events []`, up to 14 cells; `events` are ledger ids the human can
  quote in `/aims <area>`).
- Optional per row, `omitempty`: `note_at` (local `YYYY-MM-DD`);
  `weeks` (Sunday-start local buckets from the aim's first event,
  oldest first, cap 13 — the crane's `Weeks`; each `{ start, mean, up,
  against, metrics[] }`, `metrics` one entry per (metric, unit) as
  logged: `{ metric, mean, unit, n }`); `slope` (`WeekSlope`, score
  per week, only when it has two or more weeks); `block` (`{ days, up,
  against, mean, pct }`, only when a block row exists); `effect`
  (`{ a, b, metric, r, n }` — the aim's `Effect`, only when
  `StampCorr`: `|r| ≥ 0.3`, `n ≥ 8`). **A missing line means too
  early; the screen says nothing.** A half-formed `block` / `effect` /
  week is dropped whole.
- Optional on the frame, `omitempty`: `links` — the cross-aim
  `NextDay` lines that sit under all aims in `/aims`: `{ a, b, r, n }`,
  strongest `|r|` first, **cap 3**, only the ones that pass
  `StampCorr`. `a`, `b` are areas on this board; `a == b` is dropped.
- Optional `user_id`: with it the board is that human's (stored
  `aims:<sub>`, fanned to their `sub:` sockets); without, the room's
  (stored `aims`, fanned to every phone). On connect a mouth gets its
  human's board if one exists, else the room's. The crane plan sends
  it room-wide after `cmds`; the `user_id` form is there for a
  multi-human room later.
- Crane only. A phone `aims` is `error bad frame`. Not a turn: no
  `seq`, no queue, no Web Push, no cursor move, no toast. Counted in
  the crane's bucket like `cmds` (it is sent on dial and after a ledger
  write, not per turn).

**When the crane sends it.** On dial, after `cmds`. Again after any
turn or cron push where the rendered board differs from the last one
sent on that connection (`aim_log`, an aim `memory_store`, a forget
cascade, `/aims block`). Not on an ordinary chat turn.

**What a mouth does.**

- On `aims`: replace its board with `aims`; empty → hide the screen.
- The screen is optional and **hidden when the board is empty**. PWA:
  a target button in the header → a drawer, one card per aim: `area`
  and `rating30` signed, the
  sentence, the day grid (sign is the hue, magnitude the weight, an
  eventless day an outline, the score under each cell), the stamp line
  exactly as `[aims]` carries it (`30d +1.4 · 7d +6 · streak 2 ·
  asked`), the week strip when `weeks` is there (one bar per bucket
  around a zero line, oldest left), then the trend line when present
  (`slope +0.3/wk · block 4/10 (40%) · weight r -0.42 (n 9)`). Under
  all cards, one line per `links` entry: `training → next-day weight r
  +0.38 (n 12)` — the same words as the `/aims` footer.
- Every button is a turn: "Ask Kit about `<area>`" sends `/aims
  <area>`; "Full report" `/aims`; "Rubric" `/aims rubric`. The drawer
  closes so the answer is in view. Nothing is asked silently — the
  human sees what they asked.
- Never paint an `aims` frame as a bubble. Never notify or buzz on it.
- **The badge is a call to action, not the board size.** The header
  button carries a number only for aims that differ from the board the
  human last had the drawer open on — new, changed, or gone. Opening
  the drawer marks the current board seen (and a board that lands
  while it is open). The seen board persists on the device
  (`pendant.aimsSeen`, area → row JSON), so the mailbox replaying the
  same board on reconnect shows nothing. A never-seen board counts
  whole.

Where each mouth stands:

- PWA — shipped. `lib/mailbox/aims.ts` (parse, caps, `signed`,
  `statsLine`, `linkLine`), `lib/phone/boardSeen.ts` (`changedRows`
  keyed by area, seen pref — shared with the tasks board),
  `GoalsBoard.tsx` (`GoalsButton`, `GoalsSheet`, week strip),
  `PhoneShell` (`aims` in → state; asks go through `sendText`).
  Waiting on the crane to send the frame — ai-gantry
  `docs/aims-progress.md` → Pendant frame.
- Cab — shipped in tree (2026-09-26), waiting on the crane frame.
  - [x] **`ignoredKind` first.** `Mouth.ingest` handles `aims` before
        the bubble path and returns `false`; `movesCursor` excludes
        it. A `text` key on the frame is ignored.
  - [x] **Paint.** `mailbox/Aims.kt` parses the rows above with the
        same caps (5 / 14 / 13 / 3), drops a bad row not the board,
        drops a half-formed `block` / `effect` / week whole; `[]` is a
        clear, a missing array keeps the last board. `ui/GoalsBoard.kt`:
        header target whenever the board has rows (badge rule below); sheet
        with one card per aim (signed `rating30`, sentence, day grid,
        stamp line, week strip, trend line), then the `links` lines —
        same words as `/aims`. **Auto: nothing.**
  - [x] **Ask.** `/aims <area>` / `/aims` / `/aims rubric` through the
        normal send; the sheet closes. `AimsTest` / `MouthTest` /
        `GoalsBoardTest`.
  - [x] **Badge = changes, not count.** `SharedPreferences("cab")["aimsSeen"]`
        keeps area → row JSON of the board last opened (`seenAims` /
        `encodeSeenAims` / `parseSeenAims` in `mailbox/Aims.kt`);
        `changedAims` counts new + changed + gone, a never-seen board
        whole. The target is painted whenever the board has rows; the
        `Badge` and the `goals (n)` label appear only when `changedAims
        > 0`, else a bare `goals`. Opening the sheet marks seen, and so
        does a board that lands while it is up (`LaunchedEffect(goalsOpen,
        aims)`). `AimsTest.badgeCountsChangesSinceTheLastOpenNotAims`.
- Helm — shipped in tree. CarPlay: nothing.
  - [x] **`ignoredKind` first.** `Mouth.ingest` handles `aims` before
        the bubble path; `movesCursor` excludes it.
  - [x] **Paint.** `Sources/Mailbox/Aims.swift` and `app/Helm/HelmGoals.swift`.
        Header target when the board has rows. CarPlay: nothing.
  - [x] **Ask.** `/aims <area>` / `/aims` / `/aims rubric` through the
        normal send; the sheet closes.
  - [x] **Badge = changes, not count.** `UserDefaults("helm")["aimsSeen"]`.
        Opening the sheet marks seen, and so does a board that lands
        while it is up.

Cover: `test/mailbox/aims.test.ts`, `test/phone/boardSeen.test.ts`,
`test/worker/mailbox.test.ts` (Mailbox aims board),
`test/app/components/chat/GoalsBoard.test.tsx`,
`test/app/components/chat/PhoneShell.test.tsx` (goals board, badge).

---

## Tasks board (what every mouth must do the same)

The crane keeps the human's pocket list — one memory row per task,
`todo/<slug>`, the words, gone when done
([ai-gantry `docs/tasks.md`](https://github.com/shotah/ai-gantry/blob/main/docs/tasks.md)).
Built the way the aims board is: the crane **pushes a snapshot**, the
mailbox keeps the latest and replays it on connect, a mouth paints it.
The one write the phone makes is the checkbox, and it is an ordinary
visible turn: `/todo done <id>`. Adding is plain words to Kit, who
names the row; there is no `/todo add`.

**One frame, one new `kind`.** Field names are the crane's json tags
(`docs/tasks.md` §4.4); the pendant parser is `lib/mailbox/todo.ts`.

```json
{
  "kind": "todo",
  "todo": [
    { "id": 412, "slug": "dentist",  "text": "call to book a cleaning", "at": "2026-09-23" },
    { "id": 418, "slug": "passport", "text": "renew, by Oct 15",        "at": "2026-09-26" }
  ]
}
```

- `todo` is the whole list, **oldest `updated_at` first** — the thing
  that has sat nine days is the one to say out loud. The crane does
  not cap the frame (the `[todo]` stamp is what is capped at 5); the
  phone tolerates 100 and drops the rest. `{ "kind": "todo", "todo":
  [] }` is a real frame — the drawer clears.
- Per row: `id` (the memory row id — positive integer; what the
  checkbox sends back; **changes when the words change**), `slug` (the
  key after `todo/`, `[a-z0-9][a-z0-9_-]*`, the identity across
  rewrites), `text` (the action in the human's words, whitespace
  collapsed, ≤ 240 runes; "by Friday" stays in here — there is no due
  field), `at` (local `YYYY-MM-DD` last written; the phone computes
  the age, the crane does not send it). A row missing `id`, `slug`, or
  `text`, or repeating either key, is dropped — the row, not the list.
- **Priority** rides in the words: a marker leading `text` — `!!`
  urgent, `!` high, none normal (`"!! file the extension"`), the
  crane's own notation and what `[todo]` sorts by. The Worker passes
  `text` through as sent. An optional additive `priority` key
  (`"urgent"` | `"high"`; anything else is ignored) is also kept and
  wins over the marker when both are present; old mouths drop it.
  A mouth strips the marker for display (`!!` alone, or `!` inside the
  words, is not a marker — words stay as they are).
- `user_id` optional: without it the list is the room's (`todo`); with
  it, that human's (`todo:<sub>`), which wins on connect.
- Dial order from the crane is `cmds`, `aims`, `todo`, `allow`; the
  Worker replays in that order too. Sent again only when the rendered
  JSON changed — after the turn that stored, rewrote, or forgot a row.

**What a mouth does.**

- On `todo`: replace its list with `todo`; empty → hide the screen.
  Any rows it had ticked locally are settled by the new list.
- The screen is optional and **hidden when the list is empty**. PWA:
  a check-square button in the header → a drawer, one checklist row
  per task: an unticked box, the words, then `#412 · dentist · 3d ago`
  (id, slug, age after the first day — the same rule as the stamp).
  The priority mark is painted **ahead of the words, not inside them**
  — `!!` in the danger colour, `!` in the accent mark colour, nothing
  for normal — and the checkbox is named by the clean words.
  Past 10 open, the footer says `14 open — a pocket list; prune, or
  use a tracker`, the `/todo` footer's words.
- **Order is urgent, then high, then the rest; oldest first inside a
  tier** — the `[todo]` stamp's order. The frame itself still arrives
  oldest first; the mouth sorts at paint and never rewrites the list it
  holds (the badge, the ticks, and the stored board keep frame order).
- **The checkbox is the one kernel write.** Tap → send `/todo done
  <id>` as a visible turn; the row shows ticked and struck through and
  will not send twice; **the drawer stays open** so several can be
  ticked. The next `todo` frame removes the row (or un-ticks it if the
  kernel answered `#418 is gone — the list was updated`, in which case
  the new board is the truth anyway). Nothing is asked silently.
- Adding: a text field, "in your words". Submit sends plain text —
  `add to my list: <words>` — not a slash command; Kit names the slug
  and stores the row, and the next board paints it. "Full list" sends
  `/todo`. Both close the drawer so the answer is in view.
- **The badge is a call to action, not the list size.** Same rule as
  the goals board, keyed by **slug** (a rewrite changes the id, not the
  task): count of tasks that differ from the list the human last had
  the drawer open on — new, changed, or gone. Opening marks seen; so
  does a list that lands while open. Persists on the device
  (`pendant.todoSeen`).
- Never paint a `todo` frame as a bubble. Never notify or buzz on it.
  No other reorder — priority, then oldest first, everywhere.

Where each mouth stands:

- PWA — shipped. `lib/mailbox/todo.ts` (parse, caps, `ageLabel`,
  `todoDoneCommand`), `lib/phone/boardSeen.ts` (`changedRows` keyed
  by slug), `TasksBoard.tsx` (`TasksButton`, `TasksSheet`),
  `PhoneShell` (`todo` in → state + pending ticks; the checkbox and
  the add field go through `sendText`). Waiting on the crane to send
  the frame — ai-gantry `docs/tasks.md` §9 Phase 1.
  - [x] **Priority** (2026-10-09). `lib/mailbox/todo.ts`:
        `todoPriority` (the `priority` key, else the `!!` / `!` marker
        leading `text`, else normal), `todoWords` (marker stripped),
        `priorityMark`, `sortTodo` (urgent, high, rest; stable).
        `parseTodoBoard` keeps a valid `priority` key and leaves `text`
        as sent, so the Worker fan-out is unchanged for Cab and Helm.
        `TasksSheet` sorts at paint; `TaskRow` paints the mark ahead of
        the words and names the checkbox by the clean words. Dev sample
        `passport` carries `!`. `test/mailbox/todo.test.ts`,
        `test/app/components/chat/TasksBoard.test.tsx`.
- Cab — shipped in tree (2026-09-26), waiting on the crane frame.
  - [ ] **Priority.** Same rules as the PWA box above: read the marker
        (or the key), strip it for display, sort urgent / high / rest
        with oldest first inside a tier, paint the mark ahead of the
        words. In progress in the Cab checkout.
  - [x] **`ignoredKind` first.** `Mouth.ingest` handles `todo` before
        the bubble path and returns `false`; `movesCursor` excludes it.
        A `text` key on the frame is ignored.
  - [x] **Paint.** `mailbox/Todo.kt` parses the rows above (id / slug /
        text / at rules, cap 100, drop the row not the list; `[]` is a
        clear, a missing array keeps the last list). `ui/TasksBoard.kt`:
        header check-square only when the list has rows; sheet with one
        checklist row per task (box, words, `#id · slug · age`); the
        pocket-list footer past 10. **Auto: nothing.**
  - [x] **Tick and add.** Checkbox → `/todo done <id>` through the
        normal send, row ticked and struck through until the next
        `todo` frame (`settleTicked`), a second tap does not send, the
        sheet stays open; add field → `add to my list: <words>` plain
        text and "Full list" → `/todo`, both close the sheet.
  - [x] **Badge = changes, not count**, keyed by slug
        (`changedTodo` / `seenTodo`), seen kept in
        `SharedPreferences("cab")["todoSeen"]`, same shape as `aimsSeen`.
        Marked seen on open and while open. `TodoTest` / `MouthTest` /
        `TasksBoardTest`.
- Helm — shipped in tree. CarPlay: nothing.
  - [x] **`ignoredKind` first.** `Mouth.ingest` handles `todo` before
        the bubble path and returns `false`; `movesCursor` excludes it.
  - [x] **Paint.** `Sources/Mailbox/Todo.swift` parses the rows (id /
        slug / text / at, cap 100, drop the row not the list).
        `app/Helm/HelmTasks.swift`: header check-square only when the
        list has rows. CarPlay: nothing.
  - [x] **Tick and add.** Checkbox → `/todo done <id>`, sheet stays
        open; add → `add to my list: <words>` and "Full list" → `/todo`,
        both close.
  - [x] **Badge = changes, not count**, keyed by slug
        (`changedTodo` / `seenTodo`), `UserDefaults("helm")["todoSeen"]`.
        Marked seen on open and while open. `TodoTests`.
  - [ ] Same four items, plus priority. CarPlay: nothing. Tracked with
        the rest of the iPhone backlog in Cab `docs/helm_parity.md`.

Cover: `test/mailbox/todo.test.ts`, `test/phone/boardSeen.test.ts`,
`test/worker/mailbox.test.ts` (Mailbox tasks board),
`test/app/components/chat/TasksBoard.test.tsx`,
`test/app/components/chat/PhoneShell.test.tsx` (tasks board).

---

## Photos (what every mouth must do the same)

Source of truth: `lib/mailbox/caps.ts`, `lib/phone/photo.ts`,
`app/lib/jpegFromFile.ts`, `lib/phone/sendError.ts`. Cab mirrors in
`mailbox/Photo.kt`, `mailbox/Jpeg.kt`, `mailbox/JpegIo.kt`,
`mailbox/SendError.kt`. Helm mirrors in `Sources/Mailbox/Photo.swift`,
`Jpeg.swift`, `SendError.swift`.

**Wire.** One `images: [{ url }]` per frame, `url` a
`data:image/jpeg;base64,…`. Caption and photo travel **together**: the
PWA encodes on attach, holds the data URL on the draft, and Send emits
one `inbound` with `text` and `images[0]`. Attaching never sends by
itself (no empty-text turn ahead of the caption). Cab has its own
compose; if it stages the same way the mailbox needs nothing new. The mailbox measures the **data URL**
(`utf8Bytes(url) ≤ IMAGE_BYTES_MAX` = 1 500 000) and the whole frame
(`≤ FRAME_BYTES_MAX` = 2 000 000). Base64 is 4/3 of the bytes, so the
**raw JPEG budget is `PHOTO_JPEG_BYTES_MAX`** = `floor((1 500 000 − 32) / 4) × 3`
= 1 124 976. Encoding to 1.5 MB raw passes a client check and fails on
the wire as `too large`.

**Rate.** Byte bucket is `RATE_BYTES_BURST` = 2 × `FRAME_BYTES_MAX`
deep (two full photos back to back), refilling `RATE_BYTES_PER_MIN`
= 256 KB/min; frames 30/min. Before this the burst was 256 KB and every
camera shot bounced as `rate` forever — that was the "photo never
lands" bug on both mouths.

**Encode ladder** (`jpegFromFile`): draw at the chosen long edge, try
quality 0.9 → 0.8 → 0.7 → 0.6; if still over budget, edge × 0.75 and
repeat; floor 320 px, then give up with `too large`. Pass-through only
for a JPEG already ≤ edge and ≤ budget. Cab runs the same ladder:
`shrinkSteps` / `shrinkToFit` in `mailbox/Photo.kt` (pure, tested
against the same 1600 → 1200 / floor-380 cases as
`test/app/lib/jpegFromFile.test.ts`), driven by `jpegFromUri` in
`mailbox/JpegIo.kt` with `PHOTO_JPEG_BYTES_MAX` as the budget. Helm
runs the same `shrinkSteps` / `shrinkToFit` in `Photo.swift`. Start at
`min(edge, image)` — never upscale.

**Photo size** (Settings, per device, not on the wire). Long edge:

| Id | Edge | Why |
| --- | --- | --- |
| `full` | 1600 | old cap; models clamp near 1 MP so this mostly buys bytes |
| `medium` | 1024 | **default**; reads receipts and signs |
| `small` | 640 | "is this a plant" |

Vision tokens track pixel area (~w·h/750), not JPEG bytes — that is why
this is an edge knob and not a quality knob. PWA stores it at
`localStorage["pendant.photo"]`; Cab stores the same id at
`SharedPreferences("cab")["photo"]` (`CabPrefs.photoSize`) and reads
the table from `PHOTO_SIZES` in `mailbox/Photo.kt`; Helm stores it at
UserDefaults `helm` / `photo` (`photoSizes` in `Photo.swift`) — same
ids, same edges, same `Medium · 1024 px` chip text, so the mouths
agree on what "Medium" means. Change the table here, change it there.

**Errors.** The mailbox answers a refused frame with
`{ kind: "error", text, id }` where `text` is a token — `rate`,
`too large`, `bad frame` — and `id` (additive) is the refused frame's
id when the frame parsed. Paint it on **your own bubble** as "not
sent", never as a turn from the crane, and do not move the `since`
cursor from it. PWA strings: `lib/phone/sendError.ts`. Pre-wire
failures (`bad photo` = decoder, `too large` = ladder bottomed out)
are local; say so in the mouth.

Cab does the same: `Mouth.fail(id, why)` is `failInThread` (match your
bubble by `id`, else your newest still `pending`; crane bubbles are
never marked), `ChatLine.failed` paints red under the bubble, strings
are copied in `mailbox/SendError.kt` (`describeSendError`,
`describePhotoError`). `movesCursor(kind)` in `mailbox/Thread.kt`
(and Helm `Thread.swift`) keeps `ack` and `error` off the `since`
cursor — before that an `error` with `id` would have made a native
mouth resume from the refused id on a fresh session. A refusal with
no matching bubble (a bare pin) falls back to the old hint line.
Keep the token strings stable; every mouth switches on them.

The Worker echoes `id` on every refusal that has one: parse errors after
JSON.parse (`too large` image, extra image, bad kind), then `rate` and
the post-parse `bad frame` checks. Junk that never parses (oversize
whole frame, not JSON) still has no id — mouths fall back to newest
pending.

---

## Language (what every mouth must do the same)

Source of truth: `lib/phone/lang.ts` (`LANGUAGES`), `lib/phone/prefs.ts`
(`pendant.lang`), `lib/tts/http.ts` (`parseTtsBody`, `voiceFor`),
`app/api/tts/route.ts`. Why voice is mouth-local: [voice.md](voice.md).

One dropdown in Settings. It answers two questions on the device —
what the hold-to-talk recognizer listens for, and what language Kit's
voice speaks — and nothing else. It is **not** a `context` key, not a
frame, and the Durable Object never sees it. The crane answers in
whatever language it was spoken to (persona `language` on Gantree is
free text and separate); this knob only makes the mouth hear and say
those words correctly.

| Id | Label | Recognizer (BCP-47) | Google TTS locale |
| --- | --- | --- | --- |
| `en` | English | `en-US` | `en-US` |
| `ja` | 日本語 · Japanese | `ja-JP` | `ja-JP` |
| `zh` | 中文 · Mandarin | `zh-CN` | `cmn-CN` |
| `vi` | Tiếng Việt · Vietnamese | `vi-VN` | `vi-VN` |

**Default `en`.** Junk or missing in storage is `en`. Chirp 3 HD spells
Mandarin `cmn-CN`; every recognizer wants `zh-CN`. That is why the row
carries both — do not send the recognizer tag to the Worker.

**Pref.** PWA `localStorage["pendant.lang"]` = the id. Cab should store
the same id at `SharedPreferences("cab")["lang"]`, Helm at UserDefaults
`helm` / `lang` — same four ids, same labels, same table, like
`pendant.photo`. Only shown when the Worker publishes voice
(`/api/auth/config` `voice: true`); without voice the dropdown has
nothing to drive.

**Voice in.** PWA `HoldToTalk` → `listen(..., { lang })` →
`SpeechRecognition.lang = "ja-JP"`. Cab handheld: the same BCP-47 on
`RecognizerIntent.EXTRA_LANGUAGE` (and `EXTRA_LANGUAGE_PREFERENCE`).
Helm: `SFSpeechRecognizer(locale: Locale(identifier: "ja-JP"))`.
Auto / CarPlay already did host STT; this does not touch the car.

**Voice out.** `POST /api/tts` body grows one **additive** key:

```json
{ "text": "今夜は雨です。", "lang": "ja" }
```

The Worker keeps `TTS_VOICE` as *who* talks and swaps the locale for
*what language*: `en-US-Chirp3-HD-Leda` + `ja` → `ja-JP-Chirp3-HD-Leda`;
`zh` → `cmn-CN-Chirp3-HD-Leda`. Chirp 3 HD ships every speaker in every
locale, so the same voice follows the human across languages. A
`TTS_VOICE` already in that language is kept (`en-GB-…-Puck` stays
British for `en`). Missing or unknown `lang` (`"ja-JP"`, a number, an
old mouth that posts `{ text }`) is **dropped, not refused** — the
reply still speaks in the Worker's configured voice. Cab and Helm
reuse the route with their Bearer session and send the id they
stored; nothing else changes on their side of `/api/tts`.

**Not this walk.** `context.lang` on the frame so the crane sees the
pick — additive if ever wanted, and then Cab / Helm would send it too.
Today the crane already answers in the language it was addressed in.
Growing the set is one row in `LANGUAGES` here plus the same row in
Cab / Helm; the Worker side needs nothing new as long as the locale is
one Chirp 3 HD ships.

---

## Face, backdrop, and theme (what every mouth must do the same)

Source of truth: `lib/avatar/{jpeg,http,store}.ts`,
`lib/backdrop/{http,store}.ts`, `lib/theme/{catalog,store}.ts`,
`lib/auth/slugRoute.ts`, `worker/mailbox.ts` (`blobHttp`, `themeHttp`).
Who calls the blobs and why: [agent_ui_controls.md](agent_ui_controls.md).

Two JPEG **blobs on the room**, one per crane slug. They are not chat
turns: `images[]` on a frame is a photo *in the thread*; these are what
the thread looks like. Every human in the room sees the same face and
the same wallpaper.

**HTTP.**

| | Face | Backdrop |
| --- | --- | --- |
| Route | `GET` / `POST /api/avatar?slug=<slug>` | `GET` / `POST` / `DELETE /api/backdrop?slug=<slug>` |
| Body (POST) | raw `image/jpeg`, or multipart `file` | same |
| Cap | `AVATAR_MAX_BYTES` 5 MiB (dropping to 1.5 MB — DO rows are 2 MB) | `BACKDROP_MAX_BYTES` = 1 500 000 |
| Gate | JPEG magic (`FF D8 FF`), ≥ 32 bytes | same |
| GET | `image/jpeg`, `X-Pendant-Rev: <rev>`, `ETag: "<rev>"`, `Cache-Control: private, max-age=0, must-revalidate`; **404** when none | same; 404 after `DELETE` |
| Conditional GET | `If-None-Match: "<rev>"` → empty **304** with the same `X-Pendant-Rev` / `ETag` when the rev is current (additive; a client that never sends it always gets 200 + bytes) | same |
| Cache bust | `?v=<rev>` | `?v=<rev>` |
| 400 body | `{ "error": "image too large (max 5MB)" \| "need a JPEG …" \| "file required" }` | `{ "error": "image too large (max 1.5MB)" \| … }` |

Auth is one door for both (`withSlug`): a **listed** phone (PWA cookie
or Cab `Authorization` JWE), or the **crane bearer** on
`Authorization: Bearer …` — header only, `?bearer=` is refused for the
crane. Spike `?secret=` is loopback. Denies are the shared
`{ "error": "unauthorized" }` 401 / 403, `{ "error": "config" }` 503,
`{ "error": "bad slug" }` 400. The bearer is bound to one slug, so the
crane can only repaint its own room.

**Notices.** When a blob changes the Durable Object sends one frame to
**every** socket in the room (crane included — it ignores frames with
no `user_id`):

```text
{ "kind": "face",     "text": "<rev>" }     // legacy shape, keep it
{ "kind": "backdrop", "rev": <int> }        // rev 0 = cleared; NO text
{ "kind": "theme",    "theme": "<id>" | null }  // null = cleared; NO text
```

| Rule | Why |
| --- | --- |
| None of these are a `FrameKind`. A phone that sends one gets `error` `bad frame` | They originate on the DO, not the wire |
| Not queued, no `id` / `seq` / `at`, not in the transcript | A reconnect must not replay "face changed" |
| Do not move the `since` cursor; do not toast / HUN / haptic / badge | Not a turn |
| `backdrop` and `theme` have **no `text`** | A mouth that predates them must drop them. Cab `Mouth.ingest` paints any frame with text as a bubble — a rev or theme id in the thread on every old APK. The face notice predates this rule; do not "fix" it |
| `rev` is a safe integer ≥ 0; junk → ignore the frame | Same bar as `orderSeq` |
| `theme` is a known catalog id, or JSON `null` to clear; junk → ignore | Catalog: boom, paper, ink, marquee, lemonade, neon, fizz, rain, mist, fuse, grit, siren, flare, static, flicker. Retired ids (`inlay`, `lamp`, `noir`, `ember`, `tide`, `bloom`, `chalk`, `foam`, `petal`) are junk |

**Paint.** On `face` → refetch `GET /api/avatar?slug&v=<rev>` and swap
the header circle (PWA `KitAvatar`, Cab `ui/KitAvatar.kt`). On
`backdrop` → refetch `GET /api/backdrop?slug&v=<rev>`; 404 or `rev: 0`
paints **nothing** — the theme canvas is the fallback. Fetch on connect
too (no `v`) so a fresh session gets the current one without a notice.

**Keep the last one.** A fresh load should not open on the fallback
icon and a bare canvas while the JPEGs download. The PWA keeps the last
bytes plus their rev per slug in IndexedDB (`app/lib/blobUrl.ts`,
`look:avatar:<slug>` / `look:backdrop:<slug>`), paints that first, and
fetches with `If-None-Match: "<rev>"` — 304 keeps the paint, 200 swaps
and re-stores, 404 drops the row, a failed fetch leaves the cached
  paint. No rev, secret, or bearer in the key. Cab `BlobCache` keeps
  `{ rev, bytes }` per slug on disk and `AvatarApi` sends
  `If-None-Match: "<rev>"` — 304 keeps the paint, 200 swaps, 404 drops
  the row.
Wallpaper goes **behind the thread only**, cover-fit, dimmed so bubbles
stay legible (PWA: 60 % opacity over `--canvas`; Cab: `Modifier.alpha(0.6f)`
behind `ChatScroll`; header and compose stay panel). It is a per-device
choice to show it: PWA `localStorage["pendant.backdrop"]`, Cab
`SharedPreferences("cab")["backdrop"]` (`on` default / `off`). Off means
**no fetch**, not a hidden image. **Not** on Android Auto.

On `theme` → if the human is following Kit, paint that catalog id
(PWA `paintTheme`, Cab `paintedTheme`). `theme: null` falls back to the
human's pick. Follow is a per-device pref: PWA
`localStorage["pendant.followTheme"]`, Cab
`SharedPreferences("cab")["followTheme"]` (on default / only `"off"`
keeps yours). A human tapping a theme chip turns follow off and claims
that id. Fetch `GET /api/theme?slug=` on connect so a fresh session
sees Kit's mood without waiting for a notice. HTTP 5xx leaves the last
known room id; `{ "theme": null }` is a real clear.

**Cab.** `faceRev` / `backdropRev` / `roomTheme` on `Mouth` — ingest
returns `false`, `shouldSpeak` stays false, `movesCursor` excludes
`face` / `backdrop` / `theme`. `Look.kt` `THEME_IDS` matches
`lib/theme/catalog.ts` (hexes in `CabPalette.kt`). `ThemeApi` GETs the
room; `AvatarApi.fetch(..., path="/api/backdrop")` GETs the wallpaper.

### Header face

Kit picks the picture; the header circle is the room's face, not a tiny
chrome icon. A 40 px chip is easy to miss when the JPEG changes — the
swap is the event. Same layout on every handheld mouth. Auto HUNs do
not care.

| | Value |
| --- | --- |
| Size | 82 px / 82.dp (PWA `KitAvatar` `xl`) |
| Header row | Do **not** grow the bar. Layout slot is 40 px tall × 80 px wide so the name shifts right of the circle |
| Hang | Align the circle to the **top** of that slot, then nudge **-2 px x / -4 px y** so it sits in the header padding. Overlaps the thread (~24 px). z-order above bubbles |
| Stroke | 2 px in theme `line` (PWA `border-line`; Cab `CabPalette.line` / `outlineVariant`). Not `panel`, not a shadow ring |
| Empty / Google door | Stay the centered hero (PWA 64 px, Cab 72.dp). Those do not hang |

PWA: `PhoneShell` header. Tap the header circle (only once the human
is in the room) and a sheet offers copy, download, or replace. Copy
puts the picture on the clipboard as a PNG. Download saves
`<slug>-avatar.jpg` (or the type that is actually on screen, including
the pendant glyph when no JPEG is stored). Replace is the same
`POST /api/avatar`. Empty and Google-door heroes stay static. Cab and
Helm do not get this sheet — no new frame or field.

Cab already hangs the same way: 82.dp
`KitAvatar`, 40×80 `navigationIcon` slot (empty — the circle is not
inside the bar), nudge **-2.dp x / -4.dp y**, 2.dp `line` stroke. The
avatar is a Scaffold overlay (`zIndex` above the bar) so `TopAppBar`
clip never eats it. `DocsShot.kt` `paintHeader` uses the same 82 /
80×40 / −2/−4 numbers. Helm hangs the same numbers in `Look.swift`
(`headerFaceSize` / slot / nudge / stroke) as a header overlay, not
inside the bar.

---

## Theme (what every mouth must do the same)

Source of truth: `lib/theme/{catalog,store,contrast}.ts`,
`app/lib/theme.ts`, `app/api/theme/route.ts`, `worker/mailbox.ts`
(`themeHttp`). Why, and how the agent picks without seeing the screen:
[agent_ui_controls.md](agent_ui_controls.md).

One **id per room**, from a closed catalog. Not raw hex. Every human
who follows Kit sees the same mood. The human can unfollow and keep
their own pick (`pendant.followTheme`, default on) — same shape as
Backdrop.

**HTTP.**

| | Theme |
| --- | --- |
| Route | `GET` / `POST` / `DELETE /api/theme?slug=<slug>` |
| Auth | same door as the face (`withSlug`) |
| GET | `{ "theme": "<id>" \| null, "themes": [ { id, label, feel, scheme, mood, canvas, accent } ] }` |
| POST | `{ "theme": "<id>" }` → `{ "ok": true, "theme": "<id>" }` |
| DELETE | clears the room pick; GET `theme` is `null` |
| 400 body | `{ "error": "bad theme" }` |

`canvas` and `accent` are the two signature hexes (shop floor + tool
color). `feel` is `neutral` or one of happy, excited, sad, frustrated,
angry, anxious. `scheme` is `dark` or `light`. `mood` is one English
line, `<feel>, <scheme> — <scene>`. That is how a model that cannot
see the screen chooses. Do not put hex in the id. Do not accept
arbitrary colors.

**Notice.** When the room theme changes the Durable Object sends one
frame to every socket, and **flushes it on phone connect** (after
`cmds`, like the command catalog):

```text
{ "kind": "theme", "theme": "siren" }    // set
{ "kind": "theme", "theme": null }       // cleared; NO text
```

| Rule | Why |
| --- | --- |
| Not a `FrameKind`. A phone that sends one gets `error` `bad frame` | Originates on the DO |
| Not queued, no `id` / `seq` / `at`, not in the transcript | Reconnect must not replay "mood changed" as a turn |
| Do not move `since`; do not toast / HUN / haptic / badge | Not a turn |
| No `text` | Old Cab `Mouth.ingest` would paint the id as a bubble |
| Unknown `theme` string → ignore | Same bar as `parseTheme` junk |

**Paint.** On a known id, if follow is on, apply that palette (PWA
`paintTheme` — does **not** overwrite the human's `pendant.theme`).
Cache the id at `localStorage["pendant.roomTheme"]` so `THEME_BOOT`
can apply it before the socket is up. On `theme: null`, drop the
cache and fall back to `pendant.theme`. A human pick in Settings
writes `pendant.theme` and sets follow **off**. `?theme=` for shots
does the same.

Catalog: `boom` `paper` `ink`, then a mood pair per feeling —
`marquee` / `lemonade` (happy), `neon` / `fizz` (excited), `rain` /
`mist` (sad), `fuse` / `grit` (frustrated), `siren` / `flare` (angry),
`static` / `flicker` (anxious). Dark id first in each pair. `boom`
hexes stay shared with gantree. `feel` and `scheme` on the card are
additive. Retired ids (`inlay`, `lamp`, `noir`, `ember`, `tide`,
`bloom`, `chalk`, `foam`, `petal`) are unknown: a mouth that still
has one paints it locally; the Worker never sends it, and a stored
one reads as `theme: null`. A mouth that does not know `siren`
ignores the notice and keeps its current palette. Palettes and the
picker groups (Plain / Moods): [theme_moods.md](theme_moods.md).

**Picker.** Settings groups the same way on every mouth. Plain is
`boom` `paper` `ink`. Moods is the six feelings as dark/light pairs.
The room's current id wears a "Kit" tag while follow is on. A human
tap still writes the device pick and sets follow off. Cab
(`CabScreen` chips) and Helm (`HelmScreen` chips) use those two
headers.

**Cab.** `Look.kt` `THEME_IDS` matches the catalog (hexes in
`CabPalette.kt`). `Mouth.roomTheme` plus `paintedTheme(follow, room, mine)`
paints when follow is on. `ThemeApi` GETs `/api/theme?slug=` on connect
(5xx leaves the last id; JSON `null` clears). Human chip pick writes
`theme` and sets `followTheme` off.
`SharedPreferences("cab")["followTheme"]` mirrors `pendant.followTheme`.
`shouldSpeak` stays false. Auto HUNs do not care.

**Helm.** `Look.swift` `themeIds` and `Palette.swift` hexes match
the same catalog. `Mouth.roomTheme` plus `paintedTheme` paint when
follow is on. `ThemeApi` GETs `/api/theme?slug=` on connect. Human
chip pick writes `theme` and sets `followTheme` off. UserDefaults
`helm` / `followTheme` mirrors `pendant.followTheme`. `shouldSpeak`
stays false. CarPlay HUNs do not care.

---

## Helm

Same room, Swift client (`repos/gantry-helm`). Surfaces on the
wire: `ios` (pocket) and `carplay` (spoken Reply / Test car voice).
Those names are additive on this Worker — old Cab APKs still send
`android` / `android_auto`. Sign in with Apple is a mailbox auth
change ([security.md](security.md)); APNs is lock-screen, same
later as Cab FCM. Do not grow a second Durable Object. Handoff lives
in Helm `docs/pendant_handoff.md`.
