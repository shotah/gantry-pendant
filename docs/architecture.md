# Architecture

How a phone we own talks to a crane without a listen port on the harness.
Contract and walk: [design.md](design.md). Authn:
[security.md](security.md). Mouths besides this PWA:
[frontends.md](frontends.md). Pitch: [root readme](../README.md).

Harness-side channel interface (nested checkout, **dev only**):
`repos/ai-gantry/internal/channel/channel.go`.

## Today

Telegram (and Discord / Slack) are the mouth. Gantree is the operator
plane. They do not share a request path.

```text
phone  →  Telegram / Discord / Slack   ←  gantry (outbound only)
                                              │
browser →  gantree (localhost | Tailscale | tunnel)
              │
              └── Docker + files  →  gantry  gantry  gantry
```

Nothing on the crane listens. Health is `gantry status` (exit code).
Chat is a poll or an outbound WebSocket:

| Channel | How the crane hears you |
| --- | --- |
| Telegram | Long-poll `getUpdates` |
| Discord | Outbound Gateway WebSocket |
| Slack | Socket Mode (outbound WebSocket). HTTP Events API is unsupported on purpose. |
| stdio | REPL on the process — not a phone |

That is the shape to copy. Slack Socket Mode is the closest sibling:
crane dials a hub; the hub fans events; allowlist filters. A Durable
Object is that hub on our Cloudflare account.

## Target

```text
[ phone PWA  |  gantry-cab APK  |  later: iOS ]
        |
        |  HTTPS + cookie (PWA) or Authorization JWE (Cab)
        |  wss to same origin
        v
[ Vinext on Cloudflare Workers ]
        |                 \
        | pages /auth      \  Durable Object (id = crane slug)
        |                  /
[ gantry  CHANNEL=pendant ]  ← outbound wss/https + bearer
        |
        |  same Handle as Telegram
        v
  persona + LLM + MCP + gantry.db
```

The Vinext app is one front door (chat UI + Google login). Cab is
another. The Durable Object is the room. Phone and crane both
**connect in**. Hibernation
keeps the sockets without billing idle CPU. A short SQLite queue on
the DO holds messages while the other side is gone (Mini reboot, app
backgrounded). Kit's face is a JPEG blob on that same DO (`GET/POST
/api/avatar`) — not a chat `images[]` turn. Gantree's Photo fold writes
`persona/avatar.jpg` and, for `CHANNEL=pendant`, POSTs it here the way
it calls `setMyProfilePhoto` for Telegram.

This is not Gantree's `app/` deployed to Workers. Gantree stays Node on
the Mini. Vinext's Workers target is what this second app uses because
it does not need Docker. CF's Vinext examples already bind DOs in the
same Worker as the pages.

A stateless Worker cannot do this by itself: two requests do not share
memory. D1-plus-short-poll is a possible mailbox (Telegram `getUpdates`
clone). It does not give you a room. The Durable Object is the
rendezvous: phone and crane dial in, the sockets meet here — same job
as Slack Socket Mode's hub.

```text
gantry-pendant/            this checkout — Vinext app + DO mailbox
  README.md
  docs/                    design, architecture, security, screens
  app/                     chat shell + Google login + PWA
  worker/                  Durable Object mailbox
  lib/dev/                 loopback mock + canned scenes
  assets/docs/             phone shots (`npm run shot`)

gantry-cab/                Android + Auto mouth — same mailbox, own repo
                           (nested `repos/gantry-cab`)

ai-gantry/                 harness — internal/channel/ sibling
  internal/channel/        Channel, Pusher, Message, Outbound
    telegram/
    discord/
    slack/
    stdio/
    pendant/               CHANNEL=pendant, outbound WSS

gantree/                   yard — CHANNEL in the build wizard
                           still Vinext-on-Node. Not this Worker.
```

Gantree does not grow a chat route. The wizard has another mouth the
way it already has Discord and Slack: env + allowlist, then recreate.
Settings → Pendant pushes Worker Google / session; Build mints the
crane bearer. This repo only deploys Worker **code**.

## Mailbox room

The room is **per crane slug**. Sessions are **per human** (`sub`).

- Phone frames go to the crane socket. Crane `reply` requires
  `user_id` and fans to `getWebSockets(sub)`. Crane `push` with no
  `user_id` broadcasts to every phone in the room.
- Every queued frame gets an `id`, a mailbox `seq`, and `at`.
  Phone-bound frames persist per `sub` until `ack` or TTL. On
  reconnect the phone sends `since` as the last id **or** the highest
  seq (a numeric string). The DO peeks by seq. The bubble is
  **pending** until the DO acks — local echo is not "sent".
  Other mouths: [frontends.md](frontends.md).
- Queue is one storage row per frame (`q:<id>`), keyed by
  `(to, userId)`. Do not queue `pin`. Cap count and bytes; evict oldest
  **non-reply** first. Hibernated ping/pong
  (`setWebSocketAutoResponse`) so Go keepalive does not wake the DO.
- Phone reconnects with backoff on `onclose` and `visibilitychange`
  (iOS PWAs drop the socket when backgrounded).

Wire, prompt, and GPS mapping: [design.md](design.md#phone-context-gps-first).
Who may join: [security.md](security.md).

## Channel contract (harness)

The client never calls the model. The crane's existing loop does:

```text
channel.Run  →  Handler(Message) → reply string
channel.Push →  Outbound           → cron / spark / watch
```

`Message` already has `SessionID`, `UserID`, `Text`, `Images`, `ChatID`,
`ThreadID`. Streaming is optional (`ReplyWriter` on the context). The
relay sends whole replies; placeholder + edit can wait. A DO
WebSocket makes that edit cheap later.

Slash commands are the same list Telegram registers (`setMyCommands`).
The catalog lives in ai-gantry `internal/slash`. `/help`, stdio's ready
line, Telegram's `/` menu, and pendant's picker all read it. The crane
publishes a `cmds` frame when it dials the mailbox; the DO remembers it
for the next phone connect. A removed command is a ghost until the
next publish. Pendant does not keep a second copy.

Phone **context** is extra on the mailbox frame, not a second chat
API. GPS, battery, and net ride next to `text`. The relay
channel maps `context.geo` → `here.Set` (same pin the clock footer
already prints). It does **not** prepend `[location]` to `Text`.

```text
phone  { text, images?, context.geo }
   →  DO
   →  channel.Message{ Text, Images, Context }
   →  here.Set(session, pin)     // in-memory last pin, as today
   →  Handler                    // prompt footer [last pin]; Text is the words
