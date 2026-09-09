# <img src="assets/logo.svg" alt="" width="40" height="40"> gantry-pendant

<p align="center">
  <img src="assets/banner.svg" alt="Handheld control for the crane — phone and crane both dial in, nothing listens" width="100%">
</p>

<p align="center">
  <a href="https://github.com/shotah/gantry-pendant/actions/workflows/ci.yml"><img src="https://github.com/shotah/gantry-pendant/actions/workflows/ci.yml/badge.svg" alt="CI"></a>
  <a href="https://github.com/shotah/gantry-pendant/actions/workflows/ci.yml"><img src="https://github.com/shotah/gantry-pendant/raw/gh-pages/badges/coverage.svg" alt="Coverage"></a>
  <a href="https://github.com/shotah/gantry-pendant"><img src="https://img.shields.io/github/package-json/v/shotah/gantry-pendant?label=version" alt="Version"></a>
  <a href="LICENSE"><img src="https://img.shields.io/github/license/shotah/gantry-pendant" alt="License"></a>
</p>

> **gantry** *(n.)* — the rigid frame that holds and positions tools.
>
> **pendant** *(n.)* — the handheld control on that crane. You walk the
> floor with it. You do not sit in the yard office.

A chat mouth for [ai-gantry](https://github.com/shotah/ai-gantry) that we
own. Not the yard board. Not Telegram. Jewelry is the other English
sense; the prefix is the crane.

Today you message Kit on Telegram. The crane dials **out**; nothing
listens. This repo is that loop on a phone we control: a Vinext app,
a Durable Object mailbox, a new harness channel. Gantree still
operates cranes. It does not sit in a chat turn.

```text
phone  →  Vinext on Cloudflare Workers (Google login + Durable Object)  ←  crane (outbound)
```

The phone only needs HTTPS. The crane still opens **zero** inbound
ports. The Mini does not have to be the mailbox.

<p align="center">
  <img src="assets/docs/login.png" alt="Sign in with Google" width="180">
  &nbsp;
  <img src="assets/docs/thread.png" alt="Ada talking to Kit" width="180">
  &nbsp;
  <img src="assets/docs/ping.png" alt="Cron ping in the thread" width="180">
  &nbsp;
  <img src="assets/docs/photo.png" alt="Photo on an inbound turn" width="180">
</p>

Every screen, Lamp theme, crane stand-in: [docs/screens.md](docs/screens.md).

**Docs (the plan lives here, not in chat):**

| File | What it is |
| --- | --- |
| [docs/todo.md](docs/todo.md) | What's left — walks, one allowlist, later |
| [docs/deployment.md](docs/deployment.md) | Cloudflare once, then `npm run release` |
| [docs/screens.md](docs/screens.md) | What the mouth looks like (phone shots) |
| [docs/setup.md](docs/setup.md) | Admin / user / connect — what you paste where |
| [docs/edgecases.md](docs/edgecases.md) | Gotchas across pendant + gantree + ai-gantry |
| [docs/design.md](docs/design.md) | Why this shape, Worker vs Mini, phone context |
| [docs/architecture.md](docs/architecture.md) | How the three pieces talk |
| [docs/security.md](docs/security.md) | Two principals, Google OIDC vs Access vs MCP |

Nested checkout under gantree (`repos/gantry-pendant`), own git
remote, same pattern as `repos/ai-gantry`.

## Hello

```bash
cp .dev.vars.example .dev.vars   # MAILBOX_SECRET + PENDANT_DEV
npm install
npm test
npm run lint                     # ESLint + markdownlint, writes fixes
npm run dev                      # http://127.0.0.1:3000 — Chrome can Install from here
```

Loopback with `PENDANT_DEV=1`: mock Ada, no Google. `/?sample=thread`
(and `ping`, `photo`, `empty`, …) paints canned scenes.
Compose without a sample gets canned Kit replies. Type the spike
secret to join the real room.

Open two tabs: `/` (phone) and `/crane` (crane stand-in). Same slug,
same secret. Type in one, see it in the other.

```bash
npm run shot                     # assets/docs/*.png — needs `npm run dev`
npm run secret                   # mint a loopback bearer / mailbox secret
# npm run secrets:push           # leftover — Gantree Settings owns workers.dev secrets
npm run deploy                   # after `npm run build` — workers.dev (laptop)
npm run release                  # bump patch, tag, push (GitHub Release + Workers)
npm run release:dry              # print the next tag only
```

Google login is a **new Web application** client on the same GCP
project as google-mcp. Scopes: `openid email profile` only. Redirect:
`https://<this-origin>/api/auth/callback/google` — not the Pages
`oauth-catch` URI, not `localhost:4100`.

**This repo deploys Worker code.** Google / `SESSION_SECRET` /
`CRANE_BEARERS` are **Gantree Settings → Pendant** and Build (mint a
bearer per crane). Bind KV `DIRECTORY`. `ALLOWED_SUBS` is optional
break-glass. Empty crane list fails boot. The spike secret is rejected
once Google is on. GitHub Actions deploys on `main` and `v*` tags; CI
never sees Worker app secrets.

Leftover, no yard: `.env` + `npm run secrets:push`. Do not mix that
with Gantree after the yard owns `CRANE_BEARERS`.

Crane env (`CHANNEL=pendant`) is written by Gantree:

```env
PENDANT_MAILBOX_URL=wss://gantry-pendant.<account>.workers.dev/ws/kit
PENDANT_BEARER=<bound to kit>
PENDANT_ALLOWED_USERS=<email or google-sub>
```

Yard: Settings → Pendant once, then Build channel **pendant**, tick
who may talk, recreate. No bearer paste. The console cookie never goes
to this Worker. First Workers ship: [docs/deployment.md](docs/deployment.md).
Then [docs/setup.md](docs/setup.md).

## This is not

- A mobile layout of [gantree](https://github.com/shotah/gantree). That
  board already opens in a phone browser. Pretty yard UI is a different
  track.
- Chat through the console HTTP API.
- An inbound port on the crane.
- The Gantree **portal** Worker (yard skin). Different Worker, different
  auth, never `docker.sock`.
- A hosted SaaS or App Store listing.
- google-mcp OAuth (Gmail/Drive). That is a tool grant, not phone login.

## Three pieces

| Piece | Repo | Job |
| --- | --- | --- |
| Client | **this repo** (Vinext `app/`) | Chat UI. Google sign-in. PWA. Same framework as Gantree, **Workers** target. |
| Relay | same Worker (Durable Object) | Mailbox per crane. Phone and crane both dial **in**. |
| Channel | **ai-gantry** `CHANNEL=pendant` | Same `Channel` / `Pusher` as Telegram. Allowlist. Cron can still ping you. |

Telegram stays the production mouth until this path works on one crane.
