# gantry-pendant — todo

Open work. A line is done when the **walk** works. Scope is which
checkout you touch. Telegram stays production until the phone walks
are real.

Pitch: [README.md](../README.md). Why: [design.md](design.md). Wire:
[architecture.md](architecture.md). Who talks: [setup.md](setup.md).
Other mouths: [frontends.md](frontends.md). Misses:
[edgecases.md](edgecases.md). Sibling phones:
[sibling_phones.md](sibling_phones.md). Typing:
[agent_typing_response_todo.md](agent_typing_response_todo.md). Voice:
[voice.md](voice.md). Face / mood:
[agent_ui_controls.md](agent_ui_controls.md). Bugs / security:
[audit_todo.md](audit_todo.md).

## Fit gates

Same eight as [design.md](design.md#principles). Fail a gate → later
or another repo.

---

## Prove it

Two laptop tabs do not close these. Walk:
[deployment.md](deployment.md), then a real phone.

- [ ] Deploy to `workers.dev`
- [ ] GCP **Web** client: JS origin = this origin; redirect
      `/api/auth/callback/google`; `openid email profile` only
      ([setup.md](setup.md#once-before-any-person))
- [ ] Worker secrets: Google + `SESSION_SECRET` + `CRANE_BEARERS`
      (`ALLOWED_SUBS` optional). Spike `MAILBOX_SECRET` gone. Mint from
      Gantree Settings + Build, not `npm run secrets:push` from here
- [ ] VAPID in Worker secrets (`npm run vapid`) so lock-screen ping
      works. Gantree Settings does not mint it yet
- [ ] Android Chrome PWA and iPhone Add to Home Screen (LTE, no
      Tailscale). Text + GPS, photo, cron ping with the app open
- [ ] Two allowlisted humans, two phones, one crane: Ada's reply does
      not land on Bob; Bob foregrounds and the queued reply appears
- [ ] Yank Ada's `sub` mid-chat → next send is `4401`, not a reply

---

## Other checkouts

### ai-gantry

Harness Completer footer is **closed in that repo** (`[harness]` RoleSystem
after speech). PWA send strip is closed here (audit §14). Cab still
owns its Kotlin strip.

- [ ] Publish `allow` on connect (`PENDANT_ALLOWED_USERS`); keep the
      local check as a redundant filter. Then Worker `ALLOWED_SUBS`
      can go
- [ ] Examples auto-bind on a new pendant crane (same case as Telegram,
      user id = Google `sub`)
- [ ] Maps: tool args are this-send coords, not a stale Telegram pin.
      PERSONA uses `[last pin]`; do not ask unless `here` is empty.
      Clock footer `[last pin ±12m]` from `accuracy_m` (prompt-only)
- [ ] Honor pendant stop / `/cancel` so Handle aborts; typing ticker
      dies before any reply
      ([agent_typing_response_todo.md](agent_typing_response_todo.md))
- [ ] Reply-to: inbound names a prior frame `id`; Completer sees which
      bubble Ada quoted
- [ ] Inline Yes / No on a reply (Telegram callback shape). Tap is a
      short inbound, not a reaction
- [ ] One non-image file on the channel under the chat cap

### gantree

- [ ] `/profile`: Google `sub` (not email-as-key)
- [ ] Confirm-scary copy onto `PENDANT_ALLOWED_USERS`
- [ ] After crane-publish: Worker list is gone; the fold is the one
      paste

### gantry-cab

- [ ] **Same send-path strip as this PWA** — Kotlin `inbound()` /
      `MailboxService.sendBlocking`. Checklist lives in Cab
      `docs/todo.md` Small. Do not edit Kotlin from here.

Same Durable Object. Do not fork the mailbox.
[frontends.md](frontends.md). Work lives in that checkout:
[`docs/pendant_handoff.md`](https://github.com/shotah/gantry-cab/blob/main/docs/pendant_handoff.md)
(ship hydrate APK, walk sibling inbound). Cab half of nonce / 4401 /
header face / caption+attach / thread cache / blob `If-None-Match` is
in tree. Worker issues `/api/auth/nonce` and fans sibling inbound.
Do not edit Cab Kotlin from this repo.

Wire changes (`seq` / `at`, `replay`, new `kind`, auth) still need a
look at `Wire.kt` / `Mouth.kt`. iOS native is later (Sign in with Apple
is a mailbox auth change). Do not start Expo to catch up Cab.

---

## This repo

- [x] **Strip harness / clock header from `text` on send (FE)** —
      `stripHarnessContext` in `lib/phone/text.ts` before the bubble
      and `encodeFrame`. Pasted `[current time]` does not land on the
      wire. `context` is `geo` only. Audit:
      [audit_todo.md §14](audit_todo.md#14-phone-send-path-fe).
- [ ] **Voice into compose** — `SpeechRecognition` when it exists;
      fill the textarea, do not auto-send. Audio never hits the
      mailbox or the Completer. Cab Auto already speaks. Design:
      [voice.md](voice.md)
- [ ] **Share target** — Android share sheet → compose (do not
      register `share_target` until the POST handler exists)
- [ ] **Offline outbound queue** — page-side unsent frames; do not
      cache chat in `sw.js`
- [ ] **Custom hostname** — cookies + OAuth redirect; crane URL
      updated; recreate
- [ ] Sliding session refresh (today is hard 7d)

### Mouth UI

Still fights a phone talking to Kit. Not groups, stickers, or Mini
Apps. Do not reverse-geocode. Do not put coords in `Text`.

- [ ] **Crane up vs phone live** — overlay `asleep` / `queued` on the
      subtitle. `live` stays socket health. Never infer from inbound
      `ack`
- [x] **Sibling phones see inbound live** — Worker fans the same body
      to `sub:<userId>` except the sender. Spike (no `sub`) stays on
      reconnect. Walk Cab + PWA on a deployed origin (same Google).
      Design: [sibling_phones.md](sibling_phones.md)
- [ ] **Pin on the bubble** — outbound that carried `context.geo`
      shows `±Nm this send`. Tap opens maps. Silent pin stays silent
- [ ] **Timestamps** — paint `ChatBubble.at` and a day chip (phone
      clock)
- [ ] **Copy / retry** — long-press copies text. Unacked inbound
      leaves `sending` forever; flip to failed and resend
- [ ] **Stop a turn** — button while `typing…`. This checkout sends
      `/cancel`; crane must abort
- [ ] **Quote** — inbound names the bubble `id` you are answering. No
      thread-within-thread chrome
- [ ] **Inline confirm** — Yes / No tap is a short inbound. Skip
      reactions
- [ ] **One non-image file** — log / `.ics` / pdf under the chat cap
- [ ] **Draft survives reload** — compose text in localStorage (not
      the thread)
- [ ] **Mute pings** — local pref: `push` does not badge / notify /
      haptic. Socket still paints
- [ ] Photo lightbox / save
- [ ] Jump-to-bottom when a ping lands off the floor
- [ ] Session chip when `/new` actually resets history

---

## Not this version

Hosted SaaS, chat in Gantree, inbound port on the crane, Worker-level
Access, Telegram feature-match, Gantree mobile layout, reverse-geocode
in the client, `[location]` in `Text`. See
[design.md](design.md#principles).
