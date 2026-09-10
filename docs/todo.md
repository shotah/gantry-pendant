# gantry-pendant — todo

What's left. The mouth talks in code; Telegram stays production until
the walks are real on a phone. Pitch: [README.md](../README.md). Why:
[design.md](design.md). Wire: [architecture.md](architecture.md). Authn:
[security.md](security.md). Who talks: [setup.md](setup.md). Misses:
[edgecases.md](edgecases.md). Typing dots:
[agent_typing_response_todo.md](agent_typing_response_todo.md). Bugs and
security by phase: [audit_todo.md](audit_todo.md).

A line is done when the **walk** works without a second brain. Scope is
which checkout you touch.

---

## Fit gates

If a task fails a gate, it is later or it belongs in another repo.

1. **Zero inbound on the crane.** The channel dials the Worker.
2. **Console never sits in a chat turn.** No Gantree HTTP for messages.
3. **Allowlist, no pairing.** Empty list is a config error. Human id is
   Google `sub`. Crane id is a bearer bound to the slug.
4. **One channel loop.** Sibling of `telegram/` / `discord/` / `slack/` /
   `stdio/`. No second agent.
5. **Vinext on Workers.** Same `app/` muscle as Gantree, not Node, not
   Gantree's `app/` deployed twice.
6. **Wire generous, prompt stingy.** GPS on the frame → `here.Set`.
   Not `[location]` in `Message.Text`.
7. **MCP OAuth is not login.** New Web client, `openid email profile`.
8. **Not the yard's phone layout.** Pretty Gantree CSS is a parallel
   track in gantree.

---

## Next — prove it

Code for the mouth is in. These walks are still the second brain.

### Deploy + Google

**Walk:** [deployment.md](deployment.md), then sign in on the deployed
origin; two tabs are not enough.

