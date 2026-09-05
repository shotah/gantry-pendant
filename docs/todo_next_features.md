# Next features

What to add after the mouth talks. Phases and walks stay in
[todo.md](../todo.md). Why GPS/context exists:
[design.md](design.md). Wire:
[architecture.md](architecture.md). Misses:
[edgecases.md](edgecases.md).

Chrome Install does **not** unlock extra sensors. HTTPS + an OS
permission does. Install is a home-screen icon, standalone chrome, and
a better shot at Web Push. GPS-on-send is already in.

**Wire generous. Prompt stingy.** Coords, battery, and net ride
on `context`. Do **not** stuff them into `Message.Text`. Reverse-geocode
is a maps **tool** on the crane, not a client field. Never on the wire:
SSID / BSSID, Bluetooth neighbors, clipboard, contacts.

A feature is done when the **walk** works without a second brain. Scope
is which checkout you touch. Do not start Expo until the PWA path is
painful.

---

## Already in (do not rebuild)

| Piece | Where | What it does |
| --- | --- | --- |
| GPS on send | `lib/phone/geo.ts`, `PhoneShell` | `getCurrentPosition` on send; omit if denied |
| `at` + `tz` | `lib/phone/context.ts` | phone clock / IANA zone on every phone frame |
| Geo extras on the type | `lib/mailbox/frame.ts` | `accuracy_m`, `alt_m`, `heading`, `speed_mps` already parse |
| Bare pin | `isBareGeo` / mailbox `kind: pin` | geo only → silent cursor update, no Completer |
| Photos | `app/lib/photo.ts` | JPEG after in-app compress; HEIC when the OS can decode |
| PWA install | `app/manifest.ts`, `public/sw.js` | Chrome Install + iPhone Add to Home Screen icons |
| `here.Set` | ai-gantry pendant channel | `context.geo` → `[last pin]`; Text stays the words |
| Envelope slots | `PhoneContext` | `battery` and `net` parse; the phone fills them when the OS exposes the API |
| GPS toggle | Compose + `pendant.geo` | in-app off skips `getCurrentPosition` without revoking the OS grant |
| Silent pin | Compose **pin** | `kind: pin`, no bubble, no Completer |
| Wake / haptic / badge | `lib/phone/wake`, `haptic`, `badge` | screen wake while waiting; vibrate + badge on inbound ping |
| Shortcuts | `PENDANT_MANIFEST.shortcuts` | Message (`/#compose`) and Pin (`/?pin=1`) |
| Photo compress | `fileToPhoto` → `jpegFromFile` | HEIC/PNG/oversize → JPEG under `IMAGE_BYTES_MAX` |

`PhoneShell` attaches `battery` / `net` on send when the browser has the API.

---

## Order

Ship down the list. Later lanes may skip items; do not skip **fit
gates** (zero inbound on the crane, console not in the turn, allowlist).

1. **Cheap PWA** — this repo, foreground only
2. **Agent lookup** — ai-gantry + maps MCP (Kit can *use* the pin)
3. **Lock-screen** — Web Push (the real product jump)
4. **Mouth polish** — streaming, photos, first-user `sub`
5. **Yard** — gantree profile / allowlist copy
6. **Expo** — only when a bookmark is not enough

---

## 1. Cheap PWA (this repo)

Foreground APIs. Same origin, same socket. Omit when the OS has no API.

### 1.1 Battery + charging

**Why:** cron can hush at 4% instead of buzzing a dying phone.
**Prompt:** only if a recipe cares. Do not print `%` on every Completer
call.

- [x] `lib/phone/battery.ts` — `navigator.getBattery?.()`; `{ pct, charging }` or `null`
- [x] Timeout / missing API → omit (same shape as `readGeo`)
- [x] `buildContext({ battery })` from `PhoneShell` on send
- [x] Tests: present, missing, `pct` clamped 0–100
- [ ] **Walk:** Chrome desktop or installed Android PWA; send; crane frame has `context.battery`. iPhone omit is OK

Safari has no Battery Status API. Chrome may hide it outside an
installed PWA. Never block send.

### 1.2 Net: wifi vs cellular

**Why:** “don’t pull a huge photo on LTE” later; not for the prompt.
**API:** `navigator.connection` (Chrome Android). iOS: omit.

- [x] `lib/phone/net.ts` — map `type` / `effectiveType` → `wifi` \| `cellular` \| `unknown`
- [x] Unknown / missing → omit or `"unknown"`, never guess from IP
- [x] Pass into `buildContext` (replace `net: undefined` in `PhoneShell`)
- [x] Tests: wifi, cellular, absent
- [ ] **Walk:** Android Chrome on LTE vs wifi; iPhone send has no `net`

