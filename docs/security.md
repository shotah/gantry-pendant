# Security

How the phone proves it may talk to Kit, how the crane proves it is
Kit, and why that is **not** google-mcp OAuth. Shape:
[architecture.md](architecture.md). Why a Worker mailbox:
[design.md](design.md).

Gantree’s door (operator passphrase) stays on the **yard**. Harness
allowlists stay on the **crane**. This Worker is a third door: the
mailbox. Do not merge them.

---

## Threat model

| Actor | Goal we care about |
| --- | --- |
| Random internet | Connect to `workers.dev`, inject text/GPS, burn LLM |
| Someone with a Google account not on the list | Same, after “Sign in with Google” |
| Stolen phone / stolen Google session | Talk to Kit, see replies, leak live GPS |
| Stolen crane mailbox token | Impersonate the crane, read the queue, send fake replies to the phone |
| Compromised allowlisted human | Same as Telegram today: tools (mail, calendar, maps) as the operator |
| Worker logs / CF support | Read GPS, photos, chat if we log bodies |
| Prompt injection in a message | Steer tools; GPS labels are untrusted text too |

Out of scope: multi-tenant SaaS, Sign in with Apple (until an App Store
build), turning the Worker into Gantree’s IdP.

The bar is Telegram’s: **strangers do not get a turn**. An allowlisted
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
| **Human** | Sign in with Google (OIDC). Worker checks the ID token. | Google `sub` (stable). Email is the human-editable label. |
| **Crane** | Bearer in crane `.env` (same job as `TELEGRAM_BOT_TOKEN`). | Token is bound to **that** crane slug. Kit’s token cannot join Ada’s DO. |

Empty human allowlist is a boot/config error, same as
`TELEGRAM_ALLOWED_USERS`. The Worker refuses unknown `sub` **before**
the frame hits the DO. The crane allowlists too (fail closed if the
Worker is mis-set). Duplicate of 1–3 emails is acceptable.

Gantree operator **email** is already a profile label (not a reset
link). Later, “add this operator to Kit’s phone mouth” can copy that
address onto the crane list. The yard still logs in with a passphrase.
The Worker never accepts a `gantree_session` cookie.

---

## Do not reuse MCP OAuth

google-mcp, strava-mcp, and go-garmin OAuth are **tool grants**: the
agent acting as you against Gmail / Strava / Garmin. Chat `/auth` is a
PKCE paste (or Garmin MFA). Tokens live in that crane’s `data/`. The
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
- Redirect: this app’s origin (`https://…workers.dev/api/auth/callback/google`
  or whatever VinextAuth/Auth.js uses) — not the Pages `oauth-catch`
  URI, not `localhost:4100`
- App verifies `iss`, `aud`, `exp`, signature (Google JWKS)
- Secret lives in Worker secrets, not `data/google-oauth.json`

Same Google *account*. Different client id.

---

## Vinext app vs Cloudflare Access

Workers do not come with a login screen. Two ways to put Google in
front of a hostname:

| | Vinext app (Google provider) | Cloudflare Access (Zero Trust) |
| --- | --- | --- |
| What it is | OAuth in our code, same idea as NextAuth | CF’s auth **platform**: login gate before the Worker runs |
| Where identity lives | Our session cookie after Google | `CF_Authorization` / `ctx.access` |
| Crane (Go, no browser) | Bearer we mint | Access **service token** (second identity system) |
| WebSockets | Ours | Worker-level Access **403s WebSocket upgrades**. Hostname Access can proxy them; “Protect this Worker” cannot. |
| Allowlist of 1–3 people | Our `sub` list | Access policy (email) plus we still need crane bind |

**Put Google in the Vinext app.** That is the GCP setup we already
know: Web client, redirect URI, client id/secret. Access is optional
later on the **document** hostname only, never as the only lock on the
crane socket, and not the one-click Worker Access button.

**Not for the spike.** Two browser tabs can share a mailbox secret.
Google OIDC lands when a real phone talks.

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
  Cloudflare’s edge, TLS by default.
- Public Worker + tokens. Not `0.0.0.0` on the Mini.
- Custom hostname later; `workers.dev` is fine if tokens hold.

### Authn on every frame

Handshake is not enough. Phone frames carry a Google ID token (or a
short Worker session minted from one). Crane frames carry the bearer.
Reject missing/expired. Bind DO id to the crane slug in the token
(`kit` cannot write `ada`).

Worker session after Google: httpOnly cookie or a DO-side session id
with idle/absolute caps (copy Gantree’s idea: idle days, absolute
days, hash at rest). Not a JWT in `localStorage` if we can avoid it.
PWA WebSocket from the same origin can use a cookie; document if we
cannot.

### Allowlist

- Humans: Google `sub` list. Email is display and Gantree copy-paste,
  not the only key (`sub` survives an email change).
- No in-app pairing. First user is whoever you put in env. Same
  Telegram lesson.
- Crane: one bearer per crane, rotate by rewriting `.env` + Worker
  secret and recreating.

### Bodies

- Untrusted. Size cap on text, `context`, images (photos are the
  quota bomb).
- GPS is **sensitive**. Do not `console.log` lat/lon. Do not put geo
  in CF logpush. Queue on the DO is short-lived; `here.Pin` stays
  in-memory on the crane (process restart clears, as today).
- Do not persist chat bodies in Worker KV “for later” unless we have a
  retention story. The crane’s `gantry.db` is the mailbox dump.

### Abuse

- Rate limit per `sub` and per crane token (turns/min, bytes/min).
- Global cheap 429 if the Worker is being sprayed (login and frames).
- Same error for unknown user vs bad token (no user enumeration on
  Google email).

### Isolation

- One DO per crane slug. No shared room.
- Mailbox Worker ≠ Gantree portal Worker. No `docker.sock`, no yard
  session, no `.env` reads.

### Stolen phone / token

1. OS lock / find my device
2. Google: sign out other sessions
3. Yank `sub` from allowlist, rotate crane bearer
4. Recreate crane if `.env` leaked

---

## Spike vs later

| When | Auth |
| --- | --- |
| Spike (two tabs) | One shared secret on the Worker. Not production. |
| Phone on LTE | Google OIDC for the human + crane bearer |
| Gantree wizard | Writes crane bearer + allowlist into `.env`; Worker secrets stay with this app |

---

## Related

- Harness: `repos/ai-gantry/docs/security.md` (allowlist, no pairing)
- MCP hop: `repos/ai-gantry/docs/auth.md` (paste PKCE — tools, not this)
- Yard door: gantree `docs/security.md` (passphrase, roles — not this)
