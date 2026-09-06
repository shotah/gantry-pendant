# Setup — who talks to Kit

Admin flow, user flow, and the three pastes that actually connect them.
Gotchas: [edgecases.md](edgecases.md). Auth: [security.md](security.md).
Shape: [architecture.md](architecture.md). What it looks like:
[screens.md](screens.md). What's left: [todo.md](todo.md).

This is **not** “add a field on the Gantree person and they can chat.”
Gantree operates cranes. The mailbox and the mouth each have their own
allowlist. Saving a yard profile does not open either door.

---

## Short answer

| Question | Today |
| --- | --- |
| Where do I add a human who may talk to an agent? | Two lists: Worker `ALLOWED_SUBS` **and** crane `PENDANT_ALLOWED_USERS`. Same Google `sub`. |
| Is that all in Gantree? | **No.** Gantree writes the crane `.env` only (wizard or Secrets). Worker secrets stay in Cloudflare. |
| What do I add on the Gantree **user**? | **Nothing that opens chat.** Email / Telegram / Slack / Discord on `/profile` are labels (Inject user → `PERSONA.md`). There is no Google `sub` field and no “copy onto Kit’s pendant” button yet. |
| How does that update ai-gantry? | Recreate the crane. The harness reads `CHANNEL=pendant` + `PENDANT_*` at **boot**. Restart keeps a ghost list. |
| How does the agent talk to that Google user? | Phone signs in on the pendant. Worker stamps `user_id` = `sub`. Crane ignores any `sub` not on `PENDANT_ALLOWED_USERS`. Replies go back through the same Durable Object room. |

A yard operator can exist and still never reach Kit. A phone user can
talk to Kit without ever logging into Gantree.

---

## What you paste (the connect)

Three strings must agree. Email after a colon is a **label only**.

```text
Cloudflare Worker
  ALLOWED_SUBS=118212345678901234567:ada@example.com
  CRANE_BEARERS=kit:<bearer>

Crane .env  (Gantree wizard or Secrets — this is what ai-gantry reads)
  CHANNEL=pendant
  PENDANT_MAILBOX_URL=wss://gantry-pendant.<account>.workers.dev/ws/kit
  PENDANT_BEARER=<same bearer>
  PENDANT_ALLOWED_USERS=118212345678901234567
```

```text
phone Google OIDC  →  session cookie  →  wss …/ws/kit  (role=phone)
crane bearer       →  outbound wss    →  same room     (role=crane)
```

Gantree never sits on that path. The yard cookie is ignored if it shows
up on the Worker.

```text
                    Gantree (yard)
                    operator + passphrase
                           |
                           | writes crane .env only
                           v
phone -- Google --> Worker mailbox (ALLOWED_SUBS) <-- crane (PENDANT_BEARER)
                         Durable Object /ws/kit
                           |
                           | frame.user_id = Google sub
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

1. Deploy this repo (`npm run build && npm run deploy`). Note the
   origin, e.g. `https://gantry-pendant.<account>.workers.dev`.
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
   ALLOWED_SUBS            # start with the admin's Google sub
   CRANE_BEARERS           # kit:<token>  — npm run secret
   ```

   The moment Google is on, `MAILBOX_SECRET` (two-tab spike) is
   rejected. Leave Worker-level Cloudflare Access **off**.

You need at least one Google `sub` to put in `ALLOWED_SUBS` or the
admin cannot finish sign-in. Unknown accounts never get a session
cookie, so they cannot open `/api/auth/me` and read their own id. That
is deliberate (no enumeration) and it makes the **first** human a
laptop job: decode one Google ID token (`sub` claim, a long digit
string) and paste it. After that person is allowlisted, they sign in
on the pendant and `/api/auth/me` returns `{ sub, email }`.

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
- Google `sub` allowlist (`PENDANT_ALLOWED_USERS`)

**Existing crane:** open Kit → **Secrets** → set `CHANNEL=pendant` and
the three `PENDANT_*` keys (or change mouth from telegram). Save.

Then **recreate**, not restart. ai-gantry reads the list at boot. An
empty `PENDANT_ALLOWED_USERS` fails boot (same as Telegram).

Kit’s photo is `persona/avatar.jpg` on the Mini (Photo fold), same JPEG
gate as Telegram. When `CHANNEL=pendant`, Gantree also POSTs that file
to this Worker (`/api/avatar?slug=`). The phone can replace it from the
header. Chat photos never become the face.

Gantree does **not** push `ALLOWED_SUBS` or `CRANE_BEARERS` to
Cloudflare. After you add a human, you still `wrangler secret put
ALLOWED_SUBS` (or the dashboard) with the **same** `sub`.

### C. Add another human later

1. Get their Google `sub` (they send it out of band, or you decode an
   ID token). Email alone is not the key.
2. Append to Worker `ALLOWED_SUBS`.
3. Append to crane `PENDANT_ALLOWED_USERS` in Secrets.
4. Recreate Kit.

Until a confirm-scary “add this operator to Kit’s pendant allowlist”
exists, that is the whole admin path.

### D. Yank / stolen phone

1. Remove `sub` from **both** lists.
2. Recreate the crane.
3. Rotate `CRANE_BEARERS` + `PENDANT_BEARER` if the token leaked.
4. Lock the phone; Google → sign out other sessions.

---

## User flow (phone)

The human does **not** need a Gantree login.

1. Admin has already pasted their `sub` on both lists and recreated.
2. Open the pendant origin (HTTPS, or `http://127.0.0.1:3000` on a
   laptop). Chrome: **Install** in the address bar (desktop) or the
   menu (Android). iPhone Safari: Share → Add to Home Screen. Vinext
   serves the web app manifest at `/manifest.webmanifest`.
3. Sign in with Google (the account whose `sub` is on the list).
4. Grant location if they want `[last pin]` this-send. Denied still
   sends text.
5. Type. Kit answers when the crane socket is up.
6. Tap Kit’s face in the header to set the same `avatar.jpg` the yard
   Photo fold uploads (JPEG, 5MB). The Worker stores it; a chat photo
   is still a turn, not a face change.

If Google works but Kit never answers: they are on the Worker list and
missing from the crane, or the crane was restarted instead of
recreated. If the socket 401s: missing from `ALLOWED_SUBS`, or the
session hit its hard 7-day `exp`. Cron / spark only lands while the
app is open — no lock-screen push yet.

A stranger who hits Sign in with Google gets the same unauthorized as
a bad token. They never join the room and they never see a `sub`.

Local mock (`PENDANT_DEV=1` on loopback) is **not** this flow. It
paints Ada and canned scenes so you can screenshot the mouth. See
[screens.md](screens.md). Never put that flag on `workers.dev`.

---

## How the agent talks back

1. Phone WebSocket is tagged with that `sub`. Each frame carries
   `user_id`.
2. Durable Object fans the frame to the crane socket (or queues ≤50 /
   1h if Kit is mid-reboot).
3. `internal/channel/pendant` drops the frame unless `user_id` is on
   `PENDANT_ALLOWED_USERS`.
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
- [ ] Worker secrets: Google + session + `ALLOWED_SUBS` + `CRANE_BEARERS`
- [ ] Gantree: channel pendant, URL `/ws/<slug>`, same bearer, same `sub`
- [ ] Recreated
- [ ] Phone Google sign-in; text comes back
- [ ] Yard cookie never sent to the Worker
