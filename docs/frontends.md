# Frontends

This Worker is the mailbox. The mouths are **other checkouts**.
Wire: [architecture.md](architecture.md). Who pastes what:
[setup.md](setup.md). Gotchas: [edgecases.md](edgecases.md).

A frame change here is a change for every client that already shipped.
Do not treat `app/components/chat` as the only phone.

---

## Mouths

| Mouth | Checkout | What it is |
| --- | --- | --- |
| Pendant PWA | this repo `app/` | Handheld browser / Add to Home Screen |
| Cab | [gantry-cab](https://github.com/shotah/gantry-cab) (`repos/gantry-cab`) | Full Android app + Android Auto (`MessagingStyle`). Same mailbox, not a TWA wrapping this PWA |
| Crane stand-in | this repo `/crane` | Loopback only (`PENDANT_DEV`) |
| iOS native | not yet | Same Durable Object when it exists. Do not fork the Worker |

Gantree is not a mouth. ai-gantry is the crane, not a phone.

Cab talks like the PWA: `GET /api/auth/config`, `POST /api/auth/token`
(native JWE), `GET /api/auth/me`, then `wss /ws/<slug>?role=phone`.
Google is a Web client id in the APK (`aud`) plus an Android OAuth
client — walk is on the cab side.

---

## When you change this repo

If the edit is **wire, auth, queue, or thread order**, walk Cab
before you call it done. A PWA-only paint is not enough.

| Kind of change | Other mouths |
| --- | --- |
| Additive JSON (`seq`, `at`, extra `context`) | Old clients must keep working. Cab `parseFrame` drops unknown keys — that is the bar |
| New required field, new `kind`, or a required header | Cab (and later iOS) must ship in lockstep, or the mailbox must tolerate the old client |
| Auth (`/api/auth/*`, session JWE, 4401) | Cab POSTs the ID token and stores the JWE. Spike query creds are PWA loopback only |
| Queue / `ack` / `since` / `seq` | Cab parses `seq` / `at`, inserts like `placeInThread`, acks the highest seq. Transcript hydrate is the same frames plus `replay` — see below |
| Scroll / draft bounce | Cab already pins with reverseLayout (`ChatScroll.kt`). Do not assume it needs the PWA CSS |
| PWA-only UI (theme, font, Install) | Cab has its own Compose shell |

**Cover:** after a mailbox frame change, read
`repos/gantry-cab/app/src/main/java/com/gantree/cab/mailbox/Wire.kt` and
`Mouth.kt`. If Cab would paint wrong or drop a turn, file it there
(or patch both). Do not wait for an iOS repo to exist before writing
the contract down.

---

## `seq` / `at` (what Cab sees today)

The Durable Object stamps `seq` (monotonic) and `at` (mailbox
epoch ms) on queued frames. The PWA inserts by `seq`, then `at`, and
reconnect-acks the **highest seq**. Drafts stay last.

Cab (`mailbox/Thread.kt`, `Mouth.ingest`, `MailboxClient`):

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
  path. Cab `THREAD_MAX` is 80 (mailbox hydrates 80). **Ship Cab with
  this mailbox** so Auto HUNs skip `replay` (`shouldSpeak(kind, replay)`).
  An old APK still paints and still toasts every hydrate frame.

---

## iOS (later)

Same room, new client. Sign in with Apple is a mailbox auth change
([security.md](security.md)); APNs is lock-screen, same later as Cab
FCM. Do not grow a second Durable Object for a Swift app.
