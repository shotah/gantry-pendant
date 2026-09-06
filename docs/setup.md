# Setup — who talks to Kit

Admin flow, user flow, and the paste that actually connects them.
Gotchas: [edgecases.md](edgecases.md). Auth: [security.md](security.md).
Shape: [architecture.md](architecture.md). What it looks like:
[screens.md](screens.md). What's left: [todo.md](todo.md).

This is **not** “add a field on the Gantree person and they can chat.”
Gantree operates cranes. Chat is the crane’s list, enforced by this
Worker. Saving a yard profile does not open the door.

---

## Short answer

| Question | Today |
| --- | --- |
| Where do I add a human who may talk to an agent? | One list: crane `PENDANT_ALLOWED_USERS`. Recreate. The crane publishes it; this Worker enforces it. |
| Is that all in Gantree? | The list, yes (wizard or Secrets). Worker secrets stay in Cloudflare: Google + session + **one bearer per crane**. |
| What do I add on the Gantree **user**? | Email (and, once learned, Google `sub`). Nothing that opens chat by itself. |
| How does that update ai-gantry? | Recreate the crane. The harness reads `CHANNEL=pendant` + `PENDANT_*` at **boot**. Restart keeps a ghost list. |
| How does the agent talk to that Google user? | Phone signs in on the pendant. `/api/auth/me` lists their cranes. Worker stamps `user_id` = `sub` and `email`. Crane ignores anyone not on `PENDANT_ALLOWED_USERS`. |

A yard operator can exist and still never reach Kit. A phone user can
talk to Kit without ever logging into Gantree.

---

## What you paste (the connect)

One human list. Email is a real match (verified Google claim,
lowercased), not a label.

```text
Cloudflare Worker
  CRANE_BEARERS=kit:<bearer>
  # ALLOWED_SUBS is optional break-glass, not required

Crane .env  (Gantree wizard or Secrets — this is what ai-gantry reads)
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
                           | writes crane .env only
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

The Worker and the GCP client have to exist. Gantree cannot create them.

1. Deploy this repo. GitHub Actions deploys the Worker on push to
   `main` and on `v*` tags (`npm run release`), after tests. Laptop:
   `npm run build && npm run deploy`. Note the origin, e.g.
   `https://gantry-pendant.<account>.workers.dev`.

   Repo **secrets** (GitHub → Settings → Secrets): `CLOUDFLARE_API_TOKEN`
   (Edit Cloudflare Workers) and `CLOUDFLARE_ACCOUNT_ID`. Repo
   **variable**: `DIRECTORY_KV_ID` from `npx wrangler kv namespace create DIRECTORY`.
   Worker **secrets** stay on Cloudflare — CI does not put Google or
   bearers in GitHub. First code deploy with no Worker secrets is `503
   config` until you paste those (safe). Do not set `MAILBOX_SECRET` or
   `PENDANT_DEV` on the Worker.
2. GCP: **new Web application** client. Scopes `openid email profile`
   only. Redirect:

   ```text
   https://<that-origin>/api/auth/callback/google
   ```

   Not `oauth-catch`, not `localhost:4100`, not the google-mcp Desktop
   client.
3. Cloudflare secrets on **this** Worker:

   ```text
   GOOGLE_CLIENT_ID
   GOOGLE_CLIENT_SECRET
   SESSION_SECRET          # npm run secret
   CRANE_BEARERS           # kit:<token>  — npm run secret
   ```

   Optional: `ALLOWED_SUBS` as a yard-wide extra (break-glass). The
   crane list is the door. Bind KV `DIRECTORY` (`npx wrangler kv namespace
   create DIRECTORY`). Put the id in GitHub variable `DIRECTORY_KV_ID`
   (CI) or paste it into `wrangler.jsonc` (laptop deploy).

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

On `/profile` you can store email and Telegram / Slack / Discord ids.
Those do **not** become `PENDANT_ALLOWED_USERS`. Do not look for a
Google field. There isn’t one.

### B. Point Kit at the mailbox

**New crane:** Build → channel **pendant** → paste

- mailbox URL (`wss://…/ws/<this-slug>`)
- mailbox bearer (same token as `CRANE_BEARERS` for that slug)
- Google `sub` allowlist (`PENDANT_ALLOWED_USERS` — email, `sub`, or
  `sub:email`)

**Existing crane:** open Kit → **Secrets** → set `CHANNEL=pendant` and
the three `PENDANT_*` keys (or change mouth from telegram). Save.

Then **recreate**, not restart. ai-gantry reads the list at boot. An
empty `PENDANT_ALLOWED_USERS` fails boot (same as Telegram).

Kit’s photo is `persona/avatar.jpg` on the Mini (Photo fold), same JPEG
gate as Telegram. When `CHANNEL=pendant`, Gantree also POSTs that file
to this Worker (`/api/avatar?slug=`). The phone can replace it from the
header. Chat photos never become the face.

Gantree does **not** push `CRANE_BEARERS` to Cloudflare. After you add
a human, recreate Kit. The crane publishes `allow`; the room follows.

### C. Add another human later

1. Put their email (or `sub`) on `PENDANT_ALLOWED_USERS`.
2. Recreate Kit.

Until a confirm-scary “add this operator to Kit’s pendant allowlist”
exists, Secrets + recreate is the whole admin path.

### D. Yank / stolen phone

1. Remove them from `PENDANT_ALLOWED_USERS`.
2. Recreate the crane. Their socket closes `4401` when the new `allow`
   lands (stale list until then).
3. Rotate `CRANE_BEARERS` + `PENDANT_BEARER` if the token leaked
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

- [ ] Worker deployed; GCP redirect = this origin
- [ ] Worker secrets: Google + session + `CRANE_BEARERS` (`ALLOWED_SUBS` optional)
- [ ] KV `DIRECTORY` bound
- [ ] Gantree: channel pendant, URL `/ws/<slug>`, same bearer, human list
- [ ] Recreated
- [ ] Phone Google sign-in; crane list or “not on any crane yet”
- [ ] Yard cookie never sent to the Worker
