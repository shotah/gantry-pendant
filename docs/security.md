# Security

How the phone proves it may talk to Kit, how the crane proves it is
Kit, and why that is **not** google-mcp OAuth. Shape:
[architecture.md](architecture.md). Why a Worker mailbox:
[design.md](design.md). Who pastes what: [setup.md](setup.md). Cab
and later iOS: [frontends.md](frontends.md).

Gantree's door (operator passphrase) stays on the **yard**. Harness
allowlists stay on the **crane**. This Worker is a third door: the
mailbox. Do not merge them.

---

## Threat model

| Actor | Goal we care about |
| --- | --- |
| Random internet | Connect to `workers.dev`, inject text/GPS, burn LLM |
| Someone with a Google account not on the list | Same, after "Sign in with Google" |
| Stolen phone / stolen Google session | Talk to Kit, see replies, leak live GPS |
| Stolen crane mailbox token | Impersonate the crane, read the queue, send fake replies to the phone |
| Compromised allowlisted human | Same as Telegram today: tools (mail, calendar, maps) as the operator |
| Worker logs / CF support | Read GPS, photos, chat if we log bodies |
| Prompt injection in a message | Steer tools; GPS labels are untrusted text too |

Out of scope: multi-tenant SaaS, Sign in with Apple (until an App Store
build), turning the Worker into Gantree's IdP.

The bar is Telegram's: **strangers do not get a turn**. An allowlisted
person who is compromised can still burn quota. GPS on every send makes
a stolen session worse than a Telegram pin — treat it that way.

---

## Two principals

The mailbox has two callers. They do not share a credential.

```text
phone  — Google ID token (human) —►  Worker → Durable Object (crane slug)
crane  — mailbox bearer (machine) —►  Worker → same Durable Object
```

| Who | Proves | Allowlist |
| --- | --- | --- |
| **Human** | Sign in with Google (OIDC). Worker checks the ID token. | Room list from the crane (`allow` frame). `sub` or verified email. Optional `ALLOWED_SUBS` extra. |
| **Crane** | `Authorization: Bearer` from crane `.env` (same job as `TELEGRAM_BOT_TOKEN`). | Token is bound to **that** crane slug. Kit's token cannot join Ada's DO. |

Empty crane list is a boot error, same as
`TELEGRAM_ALLOWED_USERS`. The Worker refuses anyone not on the **room**
list (last `allow` frame) at handshake **and** on every later frame.
Optional `ALLOWED_SUBS` is a yard-wide extra, not a requirement.
The crane allowlists too (fail closed if the Worker is mis-set).

Real crane: header only. `?bearer=` / `?secret=` are **spike mode**
(two tabs). An oidc-mode upgrade with a query token is 401. `/crane`
is the loopback stand-in under `PENDANT_DEV`, not production.

Gantree operator **email** is already a profile label (not a reset
link). Later, "add this operator to Kit's phone mouth" can copy that
address onto the crane list. The yard still logs in with a passphrase.
The Worker never accepts a `gantree_session` cookie.

---

## Do not reuse MCP OAuth

