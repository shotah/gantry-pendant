# Setup — who talks to Kit

Admin flow, user flow, and the paste that actually connects them.
Gotchas: [edgecases.md](edgecases.md). Auth: [security.md](security.md).
Shape: [architecture.md](architecture.md). What it looks like:
[screens.md](screens.md). What's left: [todo.md](todo.md).

This is **not** “add a field on the Gantree person and they can chat.”
Gantree operates cranes. Chat is the crane’s list, enforced by this
Worker. Saving a yard profile does not open the door.

## Who provisions what

| Piece | Where |
| --- | --- |
| Worker **code** (this app + Durable Object) | this repo — CI / `npm run release` |
| Worker **secrets** (Google, session, `CRANE_BEARERS`) | Gantree **Settings → Pendant** |
| Crane `.env` (channel, mailbox URL, bearer, allowlist) | Gantree **Build** / Pendant fold |

Do not `npm run secrets:push` after the yard owns those secrets. A bulk
put from this checkout can drop bearers Gantree minted.

## Short answer

| Question | Today |
| --- | --- |
| Where do I add a human who may talk to an agent? | One list: crane `PENDANT_ALLOWED_USERS`. Recreate. The crane publishes it; this Worker enforces it. |
| Is that all in Gantree? | The list, yes. Worker secrets too: Settings → Pendant (Google + session) and Build (one bearer per crane). |
| What do I add on the Gantree **user**? | Email (and, once learned, Google `sub`). Nothing that opens chat by itself. |
| How does that update ai-gantry? | Recreate the crane. The harness reads `CHANNEL=pendant` + `PENDANT_*` at **boot**. Restart keeps a ghost list. |
| How does the agent talk to that Google user? | Phone signs in on the pendant. `/api/auth/me` lists their cranes. Worker stamps `user_id` = `sub` and `email`. Crane ignores anyone not on `PENDANT_ALLOWED_USERS`. |

A yard operator can exist and still never reach Kit. A phone user can
talk to Kit without ever logging into Gantree.

---

## What you paste (the connect)

One human list. Email is a real match (verified Google claim,
lowercased), not a label. Gantree writes the crane `.env` and the
Worker `CRANE_BEARERS` line. You paste Google client + Cloudflare token
**once** in Settings.

```text
Cloudflare Worker   (Gantree Settings + Build)
  GOOGLE_*  SESSION_SECRET  CRANE_BEARERS=kit:<bearer>
  # ALLOWED_SUBS is optional break-glass, not required

Crane .env  (Gantree Build / Pendant fold — this is what ai-gantry reads)
  CHANNEL=pendant
  PENDANT_MAILBOX_URL=wss://gantry-pendant.<account>.workers.dev/ws/kit
  PENDANT_BEARER=<same bearer>
  PENDANT_ALLOWED_USERS=ada@example.com
```

```text
phone Google OIDC  →  session cookie  →  wss …/ws/kit  (role=phone)
crane bearer       →  outbound wss    →  same room     (role=crane)
                   →  allow frame     →  room list on the Durable Object
```

Gantree never sits on that path. The yard cookie is ignored if it shows
up on the Worker.

```text
                    Gantree (yard)
                    operator + passphrase
                           |
                           | Settings → Pendant  (Google, SESSION_SECRET)
                           | Build / rotate      (CRANE_BEARERS + crane .env)
                           v
phone -- Google --> Worker mailbox (room list) <-- crane (PENDANT_BEARER)
                         Durable Object /ws/kit
                           |
                           | frame.user_id = Google sub, email
                           v
                    ai-gantry CHANNEL=pendant
                    (PENDANT_ALLOWED_USERS)
                           |
                           v
                    Completer + tools + gantry.db
```

---

## Once (before any person)

The Worker **code** and the GCP client have to exist. Gantree cannot
create those. Steps: [deployment.md](deployment.md).

1. Deploy this repo ([deployment.md](deployment.md)). GitHub Actions
   deploys the Worker on push to `main` and on `v*` tags
   (`npm run release`), after tests. Laptop:
   `npm run build && npm run deploy`. Note the origin, e.g.
   `https://gantry-pendant.<account>.workers.dev`.

   First code deploy with no Worker secrets is `503 config` until
   Gantree pushes those (safe). Do not set `MAILBOX_SECRET` or
   `PENDANT_DEV` on the Worker.
2. GCP: **new Web application** client. Not Desktop, not the
   google-mcp client. **APIs & Services → Credentials → Create
   credentials → OAuth client ID.**

   | Field | Value |
   | --- | --- |
   | Application type | **Web application** |
   | Authorized JavaScript origins | `https://<that-origin>` |
   | Authorized redirect URIs | `https://<that-origin>/api/auth/callback/google` |

   Consent screen (once per project): **External** (or Internal if
   Workspace-only). Scopes `openid`, `email`, `profile` only — no
   Gmail/Drive. External + Testing: add yourself as a test user.

   Gantree Settings shows the redirect after you save origin. Not
   `oauth-catch`, not `localhost:4100`.
