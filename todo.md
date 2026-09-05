# gantry-pendant — todo

Work backwards from a phone that talks to Kit. This file is the build
script: what “done” looks like, then phases in the order we walk them.
Pitch: [README.md](README.md). Why:
[docs/design.md](docs/design.md). How:
[docs/architecture.md](docs/architecture.md). Authn:
[docs/security.md](docs/security.md). Who talks:
[docs/setup.md](docs/setup.md). Looks like:
[docs/screens.md](docs/screens.md). Misses:
[docs/edgecases.md](docs/edgecases.md). After the mouth:
[docs/todo_next_features.md](docs/todo_next_features.md).

KISS: Vinext on Workers, one Durable Object per crane, `CHANNEL=pendant`
in the harness. Telegram stays the production mouth until a phase’s
**walk** is real.

Status: **now** (code in) · **next** (deploy + GCP client) · **later** · **not this version**
A phase is done when you can do the **walk** without a second brain.

Scope is which checkout (or GCP/CF) you touch. Do not start the next
phase’s repo until this walk passes.

---

## Looks like (the end)

You open the pendant on cellular. Google sign-in. You talk to Kit. She
answers. A scheduled ping can reach you with the app open. GPS on that
send is `[last pin]` this-turn, not a stale Telegram pin. The crane
still has **no inbound port**. Telegram can stay on another crane.
Gantree did not sit in the turn.

---

## Fit gates

If a task fails a gate, it is later or it belongs in another repo.

1. **Zero inbound on the crane.** The channel dials the Worker.
2. **Console never sits in a chat turn.** No Gantree HTTP for messages.
3. **Allowlist, no pairing.** Empty list is a config error. Human id is
   Google `sub`. Crane id is a bearer bound to the slug.
4. **One channel loop.** Sibling of `telegram/` / `discord/` / `slack/`
   / `stdio/`. No second agent.
5. **Vinext on Workers.** Same `app/` muscle as Gantree, not Node, not
   Gantree’s `app/` deployed twice.
6. **Wire generous, prompt stingy.** GPS on the frame → `here.Set`.
   Not `[location]` in `Message.Text`.
7. **MCP OAuth is not login.** New Web client, `openid email profile`.
8. **Not the yard’s phone layout.** Pretty Gantree CSS is a parallel
   track in gantree.

---

## Phase 0 — docs · **now** · gantry-pendant

Name, shape, auth, GPS. Nested checkout exists.

**Walk:** someone can read README → design → architecture → security
→ setup → edgecases and not need this chat.

- [x] README (etymology, three pieces)
- [x] `docs/design.md`
- [x] `docs/architecture.md`
- [x] `docs/security.md`
- [x] `docs/setup.md` (admin / user / connect — dual allowlist)
- [x] `docs/edgecases.md` (gotchas across pendant + gantree + ai-gantry)
- [x] Rename off `cellphone-client`

---

## Phase 1 — mailbox · **now** · gantry-pendant + Cloudflare

Prove two sockets meet. No Google. No harness. No phone OS.

**Walk:** `vinext` (or `wrangler`) against our CF account. Two browser
tabs. Type in A, see it in B, reply. Shared secret on the Worker.