Do **not** send SSID, BSSID, or cell tower ids.

### 1.3 In-app GPS toggle

**Why:** OS permission is once; a pendant toggle lets you drop the pin
without revoking Chrome’s grant.

- [x] `localStorage` (or cookie-less) flag `pendant.geo=off`
- [x] Compose (or header) control: on / off; default on
- [x] Off → skip `browserGeo()`, hint “GPS off”
- [x] On + denied → keep today’s “omitted” hint; still send
- [x] Tests: off never calls geolocation; on denied still sends text
- [ ] **Walk:** toggle off, send, crane `here` unchanged; toggle on, send, pin refreshes

### 1.4 Silent pin button

**Why:** Telegram bare pin updates `here` with no model turn. The wire
already has `isBareGeo`. Compose currently requires trimmed text.

- [x] Pin control next to photo: send `{ context.geo }` with empty text
- [x] Do not open Completer (harness already treats bare geo as silent)
- [x] Disabled when GPS toggle is off or status is down
- [x] Hint updates to `pin ±Nm this send` like a text send
- [x] Tests: `isBareGeo` true; UI does not append an empty bubble of words
- [ ] **Walk:** tap pin, Kit stays quiet, next text send’s `[last pin]` is fresh

### 1.5 Wake lock while Kit is thinking

**Why:** a long whole-reply looks idle; the screen sleeps.
**API:** `navigator.wakeLock.request("screen")`. Drop on reply, hide, or
error.

- [x] Request after send when waiting for a `reply`
- [x] Release on inbound bubble, socket down, or `visibilitychange`
- [x] Ignore failures (desktop, denied, unsupported)
- [ ] **Walk:** send on Android; screen stays on until the bubble lands

### 1.6 Vibrate on inbound ping

**Why:** haptic when a cron `push` lands with the app open.
**API:** `navigator.vibrate`. Android Chrome only.

- [x] On `kind === "push"` (and maybe `reply` if you want every turn)
- [x] Short pattern; no vibrate when the document is hidden (Push will
      own the lock-screen case)
- [ ] **Walk:** crane stand-in `push`; phone buzzes. iPhone no-op is OK

### 1.7 App badge

**Why:** unread pings on the icon (Chrome Android installed PWA).
**API:** `navigator.setAppBadge` / `clearAppBadge`.

- [x] Increment on `push` (and replies while hidden)
- [x] Clear when the thread is visible / user sends
- [ ] **Walk:** background the PWA, send a ping from the crane tab, icon
      shows a count; open the app, badge clears

### 1.8 Voice into compose

**Why:** hands-full hatch. Not an Expo mic yet.
**API:** `webkitSpeechRecognition` / `SpeechRecognition` (Chrome). iOS
is weak.

- [ ] Mic on Compose: fill the textarea, **do not auto-send**
- [ ] Permission denied → hint, keep keyboard
- [ ] Stop on unmount / blur
- [ ] Tests: mock recognition → draft text
- [ ] **Walk:** Android Chrome; speak; words in the box; you still tap send
      (GPS attaches as today)

### 1.9 Manifest shortcuts

**Why:** long-press icon → Message / Pin.

- [x] `shortcuts` on `PENDANT_MANIFEST` (`app/lib/pwa.ts`)
- [x] `start_url` values the shell can read (`/?pin=1` or `/#compose`)
- [x] Pin shortcut only useful after 1.4
- [x] Extend `chromeInstallIssues` only if a shortcut would break install
      (it should not)
- [ ] **Walk:** installed Chrome PWA; long-press shows the actions

### 1.10 Share target (“Share to Kit”)

**Why:** a photo or URL from another app lands in compose.
**API:** Web Share Target (`share_target` in the manifest) + a POST
route. Installed Chrome Android.

- [ ] Manifest `share_target`: `action` `/share`, `enctype`
      `multipart/form-data`, `params` for `text` / `url` / `files`
- [ ] Route: auth cookie required; stash payload; redirect to `/`
- [ ] Shell: pick up stash → draft and/or `fileToPhoto`
- [ ] Size cap same as chat photos
- [ ] **Walk:** Android share sheet → pendant; compose has the text or
      photo; send still attaches GPS

Do not register `share_target` until the POST handler exists (orphan
shares 404).

### 1.11 Offline outbound queue

**Why:** LTE blips. The Durable Object already queues **crane-gone**;
the service worker must **not** cache chat. Phone-side unsent frames
are the gap.