google-mcp, strava-mcp, and go-garmin OAuth are **tool grants**: the
agent acting as you against Gmail / Strava / Garmin. Chat `/auth` is a
PKCE paste (or Garmin MFA). Tokens live in that crane's `data/`. The
console does not become the IdP
([gantree security](https://github.com/shotah/gantree/blob/main/docs/security.md)).

| Credential | What it is | Phone login? |
| --- | --- | --- |
| `google-oauth.json` (Workspace) | Gmail, Calendar, Drive, … | **No.** Wrong scopes, wrong client, wrong file. |
| Strava OAuth | Activities as you | **No.** Not an IdP. |
| Garmin MFA paste | Fitness as you | **No.** |
| Gantree passphrase | Yard door | **No.** Console not in the turn. |
| Telegram user id | Mouth allowlist today | Replaced by Google `sub` on this channel |

Pivoting the **phone** to Google is right. Pivoting to **those**
tokens is not. A stolen chat session must not be a Gmail refresh
token. `/auth google` must not mint a Worker session.

Sign in with Google for the Vinext app is a **new** OAuth client on
the **same GCP project** you already have for google-mcp. Console
muscle, not token reuse.

- Type: **Web application**
- Scopes: `openid email profile` only — never Gmail/Drive/Calendar
- Redirect: this app's origin (`https://…workers.dev/api/auth/callback/google`)
  — not the Pages `oauth-catch` URI, not `localhost:4100`
- App verifies `iss`, `aud`, `exp`, `nonce`, signature (Google JWKS)
- Authorization request uses PKCE (`code_challenge` S256) + `state`
- Secret lives in Worker secrets, not `data/google-oauth.json`

Same Google *account*. Different client id.

---

## Vinext app vs Cloudflare Access

Workers do not come with a login screen. Two ways to put Google in
front of a hostname:

| | Vinext app (Google provider) | Cloudflare Access (Zero Trust) |
| --- | --- | --- |
| What it is | OAuth in our code, same idea as NextAuth | CF's auth **platform**: login gate before the Worker runs |
| Where identity lives | Our session cookie after Google | `CF_Authorization` / `ctx.access` |
| Crane (Go, no browser) | Bearer we mint | Access **service token** (second identity system) |
| WebSockets | Ours | Worker-level Access **403s WebSocket upgrades**. Hostname Access can proxy them; "Protect this Worker" cannot. |
| Allowlist of 1–3 people | Our room list | Access policy (email) plus we still need crane bind |

**Put Google in the Vinext app.** That is the GCP setup we already
know: Web client, redirect URI, client id/secret. Access is optional
later on the **document** hostname only, never as the only lock on the
crane socket, and not the one-click Worker Access button.

Two browser tabs can share a mailbox secret on loopback. Google OIDC
is the phone path; the spike secret is rejected once `GOOGLE_CLIENT_ID`
is set.

---

## Why Google (for the human) anyway

Telegram is an IdP we do not control. Google is an IdP we already live
in (Gemini, google-mcp, operator email). For a handful of people on a
personal crane it is the least new invention:

- OS-grade account, 2FA they already use
- Allowlist is an email/`sub`, like pushing a Telegram id
- PWA: Google Identity Services on HTTPS
- Stolen phone: lock the device, revoke Google sessions, yank `sub`

It is still a third party (Google sees that this hostname got a login).
They do not see chat or GPS unless **we** log it.

---

## Hardening

### Network

- Crane still **outbound only**. Worker is the only new listener, on
  Cloudflare's edge, TLS by default.
- Public Worker + tokens. Not `0.0.0.0` on the Mini.
- Custom hostname later; `workers.dev` is fine if tokens hold.
- WebSocket upgrade: `Origin` must match the request origin when
  present (browsers). Missing `Origin` is allowed (Go crane).
- Authenticated `/ws/` strips `X-Pendant-Op` so a spoofed header cannot
  reach avatar HTTP.

### Authn on every frame

Handshake mints the session and tags the socket (`sub`, `exp`). Google
ID tokens do **not** ride later frames. The PWA WebSocket is
same-origin and sends the httpOnly cookie. Native cab upgrades with
`Authorization: Bearer` holding that same JWE (minted at
`POST /api/auth/token` from a Google ID token + nonce). Crane upgrade
sends `Authorization: Bearer` too — a **different** token, bound to the
slug. Bind DO id to the crane slug in that crane bearer (`kit` cannot
write `ada`).

On every `webSocketMessage` the mailbox re-checks the **room list**
(`sub` match, or verified email match) plus optional static
`ALLOWED_SUBS`, and session `exp`. Failure **closes** the WebSocket
with **4401**, not a chat `error` reply. A new `allow` frame walks
phone sockets and closes anyone no longer on it. Yanking a person
takes effect when the crane republishes (recreate), or on the next
frame if they were only on `ALLOWED_SUBS`.

Worker session after Google: httpOnly JWE cookie on the PWA, **hard
7-day `exp` at mint**. Cab stores the JWE on the device and sends it on
the header. No sliding refresh. Sign in again after expiry. Not a JWT
in `localStorage`.

Phone frames are forced to `inbound | pin | ack` server-side. The
phone cannot forge `reply` / `push` / `cmds`. Crane stamps `user_id`
from `ChatID` (Google `sub`).

### Allowlist

- Humans: the crane’s `PENDANT_ALLOWED_USERS`, published as an `allow`
  frame and stored on the Durable Object. `sub` is the key; verified
  email is an alias. Optional Worker `ALLOWED_SUBS` is break-glass.
- No in-app pairing. First user is whoever you put on the crane list.
  Same Telegram lesson.
- Crane: one bearer per crane, rotate by rewriting `.env` + Worker
  secret and recreating.
- Room list remembered while the crane is down — yank waits for a
  recreate. Bearer rotation is the instant kill.

### Bodies

- Untrusted. Size cap on text, `context`, images (photos are the
  quota bomb).
- Phone → crane images are `data:image/` only. `https://` is legal
  crane → phone (Telegram-style hosted URLs). Phone-supplied `https://`
  would be SSRF from the crane.
- GPS is **sensitive**. Do not `console.log` lat/lon. Do not put geo
  in CF logpush. The unread queue on the DO is short-lived. A capped
  transcript (`t:<sub>`, 80 bubbles) keeps the same frame bodies for
  reload; evict old. `here.Pin` stays in-memory on the crane.
- `context.at` / `tz` are phone-supplied hints. Order by DO time.
- Do not persist chat bodies in Worker KV. The crane's `gantry.db` is
  the agent dump; the DO transcript is the phone thread.
- Kit's face (`POST /api/avatar`) may be written by a listed phone or
  the crane bearer. Family mouth: Ada changing Kit's photo is fine.
  Cap is 5 MB JPEG; check `Content-Length` before buffering.
- Web Push subscriptions (endpoint + keys) live on the crane's Durable
  Object, keyed by Google `sub`. Yanking a person from the room list
  drops them. A 410 from the push service drops that device. Do not log
  endpoints.

### Abuse

- Rate limit per `sub` and per crane token (turns/min, bytes/min).
- Global cheap 429 if the Worker is being sprayed (login and frames).
- Same error for unknown user vs bad token (no user enumeration on
  Google email).

### Isolation

- One DO per crane slug. No shared room.
- Replies route by `user_id` / `sub`. Cron `push` with no `user_id`
  broadcasts. Ada's phones see Ada's replies; Bob does not.
- Mailbox Worker ≠ Gantree portal Worker. No `docker.sock`, no yard
  session, no `.env` reads.

### Stolen phone / token

1. OS lock / find my device
2. Google: sign out other sessions
3. Yank `sub` from allowlist (next frame is 4401), rotate crane bearer
4. Recreate crane if `.env` leaked

---

## Spike vs later

| When | Auth |
| --- | --- |
| Spike (two tabs) | One shared secret on the Worker. `?secret=` / `?bearer=` allowed on **loopback** only. A leftover `MAILBOX_SECRET` on `workers.dev` is config, not a room. |
| Phone on LTE | Google OIDC for the human + crane `Authorization: Bearer` |
| Gantree wizard | Writes crane bearer + allowlist into `.env`; Worker secrets stay with this app |
| `npm run dev` | `PENDANT_DEV=1` on **loopback only**: mock Ada, canned `?sample=` scenes, `/crane` stand-in. Not a session. Ignored on `workers.dev`. |

---

## Related

- Harness: `repos/ai-gantry/docs/security.md` (allowlist, no pairing)
- MCP hop: `repos/ai-gantry/docs/auth.md` (paste PKCE — tools, not this)
- Yard door: gantree `docs/security.md` (passphrase, roles — not this)
