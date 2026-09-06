# Edge cases and gotchas

Things that bite after deploy, across **gantry-pendant**, **gantree**, and
**ai-gantry**. How they fail, and how to cover them. Who talks:
[setup.md](setup.md). Shape:
[architecture.md](architecture.md). Auth:
[security.md](security.md). What's left: [todo.md](todo.md).

This is not a product page. It is the second brain the walks still need.

---

## The three doors (do not merge them)

| Door | Where | Credential | Who it lets in |
| --- | --- | --- | --- |
| Yard | gantree `/login` | operator passphrase | people who may **operate** cranes |
| Mailbox | this Worker | Google OIDC session (human) or crane bearer (machine) | who may **join the room** |
| Mouth | crane `.env` `PENDANT_ALLOWED_USERS` | Google `sub` again | who the **agent** will answer |

Gantree never sits in a chat turn. Saving a profile does **not** open the
mailbox. Recreating a crane does **not** write Worker secrets. A yard
`gantree_session` cookie on the Worker is ignored (and must stay that way).

**Cover:** treat a new human as three pastes, not one toggle. Until a
Gantree “add this operator to Kit’s pendant” button exists, the admin
copies the `sub` by hand into **both** allowlists.

---

## Dual allowlists (the #1 miss)

Two lists, same `sub`, different hosts:

```text
Worker  ALLOWED_SUBS=1182…:ada@example.com
Crane   PENDANT_ALLOWED_USERS=1182…
```

| Symptom | Usual cause |
| --- | --- |
| Google works, socket 401s, Kit never hears you | on the crane list, missing from `ALLOWED_SUBS` |
| Socket is live, Kit ignores the frame | on the Worker list, missing from `PENDANT_ALLOWED_USERS` |
| Crane dies at boot | empty `PENDANT_ALLOWED_USERS` (fail-closed, same as Telegram) |
| Worker `/ws` is 503 `config` | Google is on but `ALLOWED_SUBS` / `SESSION_SECRET` / `CRANE_BEARERS` is empty |

Email after the colon on the Worker (`sub:email`) is a **label only**.
The key is `sub`. An email change does not mint a new person. Pasting
only `ada@example.com` into either list does nothing useful.

Gantree Secrets writes the **crane** `.env`. It cannot see Cloudflare.
`wrangler secret put ALLOWED_SUBS` (or the dashboard) is a second trip.

**Cover:** keep the two strings in one note when you rotate. After the
crane list: recreate (restart keeps a ghost allowlist). After Worker
`ALLOWED_SUBS`: the **next phone frame** re-checks (4401 if yanked).
No Docker step. Collapsing to one list (crane publishes, Worker asks
the DO) is [todo.md](todo.md).

---

## How you even get a Google `sub`

There is no Gantree field for it yet. Profile chat ids are Telegram /
Slack / Discord only. Inject user copies those into `PERSONA.md`, not
onto a crane allowlist (Telegram has its own confirm-scary copy; pendant
does not).

The OIDC callback **refuses** an unknown `sub` before minting a session.
So a stranger who signs in cannot open `/api/auth/me` and read their id.
That is deliberate (no user enumeration) and it makes first-user setup
awkward.

**Cover (today):**

1. Admin allowlists **themselves** first (decode one ID token, or add
   `sub` from a laptop Google JWT).
2. Sign in on the pendant → `/api/auth/me` returns `{ sub, email }`.
3. For the next human: they send that `sub` out of band, or you decode
   their ID token the same way. Then paste into both lists.

**Cover (build):** [todo.md](todo.md) — mint a session for any verified
Google account, still deny the DO unless allowlisted, show “send this
`sub` to the yard admin.” Do **not** put `sub` on the query string.

---

## GCP client (not google-mcp)

A new **Web application** client on the same GCP project. Scopes:
`openid email profile` only. Redirect **exactly**:

```text
https://<this-origin>/api/auth/callback/google
```

| Wrong button | What happens |
| --- | --- |
| Desktop client / `localhost:4100` | `redirect_uri_mismatch` |
| Pages `oauth-catch/` (chat `/auth google`) | same, and that flow is a **tool grant** |
| Reuse `google-oauth.json` / Gmail scopes | stolen chat session becomes Gmail |
| Worker-level Cloudflare Access | WebSocket upgrades **403**; crane is not a browser |