- [ ] IndexedDB (or memory + `localStorage` cap) of unsent `encodeFrame` blobs
- [ ] Enqueue when `WebSocket` is not `OPEN`; flush on `onopen`
- [ ] Cap count/bytes in line with `lib/mailbox/caps.ts` (do not store
      1.5 MB photos forever)
- [ ] Hint: “queued” vs “live”
- [ ] Tests: down → send → up → frame sent once
- [ ] **Walk:** airplane mode, type, reconnect, Kit gets the turn

Keep `public/sw.js` cache-free. Queue in the page, not in the SW.

---

## 2. Agent lookup (ai-gantry + tools)

The phone already sends lat/lon. Kit “knows” via `[last pin]`. Looking
**up** a place is a tool call, not a new mailbox field.

### 2.1 Maps tool uses the pin

**Why:** “what’s near me” / leave-by / directions without a ritual
Telegram pin.

- [ ] Confirm the pendant crane has maps MCP (google-maps or sibling)
- [ ] PERSONA / recipe: use `[last pin]`; do not ask for a pin unless
      `here` is empty
- [ ] Do **not** reverse-geocode in the PWA or Worker
- [ ] Do **not** write a city name into `Message.Text`
- [ ] **Walk:** LTE, GPS on, “coffee near me” → tool args are this-send
      coords, not a stale Telegram pin

### 2.2 Clock footer accuracy (`±12m`)

**Why:** the phone already sends `accuracy_m`; the footer can show it.
**Where:** ai-gantry `internal/here` / clock footer. Not this repo’s UI.

- [ ] Extend `here.Pin` with accuracy (and heading if the footer wants it)
- [ ] Print `[last pin ±12m]` (or similar) prompt-only; still not in
      `gantry.db`
- [ ] Tests on the harness pin type
- [ ] **Walk:** send from the phone; Completer footer matches this-send
      accuracy

Heading / speed are already on the frame if the OS fills them. Use them
only if a recipe cares (walk vs stand). Do not invent motion from them
in the client.

---

## 3. Lock-screen push (product jump)