3. **Gantree Settings → Pendant** (admin). Cloudflare API token
   ([permissions](deployment.md#cloudflare-api-token)), account id,
   Worker name, origin, Google client id/secret. Save and push. That
   puts:

   ```text
   GOOGLE_CLIENT_ID
   GOOGLE_CLIENT_SECRET
   SESSION_SECRET          # minted if empty
   ```

   Optional: `ALLOWED_SUBS` as a yard-wide extra (break-glass). The
   crane list is the door. KV bind + GitHub paste for **code** deploy:
   [deployment.md](deployment.md).

   Leftover, no yard: `npm run secrets:push` from this `.env`. Do not
   mix that with Gantree after the yard owns `CRANE_BEARERS`.

   The moment Google is on, `MAILBOX_SECRET` (two-tab spike) is
   rejected. Leave Worker-level Cloudflare Access **off**.

Anyone with a Google account can finish sign-in. The cookie opens
**no room**. `/api/auth/me` returns `{ sub, email, cranes }`. Empty
`cranes` paints “not on any crane yet — give this to your yard admin”
with that person’s own email and `sub`. No enumeration: you only see
your own id.

---

## Admin flow (yard)

You are already a Gantree **admin**. Chat is still not this UI.

### A. Optional: a yard person

`/setup` (first boot) or Operators → create. Name + passphrase. Role
and assigned cranes decide who may **operate** Kit (grant, Secrets,
recreate) — not who may **message** her.

On `/profile` you can store email, Telegram / Slack / Discord ids, and
a Google `sub` once it is learned. Those do **not** become
`PENDANT_ALLOWED_USERS` until you tick the person on Kit’s Pendant
fold (confirm-scary).

### B. Point Kit at the mailbox

**New crane:** Build → channel **pendant** → tick who may talk
(email is enough). The yard mints the bearer, pushes `CRANE_BEARERS`,
fills `PENDANT_MAILBOX_URL`. No paste from this checkout.

**Existing crane:** Kit → Pendant fold → allowlist, or **Rotate bearer**.

Then **recreate**, not restart. ai-gantry reads the list at boot. An
empty `PENDANT_ALLOWED_USERS` fails boot (same as Telegram).

Kit’s photo is `persona/avatar.jpg` on the Mini (Photo fold), same JPEG
gate as Telegram. When `CHANNEL=pendant`, Gantree also POSTs that file
to this Worker (`/api/avatar?slug=`). The phone can replace it from the
header. Chat photos never become the face.

After you add a human, recreate Kit. The crane publishes `allow`; the
room follows. Bearer rotate from the panel is the instant kill if the
crane is down.

### C. Add another human later

1. Kit → Pendant fold: tick the operator (or paste an email).
2. Recreate Kit.

### D. Yank / stolen phone

1. Untick / remove from Kit’s Pendant list.
2. Recreate the crane. Their socket closes `4401` when the new `allow`
   lands (stale list until then).
3. Rotate bearer on the Pendant fold if the token leaked
   (instant kill while the crane is down).
4. Lock the phone; Google → sign out other sessions.

---

## User flow (phone)

The human does **not** need a Gantree login.

1. Admin has already put them on Kit’s list and recreated.
2. Open the pendant origin (HTTPS, or `http://127.0.0.1:3000` on a
   laptop). Chrome: **Install** in the address bar (desktop) or the
   menu (Android). iPhone Safari: Share → Add to Home Screen. Vinext
   serves the web app manifest at `/manifest.webmanifest`.
3. Sign in with Google.
4. Pick Kit from the crane list. Empty list: “not on any crane yet”
   with their email and `sub` to send the yard admin. Grant location
   if they want `[last pin]` this-send. Denied still sends text.
5. Type. Kit answers when the crane socket is up.
6. Tap Kit’s face in the header to set the same `avatar.jpg` the yard
   Photo fold uploads (JPEG, 5MB). The Worker stores it; a chat photo
   is still a turn, not a face change.

If Google works but Kit never answers: they are missing from the crane
list, or the crane was restarted instead of recreated. If the socket
401s: not on the room list (or the optional `ALLOWED_SUBS` extra), or
the session hit its hard 7-day `exp`. Cron / spark only lands while the
app is open — no lock-screen push yet.

A stranger who hits Sign in with Google gets a session and an empty
crane list. They never join a room.

Local mock (`PENDANT_DEV=1` on loopback) is **not** this flow. It
paints Ada and canned scenes so you can screenshot the mouth. See
[screens.md](screens.md). Never put that flag on `workers.dev`.

---

## How the agent talks back

1. Phone WebSocket is tagged with that `sub`. Each frame carries
   `user_id` (always `sub`) and `email` when Google verified it.
2. Durable Object fans the frame to the crane socket (or queues ≤50 /
   1h if Kit is mid-reboot).
3. `internal/channel/pendant` drops the frame unless `user_id` **or**
   `email` is on `PENDANT_ALLOWED_USERS`.
4. Session id is `pendant:<slug>:<sub>`. Completer runs. `Push` /
   replies write back to the same room.
5. GPS on the frame calls `here.Set`. It is **not** stuffed into
   `Message.Text`. Bare geo (no text, no photo) is a silent pin.

Kit’s bearer cannot join Ada’s `/ws/ada`. Two cranes must not share a
bearer. One container, one `CHANNEL` — Telegram can stay on another
crane.

---

## Checklist (first working mouth)

- [ ] Worker **code** deployed from this repo; GCP redirect = this origin
- [ ] Gantree Settings → Pendant: Google + session (`ALLOWED_SUBS` optional)
- [ ] KV `DIRECTORY` bound
- [ ] Gantree: Build channel pendant, tick humans, recreate (yard mints bearer)
- [ ] Phone Google sign-in; crane list or “not on any crane yet”
- [ ] Yard cookie never sent to the Worker
