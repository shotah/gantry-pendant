# Architecture

How a phone we own talks to a crane without a listen port on the harness.
Contract and walk: [design.md](design.md). Authn:
[security.md](security.md). Pitch: [root readme](../README.md).

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
[ phone browser / PWA  — Vinext app ]
        |
        |  HTTPS + cookie after Google OIDC
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

The Vinext app is the front door (chat UI + Google login). The Durable
Object is the room. Phone and crane both **connect in**. Hibernation
keeps the sockets without billing idle CPU. A short SQLite queue on
the DO holds messages while the other side is gone (Mini reboot, app
backgrounded). Kit’s face is a JPEG blob on that same DO (`GET/POST
/api/avatar`) — not a chat `images[]` turn. Gantree’s Photo fold writes
`persona/avatar.jpg` and, for `CHANNEL=pendant`, POSTs it here the way
it calls `setMyProfilePhoto` for Telegram.

This is not Gantree’s `app/` deployed to Workers. Gantree stays Node on
the Mini. Vinext’s Workers target is what this second app uses because
it does not need Docker. CF’s Vinext examples already bind DOs in the
same Worker as the pages.

A stateless Worker cannot do this by itself: two requests do not share
memory. D1-plus-short-poll is a possible mailbox (Telegram `getUpdates`
clone) but streaming replies and live “typing” want the DO socket.

```text
gantry-pendant/            this checkout — Vinext app + DO mailbox
  README.md
  docs/                    design, architecture, security, screens
  app/                     chat shell + Google login + PWA
  worker/                  Durable Object mailbox
  lib/dev/                 loopback mock + canned scenes
  assets/docs/             phone shots (`npm run shot`)

ai-gantry/                 harness — new internal/channel/ sibling
  internal/channel/        Channel, Pusher, Message, Outbound
    telegram/
    discord/
    slack/
    stdio/
    pendant/               not written yet

gantree/                   yard — CHANNEL in the build wizard, last
                           still Vinext-on-Node. Not this Worker.
```

Gantree does not grow a chat route. When the channel exists, the wizard
gains another mouth the way it already has Discord and Slack: env +
allowlist, then recreate.

## Channel contract (harness)

The client never calls the model. The crane’s existing loop does:

```text
channel.Run  →  Handler(Message) → reply string
channel.Push →  Outbound           → cron / spark / watch
```

`Message` already has `SessionID`, `UserID`, `Text`, `Images`, `ChatID`,
`ThreadID`. Streaming is optional (`ReplyWriter` on the context). A first
relay channel can send whole replies; placeholder + edit can wait. A DO
WebSocket makes that edit cheap later.

Slash commands are the same list Telegram registers (`setMyCommands`).
The catalog lives in ai-gantry `internal/slash`. `/help`, stdio’s ready
line, Telegram’s `/` menu, and pendant’s picker all read it. The crane
publishes a `cmds` frame when it dials the mailbox; the DO remembers it
for the next phone connect. Pendant does not keep a second copy.

Phone **context** is extra on the mailbox frame, not a second chat
API. GPS, battery, and net ride next to `text`. The relay
channel maps `context.geo` → `here.Set` (same pin the clock footer
already prints). It does **not** prepend `[location]` to `Text` —
Telegram does that for an explicit pin, and putting it on every turn
would freeze coords into session history.

```text
phone  { text, images?, context.geo }
   →  DO
   →  channel.Message{ Text, Images, Context }
   →  here.Set(session, pin)     // in-memory last pin, as today
   →  Handler                    // prompt footer [last pin]; Text is the words
```

Telegram pins still work on a Telegram crane. This channel just keeps
the cursor fresh without asking. Bare-geo-only frames (no text, no
photo) can stay silent like a Telegram bare pin: update `here`, no
Completer.

PWA spike: optional fake `geo` in the browser tab; real
`navigator.geolocation` on the phone. Denied permission = omit
`context.geo`.

Allowlist is crane env, same as Telegram (Google `sub` on this mouth).
The mailbox authenticates the crane (bearer) and the human (Google ID
token). Untrusted bodies; fail closed. Details:
[security.md](security.md).

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

## First spike (prove talk)

Skip the phone OS. Skip the harness. Skip the Mini.

1. Vinext on Workers + one Durable Object.
2. Open two browser tabs against that origin.
3. Type in A, see it in B, reply.

Then replace tab B with `CHANNEL=pendant`. Then replace tab A with a PWA
on a real phone **on cellular**.

A Mini WebSocket hub is a fallback if we cannot deploy Vinext to
Workers yet. Do not treat it as the architecture.

## Android / iPhone in this picture

The architecture does not care about stores. The client is a WebSocket
(and later HTTP for history/media) consumer of the Worker. Location
uses the browser Geolocation API on send; Expo later if we want
background or motion.

Vinext is Next-shaped on Vite: `app/manifest.ts` is a metadata route
(`/manifest.webmanifest`, `application/manifest+json`). Icons and
`public/sw.js` are static. Chrome Install is that manifest + 192/512
PNGs on HTTPS (or loopback). No extra PWA plugin. Expo is later.

```text
PWA (both phones)  ─┐
Expo Android APK   ─┼─►  same Durable Object
Expo iOS TestFlight─┘
```

Push notifications (APNs / FCM) are a **second** path: Worker → platform
push → lock screen. They do not replace the socket while the app is
open. They do not belong in the spike. Cloudflare will not send APNs
for us.

## Why not these shapes

| Shape | Why not |
| --- | --- |
| Phone talks to `gantree:3000` chat API | Console in the turn. Contract forbids it. |
| Crane `:443` + TLS | Inbound on the agent. NAT, sleep, and the port rule. |
| Telegram userbot / Mini App | Still Telegram’s mailbox; ToS and not “our client.” |
| Phone is the server | Phones sleep, change IP, leave the house. |
| Mailbox process on the Mini | Works on a desk. Phone needs Tailscale; mailbox dies with the Mini. |
| Stateless Worker only (no DO) | No room: phone and crane never share state. |
| D1 as the only mailbox | Fine as a `getUpdates` clone; weak for streaming. Use if we refuse DOs. |
| Tunnel to the Mini “relay” | Exposes the house. Phone still depends on home internet. |
| Gantree `app/` on Workers as the mouth | Yard needs Docker. This is a second Vinext app. |
| Cloudflare Access as the only lock | Worker-level Access 403s WebSockets. Crane is not a browser. |

## Related docs (other repos)

- This repo: [security.md](security.md)
- Harness architecture: `repos/ai-gantry/docs/architecture.md`
- Harness design (non-goals: “Web dashboard, gateway, REST/WS API”):
  `repos/ai-gantry/docs/design.md`
- Discord / Slack as outbound templates:
  `repos/ai-gantry/docs/discord.md`, `docs/slack.md`
- Yard Tunnel vs portal: gantree `docs/install.md`, `docs/architecture.md`
- “Tiny relay, gantry long-polls” (webhook inbound, same idea):
  `repos/ai-gantry/todo.md` (Webhook inbound)