Cron only lands if the socket is up
([edgecases](edgecases.md#phone--pwa)). Push is a **second** path:
Worker → platform push → lock screen. It does not replace the socket
while the app is open. Cloudflare will not send APNs for us.

### 3.1 Web Push (PWA)

**Where:** gantry-pendant Worker + `public/sw.js` + phone permission.

- [ ] VAPID keypair in Worker secrets (not the crane `.env`)
- [ ] After Google sign-in, `Notification.requestPermission` +
      `pushManager.subscribe`
- [ ] Store subscription on the Durable Object keyed by Google `sub`
      (one crane slug, one human)
- [ ] Service worker: `push` → show notification; `notificationclick` →
      focus `/`
- [ ] On crane `kind: push` (and maybe `reply`): if no phone socket, Web
      Push; if socket up, skip (thread already has the bubble)
- [ ] Payload: short text, **no GPS**, no photo bytes
- [ ] iOS: installed Add to Home Screen, 16.4+; document the miss
- [ ] Tests: subscribe parse; “no socket → send”; “socket up → don’t”
- [ ] **Walk:** kill the PWA; crane cron; lock screen banner; tap opens
      the thread

Do not put Access in front of the push endpoint. Do not reuse
`google-oauth.json`.

### 3.2 FCM / APNs via Expo

Wait until 3.1 is real or iOS Web Push is not enough. Same mailbox;
native wrapper is only the delivery truck. See §6.

---

## 4. Mouth polish

### 4.1 Photo compress + HEIC

**Why:** iPhone `image/heic` is rejected; > ~1.5 MB 413s.
**How:** reuse `jpegFromFile` (avatar canvas path) with chat caps from
`lib/mailbox/caps.ts`, not avatar 5 MB / face edge.

- [x] `fileToPhoto`: decode via `createImageBitmap`, JPEG encode, shrink
      until `IMAGE_BYTES_MAX`
- [x] HEIC: if bitmap works, convert; else keep a clear error
- [x] Tests: oversized JPEG shrinks; tiny JPEG passthrough; bad type
- [ ] **Walk:** iPhone Camera roll → send; Android big PNG → send

### 4.2 Streaming placeholder + edit

**Why:** whole replies look idle until the model finishes.
**Where:** ai-gantry `ReplyWriter`; DO already fans frames to the phone.

- [ ] Harness pendant channel: stream chunks / placeholder + edit
- [ ] Frame kind or `id` so the phone **replaces** the last Kit bubble
- [ ] PhoneShell: mutate the bubble, do not append a new one per chunk
- [ ] **Walk:** long turn; typing bubble then growing text; one bubble at
      the end

### 4.3 Custom hostname

**Why:** `workers.dev` is fine for the spike; a real name for cookies and
OAuth.

- [ ] Custom domain on the Worker
- [ ] GCP Web client redirect =
      `https://<host>/api/auth/callback/google`
- [ ] Crane `PENDANT_MAILBOX_URL` updated; recreate
- [ ] **Walk:** sign-in + socket on the new host; old origin rejected

Hostname-based Cloudflare Access on the **document** origin only is
optional after this. Never “Protect this Worker” (WebSockets 403; crane
is not a browser).

---

## 5. Yard / first human (gantree + this repo)

Not sensors. Still the walks [todo.md](../todo.md) lists as gaps.

### 5.1 Show `sub` before allowlist

**Why:** unknown Google users never get a session, so they cannot read
`/api/auth/me`.

- [ ] Mint a session for any verified Google account
- [ ] Still deny the Durable Object unless `ALLOWED_SUBS`
- [ ] `/api/auth/me` → `{ sub, email, allowed: false }`
- [ ] Unsigned screen: “send this id to the yard admin” (not on the query
      string)
- [ ] **Walk:** second Gmail, not on the list, sees `sub`, cannot join the
      room

### 5.2 Operator Google field + copy onto the crane

**Why:** two allowlists, one UI missing. Wizard writes crane `.env`
only; Worker `ALLOWED_SUBS` stays a `wrangler secret put`.

- [ ] Gantree `/profile`: Google `sub` (not email-as-key)
- [ ] Confirm-scary copy onto `PENDANT_ALLOWED_USERS`
- [ ] Docs: Worker list is still a second paste
- [ ] **Walk:** add Ada on the board; recreate Kit; she still cannot talk
      until Cloudflare has the same `sub`

### 5.3 Examples auto-bind for pendant

**Why:** spark already binds Google `sub` as `ChatID`; `EXAMPLES_QTY` is
telegram-only. `/examples` on demand still works.

- [ ] ai-gantry: same auto-bind case as Telegram, user id = Google `sub`
- [ ] **Walk:** new pendant crane with examples on; capability pings
      appear without `/examples`

---

## 6. Expo (when the PWA feels like a bookmark)

Same Durable Object. New client. Do not fork the mailbox.

| Native want | Why PWA is not enough |
| --- | --- |
| Background GPS / geofence | iOS kills `watchPosition`; Chrome will not track with the app dead |
| Motion (walk / drive) | needs sensors + a process that survives lock |
| OS “home” / “work” labels | not a web API we should scrape |
| Reliable iOS lock-screen | Web Push on iOS is still weak; APNs wants a signed app |
| Sign in with Apple | only if an App Store / TestFlight build exists |

- [ ] Expo app: Google (or Apple) → same Worker session cookie or token
- [ ] WebSocket consumer of `/ws/<slug>` (reuse `lib/mailbox/frame.ts` if
      you share a package; copy is OK for a spike)
- [ ] Foreground GPS first (parity with PWA); background only with an
      explicit OS permission screen
- [ ] FCM (Android) + APNs (iOS): Worker still sends; Expo registers the
      device token on the DO next to Web Push
- [ ] Sideload APK / TestFlight — **no** store listing required
- [ ] **Walk:** lock the phone, walk, cron ping on the lock screen; one
      send still refreshes `[last pin]`

`watchPosition` in a **foreground** PWA is optional polish (live map).
It is not a substitute for this lane. Do not add it until something on
screen consumes a moving pin.

---

## Never (still)

| Tempting | Why not |
| --- | --- |
| SSID / BSSID / Bluetooth / clipboard / contacts | fingerprinting, not chat |
| `watchPosition` in the background (PWA) | OS will not allow it; lies to the user |
| Reverse-geocode in the client | stale label on the wire; maps tool is current |
| `[location]` prepended to every `Text` | re-bills coords on every Completer call |
| Caching chat in `sw.js` | socket is the source of truth |
| Worker-level Access | 403s WebSockets; crane is a machine |
| Chat in Gantree | console in the turn |
| Inbound port on the crane | NAT / sleep / the port rule |
| Hosted SaaS / Telegram feature-match | not this version |

---

## Suggested first three PRs

1. ~~**This repo:** battery + net collect (1.1–1.2)~~ **in**
2. ~~**This repo:** GPS toggle + silent pin (1.3–1.4)~~ **in** (plus wake / vibrate / badge / shortcuts / photo compress)
3. **ai-gantry + maps:** pin in tool args (2.1) — no new phone API

Push (3.1) is the first item that changes the product when the app is
dead. Do it after a real-phone P5 walk (install + LTE + this-send pin).