```

Telegram pins still work on a Telegram crane. This channel just keeps
the cursor fresh without asking. Bare-geo-only frames (no text, no
photo) stay silent like a Telegram bare pin: update `here`, no
Completer.

Denied permission = omit `context.geo`. Allowlist is crane env, same
as Telegram (Google `sub` on this mouth). The mailbox authenticates
the crane (bearer) and the human (Google ID token). Untrusted bodies;
fail closed. Details: [security.md](security.md).

## What has to be reachable

```text
phone  ──needs a path to──►  Worker (public HTTPS, token required)
crane  ──dials out to──────►  same Worker
Worker ──routes to─────────►  Durable Object (crane slug)
gantry ──never listens
gantree ──unchanged          operator board (Tailscale or Tunnel)
```

The Durable Object is the only coordination point. Bind auth, not a
WAN hope. `workers.dev` is fine for the spike; a custom hostname later.

**Not the path:** Cloudflare Tunnel to `gantree:3000`. That is how a
browser reaches the board. Chat does not use it.

## Android / iPhone in this picture

The architecture does not care about stores. The client is a WebSocket
(and later HTTP for history/media) consumer of the Worker. That later
path is the **transcript** on reload, not the unread queue, and not
`sw.js` — [todo.md](todo.md#mouth-ui). Location uses the browser
Geolocation API on send. The car mouth is **gantry-cab** (native
Android Auto), not Expo wrapping this UI.

Vinext is Next-shaped on Vite: `app/manifest.ts` is a metadata route
(`/manifest.webmanifest`, `application/manifest+json`). Icons and
`public/sw.js` are static. Chrome Install is that manifest + 192/512
PNGs on HTTPS (or loopback). No extra PWA plugin.

```text
PWA (both phones)   ─┐
gantry-cab (Auto)   ─┼─►  same Durable Object
```

Native Android (the car mouth) is **gantry-cab**, a sister checkout. It
does not wrap this Vinext app. Same frames, same Google `sub`. Phone
auth is the session JWE on `Authorization` after `POST /api/auth/token`.
The PWA still uses the httpOnly cookie.

Push notifications are a **second** path. They do not replace the
socket while the app is open. **Web Push** (VAPID from this Worker,
installed PWA, iOS 16.4+) fires when that human has no phone socket.
Native APNs / FCM is later still; Cloudflare will not send native APNs
for us. Apple's Web Push endpoint is a different thing.

## Why not these shapes

| Shape | Why not |
| --- | --- |
| Phone talks to `gantree:3000` chat API | Console in the turn. Contract forbids it. |
| Crane `:443` + TLS | Inbound on the agent. NAT, sleep, and the port rule. |
| Telegram userbot / Mini App | Still Telegram's mailbox; ToS and not "our client." |
| Phone is the server | Phones sleep, change IP, leave the house. |
| Mailbox process on the Mini | Works on a desk. Phone needs Tailscale; mailbox dies with the Mini. |
| Stateless Worker only (no DO) | No room: phone and crane never share state. |
| D1 as the only mailbox | Fine as a `getUpdates` clone. Not a room: the sockets never meet. Use if we refuse DOs. |
| Tunnel to the Mini "relay" | Exposes the house. Phone still depends on home internet. |
| Gantree `app/` on Workers as the mouth | Yard needs Docker. This is a second Vinext app. |
| Cloudflare Access as the only lock | Worker-level Access 403s WebSockets. Crane is not a browser. |

## Related docs (other repos)

- This repo: [security.md](security.md)
- Harness architecture: `repos/ai-gantry/docs/architecture.md`
- Harness design (non-goals: "Web dashboard, gateway, REST/WS API"):
  `repos/ai-gantry/docs/design.md`
- Discord / Slack as outbound templates:
  `repos/ai-gantry/docs/discord.md`, `docs/slack.md`
- Yard Tunnel vs portal: gantree `docs/install.md`, `docs/architecture.md`
- "Tiny relay, gantry long-polls" (webhook inbound, same idea):
  `repos/ai-gantry/todo.md` (Webhook inbound)