`MAILBOX_SECRET` is the two-tab spike only. The moment
`GOOGLE_CLIENT_ID` is set, the spike secret is rejected. Do not leave
both in prod and expect the shared secret to still work.

**Cover:** one note in Cloudflare secrets: client id/secret, session
secret, `ALLOWED_SUBS`, `CRANE_BEARERS`. Confirm the redirect on the
**deployed** origin (`workers.dev` first, custom host later). Leave
Access off the mailbox. Hostname Access on the **document** origin only
is Later.

---

## Slug, bearer, URL (three strings that must agree)

```text
wss://gantry-pendant.<account>.workers.dev/ws/kit
CRANE_BEARERS=kit:<token>
PENDANT_BEARER=<same token>
CHANNEL=pendant
```

Kit’s bearer cannot join Ada’s Durable Object. A typo in the path
(`/ws/Kit` vs `/ws/kit`) is a different room or a 404. Gantree slugs
are letter-first, max 32; the Worker parser matches that.

The Go crane sends `Authorization: Bearer`. `?bearer=` and `?secret=`
are **spike mode only** (two browser tabs). Browsers cannot set
headers on `new WebSocket`, so the spike puts the secret on the query
string; an oidc-mode upgrade with a query token is 401. `/crane` is
the loopback stand-in under `PENDANT_DEV`, not production.

Two cranes with the **same** bearer is the Telegram “two bots one
token” problem: they fight over one room. Rotate by rewriting Worker
`CRANE_BEARERS` **and** the crane `.env`, then recreate.

**Cover:** generate with `npm run secret` in this repo. One token per
slug. After a leak: yank `sub`, rotate bearer, recreate. Stolen phone:
OS lock, Google sign-out other sessions, then the yank.

---

## Recreate, not restart (gantree + ai-gantry)

Harness reads allowlists at boot. Gantree already nags after Secrets
save. Pendant is the same: a ghost `PENDANT_ALLOWED_USERS` after
restart-only will ignore a newly pasted `sub` (or keep a yanked one).

`CHANNEL=pendant` is outbound-only. Do not give the container a publish
port “so the phone can POST.” Stdio stays for hacking the binary on a
dev crane; it is not the phone.

One container, one `CHANNEL`. Telegram can stay on **another** crane.
You cannot run telegram + pendant in the same process.

**Cover:** wizard or Secrets → save → recreate modal. Confirm
`gantry status` / logs show `channel=pendant` and a mailbox dial, not
`getUpdates`.

---

## Phone / PWA

| Gotcha | What happens | Cover |
| --- | --- | --- |
| iPhone “Add to Home Screen” | installable; background is still weak | confirm on-device (P5 walk still open); needs `apple-touch-icon` PNG |
| Android / desktop Chrome Install | needs HTTPS (`workers.dev` is; loopback counts) plus 192×192 and 512×512 **PNG** icons | Vinext `app/manifest.ts` → `/manifest.webmanifest`; SVG-only fails Chromium’s rule |
| Chrome Install never appears | already installed, or no click + 30s on the page (engagement heuristic) | DevTools → Application → Manifest still shows Install |
| GPS denied / HTTP / no gesture / toggle off | message still sends; no `context.geo` | expected; do not block send |
| iOS `watchPosition` | killed in the background | we only `getCurrentPosition` on send |
| HEIC / iPhone photo | canvas JPEG when `createImageBitmap` can decode | otherwise “bad photo” |
| Photo > ~1.5 MB | compress in-app to the chat cap | still 413 if encode cannot shrink enough |
| Lock screen ping while app is dead | no Web Push yet | cron only lands if the socket is up; Web Push (VAPID, installed PWA) is later; native APNs/FCM later still |
| Queue while Mini reboots | ≤50 frames, 1 hour TTL, then drop | short note, not `gantry.db` |
| Rate limit (30 frames / 256 KB per min) | socket stays up, frames return `rate` | looks like “she ignored me” |
| Session hard 7d (JWT `exp` at mint) | next send closes 4401 | sign in again; yank `sub` takes effect on the next frame |
| Service worker | no chat cache (good) | also no offline compose |

