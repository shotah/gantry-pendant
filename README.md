# gantry-pendant

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

**Docs (the plan lives here, not in chat):**

| File | What it is |
| --- | --- |
| [docs/design.md](docs/design.md) | Why this shape, Worker vs Mini, phone context (GPS), walk |
| [docs/architecture.md](docs/architecture.md) | How the three pieces talk |
| [docs/security.md](docs/security.md) | Two principals, Google OIDC in the Vinext app vs Access vs MCP |

Nested checkout under gantree (`repos/gantry-pendant`), own git
remote, same pattern as `repos/ai-gantry`. Empty of product code until
the relay spike.

## This is not

- A mobile layout of [gantree](https://github.com/shotah/gantree). That
  board already opens in a phone browser. Pretty yard UI is a different
  track.
- Chat through the console HTTP API.
- An inbound port on the crane.
- The Gantree **portal** Worker (yard skin). Different Worker, different
  auth, never `docker.sock`.
- A hosted SaaS or App Store listing.

## Three pieces

| Piece | Repo | Job |
| --- | --- | --- |
| Client | **this repo** (Vinext `app/`) | Chat UI. Google sign-in. PWA. Same framework as Gantree, **Workers** target. |
| Relay | same Worker (Durable Object) | Mailbox per crane. Phone and crane both dial **in**. |
| Channel | **ai-gantry** `CHANNEL=pendant` | Same `Channel` / `Pusher` as Telegram. Allowlist. Cron can still ping you. |

Telegram stays the production mouth until this path works on one crane.

## Hello (when there is code)

Nothing to run yet. Read [design.md](docs/design.md), then
[architecture.md](docs/architecture.md) and [security.md](docs/security.md).
First spike: Vinext on Workers + one Durable Object, two browser tabs,
then a harness channel that dials that Worker.
