# Design

A phone we own, talking to a crane, without opening a port on the
harness. Pitch: [root readme](../README.md). What it looks like:
[screens.md](screens.md). Wire:
[architecture.md](architecture.md). Other mouths:
[frontends.md](frontends.md). Same human, two mouths:
[sibling_phones.md](sibling_phones.md). Voice in / out:
[voice.md](voice.md). Authn: [security.md](security.md).
What's left: [todo.md](todo.md).

## Problem

ai-gantry is outbound-only. Telegram, Discord Gateway, and Slack
Socket Mode all work because **their** hosts are the mailbox. The crane
polls or keeps an outbound WebSocket. The phone talks to Telegram, not to
Kit's container.

We want a client that is ours. That means replacing Telegram's relay
function, not wrapping the Bot API in a prettier skin, and not putting
turns through Gantree.

Two phone ideas people mix up:

| Idea | What it is | This repo? |
| --- | --- | --- |
| Yard on a phone | Operator board in a browser (`/login`, cards, Kit's graphs) | No — gantree mobile track |
| Gantry pendant | Chat mouth. Message Kit. Cron can ping you. | Yes |

## Principles

1. **Zero inbound on the crane.** Same rule as Telegram. The new channel
   dials the mailbox. Do not grow a listen port on `gantry` so a phone
   can POST at it.
2. **Rendezvous, not a product server.** A phone and a Mini cannot find
   each other through NAT. Something always-on holds the mailbox. That
   something is **ours** (code we deploy), not Telegram. It does not have
   to live on the Mini. A Cloudflare Durable Object on our account is
   the same job as Slack's Socket Mode hub: both sides dial out to it.
   The DO's job is **the sockets meet here**, not streaming.
3. **Console never sits in a chat turn.** Gantree writes files and pulls
   Docker. Pairing the agent through the yard API is out of contract
   ([gantree-contract](https://github.com/shotah/ai-gantry/blob/main/docs/gantree-contract.md)).
4. **Allowlist on the crane.** `TELEGRAM_ALLOWED_USERS` stays the model.
   No pairing flow in the app. Empty allowlist is a config error. On
   this mouth the human id is a Google `sub`, not a Telegram number —
   [security.md](security.md). Not google-mcp's Gmail token.
5. **One channel loop.** The harness already has `Channel` + optional
   `Pusher`. We add a sibling next to `telegram/`, `discord/`, `slack/`,
   `stdio/`. We do not invent a second agent loop.
6. **Client is TypeScript / Vinext.** Same `app/` muscle as Gantree.
   Gantree is Vinext **on Node** because it needs `docker.sock`. This
   app has no Docker — Vinext's actual happy path is Cloudflare
   Workers. PWA first. The car mouth is a native sister
   (`gantry-cab`), not Expo wrapping this UI.
7. **The phone may send more than text.** Telegram only gets a location
   when you drop a pin. Owning the client means a small **context**
   blob on the wire (GPS first). The prompt stays stingy; the session
   store does not grow a GPS line on every history turn.

## Does it have to have a server?

Yes: a **mailbox**. No: a cloud API you pay a chat platform for.

Telegram is that mailbox today:

```text
phone  →  api.telegram.org  ←  crane (getUpdates)
```

A process on the Mini behind Tailscale also works. It is the wrong
default for a **phone**: the handset needs the VPN, the mailbox dies
when the Mini reboots, and the phone cannot send while home internet is
out even to leave a note.

A Worker we deploy is still "a server," the way Telegram is. The
difference: we write it, we can leave Cloudflare, the crane still only
dials **out**. That is not Gantree SaaS.

What we do **not** need for a first talk:

- Opening crane ports
- Tailscale on the phone (Worker path)
- Native APNs / FCM — Web Push (VAPID) is the lock-screen path
- App Store / Play Store
- A second VPS

## Mailbox: Worker vs Mini

**Lean Durable Object.** A plain Worker is the wrong primitive: it is
stateless. Two sockets (phone + crane) only meet if they hit the **same
isolate with memory**. That is a Durable Object — the sockets meet
here. One DO per crane slug. Hibernated WebSockets keep that room
without billing idle CPU. SQLite on the DO holds a short queue when the
other side is offline.

| | Mini process | Worker + Durable Object |
| --- | --- | --- |
| Phone on LTE, no Tailscale | Dead | Works (HTTPS) |
| Mini reboots | Mailbox gone | Mailbox stays; crane reconnects |
| Home internet down | Everything gone | Phone can still enqueue; Kit cannot think until the crane has net again |
| CF / Telegram-class outage | N/A | Chat dead |
| What you already have | Tailscale, Docker | Tunnel for the **yard** (`compose.cloudflare.yml`) — different product |
| Cost | Electricity you already pay | Workers Free has DOs now; personal chat is noise. Paid ($5) if we outgrow free. |

Cloudflare **Tunnel** is the wrong button. Tunnel exposes the Mini
(gantree `:3000`). Chat should not ride that into the console. The
**portal** Worker (yard skin, later, never `docker.sock`) is also the
wrong Worker. Mailbox Worker ≠ portal Worker.

A Mini hub remains a **laptop hack** if Wrangler is down. It is not the
shape we ship to a pocket.

## Stack: Vinext on Workers

Gantree already picked Vinext. Do not invent a second UI framework.
Do not copy Gantree onto Workers — that process must see Docker.

This repo is a **second** Vinext app: chat shell + Google sign-in +
a Durable Object mailbox. Cloudflare's own Vinext examples bind DOs
and WebSockets in the same Worker as `app/`. That is the mouth.

| | Gantree | gantry-pendant |
| --- | --- | --- |
| Framework | Vinext | Vinext |
| Target | Node on the Mini | Cloudflare Workers |
| Why | `docker.sock`, files | No Docker. Phone on LTE. |
| Login | Passphrase door | Google OIDC in the app |
| Talks to | Docker + crane files | Durable Object; crane dials in |

Google Cloud: **same project you already use** for google-mcp. New
**Web application** client (`openid email profile`), redirect = this
app's origin. Not the Pages `oauth-catch` URI, not the Desktop client,
not Workspace scopes. Console muscle, new client id.

Cloudflare **Access** (Zero Trust) is CF's auth platform: a login gate
in front of a hostname. It is not a substitute for this app. Worker-
level Access currently **403s WebSocket upgrades**. The crane is a
machine, not a browser. Put Google in the Vinext app. Leave Access off
the mailbox unless we later wrap only the document origin with a
**hostname** Access app (not "Protect this Worker").

Cron, spark, and watches already push through the channel. The new
channel must implement `Pusher`, not only reply-to-message, or scheduled
pings stay stuck on Telegram.

## What we host

| Already | New | Later, optional |
| --- | --- | --- |
| Mini, Docker, cranes, LLM | Vinext app on Workers + Durable Object | Native APNs / FCM if the PWA is not enough |
| GCP project (google-mcp) | New Web OAuth client, openid only | TestFlight / Play sideload |
| CF account (Tunnel for the yard) | Crane env: mailbox URL + bearer | Mini hub only as a local fallback |
| Tailscale (console, SSH) | VAPID keys (lock-screen Web Push) | — |

## Phone context (GPS first)

Telegram's location is a **special message**. The harness already knows
that: inbound `[location] lat=… lon=…`, `here.Pin` per session, clock
footer `[last pin]`. A bare pin updates the cursor and does **not**
start a turn. Recipes then say "ask for a pin if it's stale."

A client we own attaches coords to **every text** (and photo), so the
pin is seconds old instead of hours. That is the point. "What's near
me" / leave-by / directions should not require a ritual pin.

**Wire is generous later. Prompt is stingy. PWA today is GPS first.**

| On the wire | Prompt / `here` | History (`session`) |
| --- | --- | --- |
| `geo`: lat, lon, `accuracy_m` (GPS on + granted) | `here.Set` this send → `[last pin]` | **Not** copied into `Message.Text` |
| `at` + IANA `tz` | Parsed if a mouth sends them; PWA does not stamp them until the harness reads phone tz | No |
| `battery` / `net` / `surface` | Same: additive, unused. Cab may still send them | No |

Do **not** stuff `[location]` into the user text on every send. That
is how Telegram location messages work, and it would re-bill coords
on every later Completer call. Update `here` from structured context;
leave `Text` as what they typed.

```text
text, images?,
context?: {
  at, tz,
  geo?: { lat, lon, accuracy_m, alt_m?, heading?, speed_mps? }
  battery?: { pct, charging }
  net?: wifi | cellular | unknown
  surface?: browser | android | android_auto
}
```

GPS denied, unavailable, or toggled off in-app → message still sends.
OS prompt once; `pendant.geo=off` sits on top without revoking Chrome's
grant. PWA: `getCurrentPosition` on send (HTTPS). Not `watchPosition`
in the background — iOS will kill it, and we do not need live-period
yet.

A silent **pin** control sends `{ context.geo }` with empty text
(`kind: pin`). The harness treats that like a Telegram bare pin: cursor
updates, no Completer.

**Shipped on the phone:** GPS on send, in-app toggle, silent pin, photo
compress (HEIC/PNG → JPEG under the chat cap), screen wake while waiting,
vibrate + badge on inbound ping, manifest shortcuts (Message / Pin),
Web Push (VAPID) when the phone socket is gone. `context.at` / `tz` /
battery / net / surface stay off the PWA wire until the harness uses
them (`lib/phone/context.ts`).

**Later:** reverse-geocode is a maps **tool** on the crane, not a client
field. Captioned photo (paste screenshot, do not send on attach), pin
chip on the outbound bubble, timestamps, copy/retry, crane-up vs
`live`, reload-keeps-the-thread, share-target / Expo —
[todo.md](todo.md). Voice is mouth STT/TTS, not audio on the
wire — [voice.md](voice.md). Motion / "home" labels stay Expo.
Native APNs / FCM stay later.

**Never on the wire:** SSID / BSSID, Bluetooth neighbors, clipboard,
contacts dump. Fingerprinting, not chat.

Reuse `internal/here`. Do not invent a second location store. Accuracy
(and maybe heading) can grow on `Pin` when the footer wants `±12m`.

## Android and iPhone

PWA for the pocket. Cab for the car. Same mailbox.

| Path | Android | iPhone | When |
| --- | --- | --- | --- |
| **PWA** | Install from Chrome | Add to Home Screen. Push exists since 16.4; background is still weak. | First client |
| **gantry-cab** | Sideload APK + Android Auto | — | Spoken reply / reminders in the car |
| **Expo** | Sideload APK | Apple Developer ($99/yr) + TestFlight (EAS can sign) | When PWA feels like a bookmark |

Store listing is not the experiment. Sideload and a Home Screen icon are.

Chrome Install does **not** unlock extra sensors. HTTPS + an OS
permission does. Install is a home-screen icon, standalone chrome, and
a better shot at Web Push.

## Non-goals

- Hosted cellphone SaaS (other people's cranes on our Worker)
- Chat in the Gantree console
- Inbound webhook port on the crane (see ai-gantry's "tiny relay"
  note: something POSTs at the relay, gantry long-polls — same idea,
  now the relay is a DO)
- Feature-matching Telegram (groups, channels, stickers, Mini Apps)
- Making the yard's phone layout "done"
- Putting the mailbox on the portal Worker
- Caching chat in `sw.js` (socket is the source of truth)
- Reverse-geocode in the client (stale label on the wire)

## Done enough to experiment

You open the phone on cellular, talk to Kit, she answers, a scheduled
ping can reach you with the app open, the crane still has **no inbound
port**, and Telegram can stay on another crane.