SSID / BSSID / Bluetooth / clipboard must never go on the wire. Battery
and `net` attach on send when the OS exposes them; the prompt stays stingy.

---

## Delivery, two phones, clock

| Gotcha | What happens | Cover |
| --- | --- | --- |
| “Sent” with the socket down | local echo is not delivered | bubble stays **pending** until the DO acks; reconnect + `since` redelivers |
| Two devices, one human | replies route by `user_id` / `sub` | both of Ada’s phones see Ada’s replies; Bob does not |
| iOS PWA background drop | socket dies | reconnect on visible (`visibilitychange` / `onclose`); redeliver |
| `context.at` untrusted | phone clock can lie | order by DO time; `at` is a hint |
| Long turn, no streaming | whole replies; looks idle | no typing indicator yet (thinking-ack is later) |
| `cmds` after a removal | last catalog stays on the DO | ghost until the crane publishes again (next dial) |

---

## GPS and `[last pin]` (ai-gantry)

The point of owning the client: coords on **this** send, not a stale
Telegram pin.

- Phone puts `context.geo` on the frame. Channel calls `here.Set`.
- **Do not** stuff `[location]` into `Message.Text`. That would re-bill
  coords on every later Completer call.
- Bare geo (no text, no photo) is a silent pin: cursor updates, no
  model turn. Same idea as a Telegram bare pin.
- `here.Pin` is in-memory on the crane. Process restart clears it
  (same as today).
- Clock footer `[last pin]` is prompt-only, not stored in `gantry.db`.

If Kit still cites an old Telegram pin, you are on the wrong crane
(`CHANNEL` is still telegram) or the send went out with GPS omitted.

**Cover:** P5 walk on LTE with permission granted. Confirm the footer
matches this-send. Accuracy `±12m` on the pin is Later.

Spark auto-bind runs for pendant (Google `sub` as `ChatID`).
**Examples** (`EXAMPLES_QTY`) auto-bind is still telegram-only — capability
pings will not appear on a pendant crane until that case is added.
`/examples` on demand still works.

Streaming placeholder + edit (`ReplyWriter`) is Later. Whole replies
first. A long turn looks idle until the model finishes.

---

## What Gantree does **not** do

- No chat route, no `/api/gantries/…/messages`.
- No write to Worker `ALLOWED_SUBS` / `CRANE_BEARERS`.
- No Google `sub` on the operator row (Telegram-style copy button is
  Later: “add this operator to Kit’s pendant allowlist”).
- Operator **email** is a profile label and Inject-user fodder, not a
  mailbox key and not a password reset.
- `repos/` is excluded from the yard `tsconfig` on purpose — this
  checkout typechecks itself.

**Cover:** paste mailbox URL + bearer + `sub` in the wizard (or Secrets),
recreate. Keep the Worker secrets in Cloudflare. Document the two-list
dance in the install one-liner; do not grow a product page.

---

## Stolen / leaked / wrong-room

1. Lock the phone; Google → sign out other sessions.
2. Yank `sub` from **both** allowlists (Worker: next frame closes 4401).
3. Rotate `CRANE_BEARERS` + `PENDANT_BEARER`; recreate.
4. If `.env` leaked, assume the bearer is burned.

A compromised allowlisted human is Telegram’s bar: they can still burn
quota and tools. GPS on every send makes a stolen session worse than a
Telegram pin.

---

## Checklist (after deploy)

- [ ] GCP Web client, redirect = this origin, `openid email profile` only
- [ ] Worker secrets: Google + session + `ALLOWED_SUBS` + `CRANE_BEARERS`
- [ ] Spike `MAILBOX_SECRET` gone from prod
- [ ] Crane `.env`: `CHANNEL=pendant`, URL `/ws/<slug>`, bearer, `sub` list
- [ ] Recreated (not restarted)
- [ ] Phone Google sign-in; unknown account never joins the DO
- [ ] Kit’s bearer cannot open Ada’s slug
- [ ] Text + GPS this-send → `[last pin]` is fresh
- [ ] Cron / spark with the app **open**
- [ ] Android Chrome PWA and iPhone Add to Home Screen
- [ ] Yard cookie never sent to the Worker
