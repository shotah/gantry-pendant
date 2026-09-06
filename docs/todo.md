# gantry-pendant — todo

What's left. The mouth talks in code; Telegram stays production until
the walks are real on a phone. Pitch: [README.md](../README.md). Why:
[design.md](design.md). Wire: [architecture.md](architecture.md). Authn:
[security.md](security.md). Who talks: [setup.md](setup.md). Misses:
[edgecases.md](edgecases.md).

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

**Walk:** sign in on the deployed origin; two tabs are not enough.

- [ ] Deploy to `workers.dev`
- [ ] GCP Web application client (`openid email profile` only). Redirect
      = this origin — not `oauth-catch`, not `localhost:4100`
- [ ] Worker secrets: Google + `SESSION_SECRET` + `ALLOWED_SUBS` +
      `CRANE_BEARERS`. Spike `MAILBOX_SECRET` gone from prod

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

Dual allowlists are still the #1 miss ([edgecases.md](edgecases.md)).
The crane already publishes `cmds`; it should publish the human list
the same way.

### Crane publishes the allowlist · gantry-pendant + ai-gantry

**Walk:** `ALLOWED_SUBS` is gone from Worker secrets. Crane boots with
`PENDANT_ALLOWED_USERS`, dials in, publishes. Ada signs in and joins.
Stranger signs in, sees own `sub` + "send this to the yard admin",
never joins the room. Admin adds the `sub` to crane `.env`, recreates;
Ada's friend is in. No `wrangler secret put`.

- [ ] Frame `kind: "allow"` crane→DO with `subs[]` (same shape as
      `cmds`); phone must not publish
- [ ] DO stores allowlist per slug; phone handshake asks the DO instead
      of reading `ALLOWED_SUBS`
- [ ] On publish: close phone sockets whose `sub` is no longer allowed
- [ ] Mint session for any **verified** Google account; `/api/auth/me`
      returns `{ sub, email, allowed }`; DO still denies unless allowed
- [ ] Phone shows `sub` + "send this to the yard admin" when
      `allowed: false`; never on the query string
- [ ] ai-gantry: publish allowlist on connect; keep local check as a
      free redundant filter
- [ ] Remove `ALLOWED_SUBS` from handshake, wrangler, [setup.md](setup.md)

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
toggle, silent pin, wake, haptic, badge, shortcuts, photo compress)
need the pocket walk above, not more code. Do not start Expo until the
PWA path is painful.

### This repo

- [ ] **Voice into compose** — `SpeechRecognition`; fill the textarea,
      do not auto-send
- [ ] **Share target** — Android share sheet → compose (do not register
      `share_target` until the POST handler exists)
- [ ] **Offline outbound queue** — page-side unsent frames; do not cache
      chat in `sw.js`
- [ ] **Web Push** — VAPID in Worker secrets; subscribe after Google;
      lock-screen cron when no phone socket. Installed PWA, iOS 16.4+
- [ ] **Custom hostname** — cookies + OAuth redirect; crane URL
      updated; recreate
- [ ] **"Kit is thinking"** `ack` when the Handler starts
- [ ] Sliding session refresh (today is hard 7d)
- [ ] Prune stale entries in the DO rate-limit map

### ai-gantry

- [ ] Streaming placeholder + edit (`ReplyWriter`); phone replaces the
      last Kit bubble, does not append per chunk

### Expo (when a bookmark is not enough)

Same Durable Object. New client. Do not fork the mailbox.

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
- Feature-matching Telegram (groups, stickers, Mini Apps)
- Gantree mobile layout
- Putting the mailbox on the portal Worker
- Mini Tailscale hub as the architecture (laptop hack only)
- SSID / BSSID / Bluetooth / clipboard / contacts on the wire
- `watchPosition` in the background (PWA)
- Reverse-geocode in the client
- `[location]` prepended to every `Text`