- [ ] Deploy to `workers.dev`
- [ ] GCP **Web application** client: JS origin = this origin; redirect
      `/api/auth/callback/google`; scopes `openid email profile` only.
      Not Desktop, not `oauth-catch`, not `localhost:4100`.
      [setup.md](setup.md#once-before-any-person)
- [ ] Worker secrets: Google + `SESSION_SECRET` + `CRANE_BEARERS`.
      `ALLOWED_SUBS` optional. Spike `MAILBOX_SECRET` gone from prod.
      **Gantree Settings + mint on build** — not this checkout
      ([gantree manage_pendant_cf_todo.md](https://github.com/shotah/gantree/blob/main/docs/manage_pendant_cf_todo.md)).
      Leftover: `npm run secrets:push`

### Pocket (P5)

**Walk:** Add to Home Screen. LTE, no Tailscale. Google. Send text with
GPS granted. Photo. Cron ping with the app open. `[last pin]` is
this-send.

- [ ] Confirm Android Chrome PWA and iPhone Add to Home Screen
- [ ] Two allowlisted accounts, two phones, one crane: Ada's reply does
      not land on Bob; Bob foregrounds and the queued reply appears
- [ ] Yank Ada's `sub` mid-chat → next send is 4401, not a reply

Do not close those on two laptop tabs.

---

## Then — one list, first human

The crane publishes `allow`; this Worker stores it and admits from it.
`ALLOWED_SUBS` is optional extra. Walk is recreate, not a Cloudflare
paste per human.

### Crane publishes the allowlist · gantry-pendant + ai-gantry

**Walk:** `ALLOWED_SUBS` is gone from Worker secrets. Crane boots with
`PENDANT_ALLOWED_USERS`, dials in, publishes. Ada signs in and joins.
Stranger signs in, sees own `sub` + "send this to the yard admin",
never joins the room. Admin adds the email to crane `.env`, recreates;
Ada's friend is in. No `wrangler secret put`.

- [x] Frame `kind: "allow"` crane→DO; phone must not publish
- [x] DO stores allowlist per slug; phone handshake asks the DO
- [x] On publish: close phone sockets no longer allowed (`4401`)
- [x] Mint session for any **verified** Google account; `/api/auth/me`
      returns `{ sub, email, cranes }`; DO still denies unless allowed
- [x] Phone picks from `cranes`; empty shows email + `sub` + copy.
      Never on the query string
- [ ] ai-gantry: publish allowlist on connect; keep local check as a
      free redundant filter (other repo)
- [x] `ALLOWED_SUBS` optional in handshake, wrangler, [setup.md](setup.md)

### Yard copy · gantree

**Walk:** add Ada on the board; recreate Kit; she still cannot talk
until the crane list (and, until the publish work lands, Cloudflare)
has the same `sub`.

- [ ] Gantree `/profile`: Google `sub` (not email-as-key)
- [ ] Confirm-scary copy onto `PENDANT_ALLOWED_USERS`
- [ ] After crane-publish: Worker list is gone; this is the one paste

### Examples auto-bind · ai-gantry

**Walk:** new pendant crane with examples on; capability pings appear
without `/examples`.

- [ ] Same auto-bind case as Telegram, user id = Google `sub`

### Maps uses the pin · ai-gantry

**Walk:** LTE, GPS on, "coffee near me" → tool args are this-send
coords, not a stale Telegram pin.

- [ ] Confirm the pendant crane has maps MCP
- [ ] PERSONA / recipe: use `[last pin]`; do not ask for a pin unless
      `here` is empty
- [ ] Do **not** reverse-geocode in the PWA or Worker
- [ ] Clock footer `[last pin ±12m]` from `accuracy_m` (prompt-only)

---

## Later

Foreground cheap-PWA extras that are already in (battery, net, GPS
toggle, silent pin, wake, haptic, badge, shortcuts, photo compress,
Web Push once VAPID is on the Worker)
need the pocket walk above, not more code. Mouth UI misses below wait
on the same walk. Do not start Expo until the PWA path is painful.

### This repo

- [ ] **Voice into compose** — `SpeechRecognition`; fill the textarea,
      do not auto-send. Not a voice-note bubble.
- [ ] **Share target** — Android share sheet → compose (do not register
      `share_target` until the POST handler exists)
- [ ] **Offline outbound queue** — page-side unsent frames; do not cache
      chat in `sw.js`
- [x] **Web Push** — VAPID in Worker secrets; subscribe after Google;
      lock-screen cron when no phone socket. Installed PWA, iOS 16.4+.
      Gantree Settings does not mint VAPID yet — `npm run vapid` then
      leftover `secrets:push` / `wrangler secret put`.
- [ ] **Custom hostname** — cookies + OAuth redirect; crane URL
      updated; recreate
- [x] **Typing action** — pendant paints crane `kind: "typing"` (header
      `live · typing…`). Crane emit walk:
      [agent_typing_response_todo.md](agent_typing_response_todo.md)
- [ ] Sliding session refresh (today is hard 7d)
- [x] Prune stale entries in the DO rate-limit map
- [x] Native cab auth — `POST /api/auth/token` + phone `Authorization`
      (session JWE). Client lives in `repos/gantry-cab`.

### Mouth UI

The shell is a thread, not a Telegram clone. These are the misses that
still fight a phone talking to Kit. Not groups, stickers, or Mini Apps.

**Walk (history):** kill the tab, reopen. Ada still sees the last
turns, not an empty thread, while Kit's session is unchanged. The
SQLite queue stays unread-only catch-up. This is a short persisted
transcript for this `sub`. Cap it. Evict old. Do **not** cache chat in
`sw.js`. Architecture already allowed later HTTP for history/media.

- [ ] **Reload keeps the thread** — hydrate bubbles for this `user_id`
      on connect. Not a second session store on the crane. Queue
      (`QUEUE_*`, 1h) is not the transcript.

**Walk (presence):** yank the crane. Header stays `live` (phone socket)
but shows she is gone / inbound is queued. Bring the crane back:
presence flips without a fake `typing…`. Inbound `ack` still must not
type. Same anti-hatch as
[agent_typing_response_todo.md](agent_typing_response_todo.md).

- [ ] **Crane up vs phone live** — DO already knows the crane socket.
      Overlay `asleep` / `queued` on the subtitle. `live` stays socket
      health. Never infer from inbound `ack`.

**Walk (photo):** type "this hatch?", paste a screenshot or pick a photo,
Send. One inbound: caption + one JPEG. Attach must not fire a second
empty-text turn. Paste-into-compose is a user attach, not a clipboard
dump on the wire.

- [ ] **Caption + attach** — photo sits on the draft until Send. Paste
      image into the box. Camera (`capture`) is fine; gallery stays.
      `IMAGE_MAX` stays 1.
- [ ] **Pin on the bubble** — outbound that carried `context.geo` shows
      `±Nm this send` (accuracy only). Tap opens maps. Do not
      reverse-geocode. Do not put coords in `Text`. Silent pin stays
      silent (no bubble).
- [ ] **Timestamps** — `ChatBubble.at` is already there; paint time and
      a day chip. Phone clock, not a second server now.
- [ ] **Copy / retry** — long-press copies text (and fenced code).
      Unacked inbound leaves `sending` forever today; flip to failed
      and resend. Drop the ghost or reuse `id` — pick one, test ack
      dedup.
- [ ] **Stop a turn** — while `typing…`, a control that cancels Handle.
      Empty `/cancel` already stops the ticker; the phone needs a
      button. Crane must abort (other repo); this checkout only sends.
- [ ] **Quote** — inbound can name the bubble `id` you are answering.
      Kit sees which hatch photo. No thread-within-thread chrome.
- [ ] **Inline confirm** — Kit asks "latch the gate?" with Yes / No.
      Tap is a short inbound (or a dedicated kind), not a 👍 that
      secretly starts Handle. Skip reactions.
- [ ] **One non-image file** — log / `.ics` / pdf under the same byte
      cap. Not a document dump. Crane must accept it (other repo).
- [ ] **Draft survives reload** — compose text in localStorage. Not
      the thread.
- [ ] **Mute pings** — local pref: `push` does not badge / notify /
      haptic. Socket still paints the bubble.
- [ ] Photo lightbox / save; jump-to-bottom when a ping lands off the
      floor; session chip when `/new` actually resets history.

### ai-gantry

- [x] Phone replaces the last Kit bubble on `kind: "draft"` (pendant).
      Crane `ReplyWriter` still later — this is the stream writer, not
      typing: [agent_typing_response_todo.md](agent_typing_response_todo.md)
- [ ] Honor pendant stop / `/cancel` so Handle aborts; typing ticker
      dies before any reply
- [ ] Reply-to: inbound names a prior frame `id`; Completer sees which
      bubble (photo) Ada quoted
- [ ] Inline Yes / No on a reply (Telegram callback shape). Pendant
      paints buttons; tap is a short inbound, not a reaction
- [ ] One non-image file on the channel under the chat cap (sibling of
      `Images`, not a second mailbox)

### Expo (when a bookmark is not enough)

Same Durable Object. New client. Do not fork the mailbox. Android Auto
is **gantry-cab**, not this.

- Background GPS / geofence, motion, reliable iOS lock-screen (APNs),
  Sign in with Apple only if a store/TestFlight build exists
- Sideload APK / TestFlight — **no** store listing required

Hostname-based Cloudflare Access on the **document** origin only is
optional after a custom hostname. Never "Protect this Worker".

---

## Not this version

- Hosted pendant SaaS (other people's cranes on our Worker)
- Chat in the Gantree console
- Inbound port on the crane
- Worker-level Cloudflare Access ("Protect this Worker")
- Reusing `google-oauth.json` / Strava / Garmin as login
- Feature-matching Telegram (groups, stickers, Mini Apps, reactions,
  read receipts, mentions, link unfurl)
- Gantree mobile layout
- Putting the mailbox on the portal Worker
- Mini Tailscale hub as the architecture (laptop hack only)
- SSID / BSSID / Bluetooth / clipboard / contacts on the wire
  (paste-into-compose is a photo attach, not a clipboard dump)
- Guessing crane presence or typing from inbound `ack`
- `watchPosition` in the background (PWA)
- Reverse-geocode in the client
- `[location]` prepended to every `Text`