- [x] Vinext app targeting Workers (`@cloudflare/vite-plugin`)
- [x] One Durable Object (hibernated WebSockets)
- [x] Frame: `{ text }` both ways
- [x] Shared secret (spike only — [security](docs/security.md#spike-vs-later))
- [x] Size cap on text
- [x] Do not log bodies
- [ ] Deploy to `workers.dev`

**Out of this phase:** Google, GPS, photos, crane bearer, `CHANNEL=pendant`.

---

## Phase 2 — shell · gantry-pendant

The tabs look like a mouth, not a debug page.

**Walk:** one tab is “the phone”: a thread, compose, send. The other
tab still stands in for the crane. Same secret as P1.

- [x] Chat UI (Vinext `app/`)
- [x] PWA manifest (installable; GPS/auth can wait)
- [x] Queue on the DO when the other side is gone (short)
- [x] Crane-slug in the path or frame (still one room for the spike)

**Out of this phase:** Google, GPS, photos.

---

## Phase 3 — Google + crane bearer · gantry-pendant + GCP

Two principals. Same GCP project as google-mcp; **new** Web client.

**Walk:** Sign in with Google. Unknown `sub` never reaches the DO.
A second tab with the crane bearer joins the same slug. Kit’s token
cannot join Ada’s room. Shared secret from P1 is gone.

- [ ] GCP Web application client (`openid email profile` only) — create in Console
- [x] Redirect = this origin (not `oauth-catch`, not localhost:4100)
- [x] Vinext Google OIDC → httpOnly session (or equivalent)
- [x] Human allowlist: Google `sub` (+ email label)
- [x] Crane bearer bound to slug
- [x] Auth on every frame
- [x] Rate limit per `sub` and per bearer
- [x] Same error for unknown user vs bad token
- [x] No `console.log` of tokens

**Out of this phase:** Gantree writing the allowlist; Access in front.

---

## Phase 4 — harness channel · **ai-gantry**

`CHANNEL=pendant`. Outbound to the Worker. Telegram stays on other
cranes.

**Walk:** a real crane with `CHANNEL=pendant` answers text from the
shell. Cron `Push` lands in the phone tab. Stdio still works for
hacking the binary. No listen port.

- [x] `internal/channel/pendant/` (`Channel` + `Pusher`)
- [x] Env: mailbox URL, bearer, Google `sub` allowlist
- [x] Empty allowlist fails boot
- [x] Map `context.geo` → `here.Set` (do **not** stuff `[location]` into
      `Text`)
- [x] Bare-geo-only = silent pin (no Completer)
- [x] `UserID` = Google `sub`
- [x] Images later in P5; whole replies first (stream edit can wait)
- [x] Tests in ai-gantry for inbound compose + `here`

**Out of this phase:** Gantree wizard, PWA GPS.

---

## Phase 5 — pocket · gantry-pendant (+ P4 crane)

Real phone, cellular, GPS.

**Walk:** Add to Home Screen. LTE, no Tailscale. Google. Send text
with GPS granted. Photo. Cron ping with the app open. `[last pin]` is
this-send.

- [x] Geolocation on send (`getCurrentPosition`; omit if denied)
- [x] `context`: `at`, `tz`, `geo` (`lat`, `lon`, `accuracy_m`)
- [x] Photo attach → `Images` (size cap)
- [ ] Confirm Android Chrome PWA and iPhone Add to Home Screen
- [x] No SSID / Bluetooth / clipboard on the wire

**Out of this phase:** `watchPosition`, APNs, Expo, stores.

---

## Phase 6 — yard · **gantree** (last)

Fourth mouth in the build wizard. No chat UI on the board.

**Walk:** build (or edit) a crane, pick pendant, paste mailbox URL +
bearer + allowlist, recreate. Kit answers on the phone. Yard session
cookie is never sent to the Worker.

- [x] Channel option `pendant` (beside telegram / discord / slack / stdio)
- [x] Secrets: URL, bearer, allowlist (crane `.env` only — not Worker secrets)
- [x] Recreate nag
- [x] Docs: install/console one paragraph, not a new product page
- [x] Do not fetch chat through `/api/gantries`
- [ ] Operator Google `sub` on `/profile` + confirm-scary copy onto Kit
      (`PENDANT_ALLOWED_USERS`). Still a dual paste: Worker `ALLOWED_SUBS`
      is Cloudflare. See [setup.md](docs/setup.md).

---

## Gaps the walks still need

Code for the mouth is in. These are the second-brain items
[edgecases.md](docs/edgecases.md) tracks. Do not mark a phase done
until the walk is real.

| Gap | Where | Cover |
| --- | --- | --- |
| Deploy + GCP Web client | CF + GCP | P1 deploy box; P3 client. Redirect = this origin. |
| First `sub` is awkward | pendant | Unknown Google users never get a session, so they cannot read `/api/auth/me`. Mint a session for any verified account, still deny the DO unless allowlisted, show “send this id to the yard admin.” |
| Two allowlists, one UI | gantree + CF | Wizard writes crane only. Admin still `wrangler secret put ALLOWED_SUBS`. |
| No profile Google field | gantree | Telegram-style chat id + copy button. Email is not the key. |
| Confirm PWA on a real phone | pendant | Android Chrome + iPhone Add to Home Screen (P5). |
| Examples auto-bind is telegram-only | ai-gantry | Spark already binds for pendant. `EXAMPLES_QTY` does not. |
| No streaming / lock-screen push | both | Whole replies; cron only while the socket is up. |

---

## Later

How-to and checkboxes: [docs/todo_next_features.md](docs/todo_next_features.md).

- Expo wrap (sideload / TestFlight) when PWA feels like a bookmark
- APNs / FCM (lock screen while the app is dead)
- Streaming placeholder + edit (`ReplyWriter`)
- `context.battery` / `net` (wire now, prompt only if cron cares)
- `here.Pin` accuracy `±12m` in the clock footer (ai-gantry)
- Custom hostname on the Worker
- Hostname-based Cloudflare Access on the **document** origin only
- Mint pendant session for any verified Google user; show `sub` +
  `allowed: false` so the next human can send their id to the admin
- Gantree operator `google` chat id + “add this operator to Kit’s
  pendant allowlist” (crane list only; Worker list stays a secret put)
- Examples auto-bind for `CHANNEL=pendant` (ai-gantry)
- Sign in with Apple (only if an App Store build exists)

---

## Not this version

- Hosted pendant SaaS (other people’s cranes on our Worker)
- Chat in the Gantree console
- Inbound port on the crane
- Worker-level Cloudflare Access (“Protect this Worker”)
- Reusing `google-oauth.json` / Strava / Garmin as login
- Feature-matching Telegram (groups, stickers, Mini Apps)
- Gantree mobile layout
- Putting the mailbox on the portal Worker
- Mini Tailscale hub as the architecture (laptop hack only)
