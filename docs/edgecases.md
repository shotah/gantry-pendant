# Edge cases and gotchas

Things that bite after deploy, across **gantry-pendant**, **gantree**,
**ai-gantry**, **gantry-cab**, and **gantry-helm**. Symptom, cause, cover — not a walk
of how the product works. Wire and paint live in
[frontends.md](frontends.md). Who talks: [setup.md](setup.md). How it
got to workers.dev: [deployment.md](deployment.md). Shape:
[architecture.md](architecture.md). Auth: [security.md](security.md).
What's left: [todo.md](todo.md).

---

## The three doors (do not merge them)

| Door | Where | Credential | Who it lets in |
| --- | --- | --- | --- |
| Yard | gantree `/login` | operator passphrase | people who may **operate** cranes |
| Mailbox | this Worker | Google OIDC session (human) or crane bearer (machine) | who may **join the room** (room list from the crane) |
| Mouth | crane `.env` `PENDANT_ALLOWED_USERS` | Google `sub` or verified email | who the **agent** will answer |

Gantree never sits in a chat turn. Saving a profile does **not** open the
mailbox. Recreating a crane does **not** by itself push Google OAuth —
that is Settings → Pendant, once. A yard `gantree_session` cookie on the
Worker is ignored (and must stay that way).

**Cover:** treat a new human as Kit’s Pendant fold + recreate.

---

## Stale list until recreate (the #1 miss)

The crane `.env` is the human allowlist. The Worker remembers the last
`allow` frame on that slug’s Durable Object.

```text
Crane   PENDANT_ALLOWED_USERS=ada@example.com
Room    last allow frame (until the next dial)
```

| Symptom | Usual cause |
| --- | --- |
| Google works, empty crane list, never joins | not on Kit’s `.env`, or Kit has not dialed since the edit. A `401` on `/api/avatar?slug=kit` is the demo slug, not sign-in. Session cookie is not a room — copy email/`sub` off the waiting room, never the query string |
| `PERSONA.md` has their email | prompt text, not a mailbox key. Kit’s Pendant fold writes `PENDANT_ALLOWED_USERS` |
| Socket is live, Kit ignores the frame | on the room list, missing from `PENDANT_ALLOWED_USERS` (crane restarted, not recreated) |
| Crane dies at boot | empty `PENDANT_ALLOWED_USERS` (fail-closed, same as Telegram) |
| Phone: no crane on this mailbox yet | Google is on, no `CRANE_BEARERS` — Build a pendant crane |
| Worker `/ws` is 503 `config` | Google is on but `SESSION_SECRET` / `CRANE_BEARERS` is empty |
| Yanked human still talks | ghost list: recreate so the crane republishes `allow` |

Email is a real match when Google says `email_verified`. The session
id and `user_id` are always `sub`. Optional Worker `ALLOWED_SUBS` is
break-glass, not a second copy of the crane list.

Gantree Settings writes Worker Google / session. Gantree Build writes
the **crane** `.env` and merges `CRANE_BEARERS`. Do not also
`npm run secrets:push` from this checkout after that — a bulk put can
drop yard-minted slugs. Bearer rotation on the Pendant fold is the
instant kill if the crane is down.

**Cover:** after the crane list, recreate (restart keeps a ghost
allowlist). The room closes yanked sockets `4401` when the new `allow`
lands. Bearer rotation is the instant kill if the crane is down.

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
secret, `CRANE_BEARERS`. `ALLOWED_SUBS` optional. Confirm the redirect
on the **deployed** origin (`workers.dev` first, custom host later).
Leave Access off the mailbox. Hostname Access on the **document**
origin only is Later.

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
| iPhone Google from the Home Screen app | iOS loads the callback in the in-app browser **and** the app; the loser has no state cookie or a spent code | callback 302s to `/?auth=retry` (no 401 for humans); shell hints Safari sign-in → Add to Home Screen (iOS 16.7+ copies the session) |
| iPhone status bar over the header | `black-translucent` + `viewport-fit=cover` draws the shell under the clock | shell and login pad `env(safe-area-inset-top)` |
| Android / desktop Chrome Install | needs HTTPS (`workers.dev` is; loopback counts) plus 192×192 and 512×512 **PNG** icons | Vinext `app/manifest.ts` → `/manifest.webmanifest`; SVG-only fails Chromium’s rule |
| Chrome Install never appears | already installed, or no click + 30s on the page (engagement heuristic) | DevTools → Application → Manifest still shows Install |
| GPS denied / HTTP / no gesture / toggle off | message still sends; no `context.geo` | expected; do not block send |
| iOS `watchPosition` | killed in the background | we only `getCurrentPosition` on send |
| HEIC / iPhone photo | canvas JPEG when `createImageBitmap` can decode | otherwise “couldn't read that image”; ladder/caps are [frontends.md](frontends.md#photos-what-every-mouth-must-do-the-same) |
| Camera photo still too big after shrink | ladder bottoms out (floor 320 px) | “Photo not sent — still too big after shrinking”; Settings → Photo size is per-device |
| Attach → Camera on desktop | `capture` is a hint; desktop (and some Android) still shows a picker | expected; gallery is Attach → Photo |
| Lock screen ping while app is dead | no tray unless VAPID is set **and** they enabled notifications (installed PWA; iOS 16.4+ standalone) | Settings → Enable notifications after Google. Missing VAPID → queue only |
| Queue while Mini reboots | ≤50 frames, 1 hour TTL, then drop | unread catch-up only; not the transcript |
| Old Cab on hydrate | mailbox replays last 80 with `replay: true` | old APK still toasts / Auto HUNs every frame — ship Cab that skips `shouldSpeak` on `replay` |
| Private / no IndexedDB | thread, face, wallpaper still blank until the socket hydrates | expected; drafts and `sending` never hit disk even when IDB works. Sign-out does not wipe the rows |
| Rate limit (30 frames/min; bytes 4 MB burst = two full photo frames, refill 256 KB per min) | socket stays up, frames return `error` `rate` with the refused `id` (additive) | PWA and Cab mark that bubble “Not sent — too much too fast”. Burst below one frame was the old photo bug: every camera shot bounced as `rate` forever |
| Session hard 7d (JWT `exp` at mint) | next send closes 4401 | sign in again; yank `sub` takes effect on the next frame |
| Service worker | does not cache chat or API (by design) | no offline compose |

SSID / BSSID / Bluetooth / clipboard must never go on the wire. Battery
and `net` attach on send when the OS exposes them; the prompt stays stingy.

---

## Delivery, two phones, clock

| Gotcha | What happens | Cover |
| --- | --- | --- |
| “Sent” with the socket down | local echo is not delivered | bubble stays **pending** until the DO acks; reconnect + `since` redelivers |
| Two devices, one human | crane `reply` fans to every `sub:<ada>` socket | both of Ada’s phones see Ada’s replies; Bob does not |
| Browser send missing on Cab (Cab send visible in the browser) | inbound is stored on `t:<sub>` and hydrates on connect. Live, the Worker also fans the same body to `sub:<userId>` except the sender. Spike (no `sub`) still waits on reconnect. The PWA redials on visible; Cab holds one socket | [sibling_phones.md](sibling_phones.md) — walk both mouths on a deployed origin (same Google). Cab quiet sweep is catch-up / Doze, not the live path. Spike ≠ Google |
| Cab vs PWA after a wire change | Cab ignores unknown JSON; it may still paint arrival order | [frontends.md](frontends.md) — walk `Wire.kt` / `Mouth.kt` |
| iOS PWA background drop | socket dies | reconnect on visible (`visibilitychange` / `onclose`); redeliver |
| `context.at` untrusted | phone clock can lie | order by DO time; `at` is a hint |
| Long turn, no streaming | whole replies; looks idle | no typing indicator yet (thinking-ack is later) |
| `cmds` after a removal | last catalog stays on the DO | ghost until the crane publishes again (next dial) |

---

## GPS and `[last pin]` (ai-gantry)

Phone puts `context.geo` on the frame. Channel calls `here.Set`. Do
**not** stuff `[location]` into `Message.Text` — that re-bills coords
on every later Completer call.

| Gotcha | Cover |
| --- | --- |
| Kit cites an old Telegram pin | wrong crane (`CHANNEL` still telegram), or this send omitted GPS |
| Crane restarted, pin is gone | `here.Pin` is in-memory; clock footer `[last pin]` is prompt-only, not `gantry.db` |
| Bare geo (no text, no photo) | silent pin: cursor updates, no model turn |
| No capability pings on pendant | `EXAMPLES_QTY` auto-bind is still telegram-only; `/examples` on demand still works. Spark auto-bind does run (`sub` as `ChatID`) |

Accuracy `±12m` on the pin is Later. Long turns look idle until the
model finishes (`ReplyWriter` is Later).

---

## Yard is not the mailbox

| Gotcha | Cover |
| --- | --- |
| Saved a Gantree profile, still cannot talk | Gantree has no chat route. Settings → Pendant (Google + session), Build channel pendant, recreate |
| Operator email as a password | it is not. Session is Google on the Worker |
| `MAILBOX_SECRET` / `PENDANT_DEV` on `workers.dev` | spike only; leave them off prod |

This repo’s CI still ships the Worker. `repos/` is excluded from the
yard `tsconfig` — this checkout typechecks itself.

---

## Stolen / leaked / wrong-room

1. Lock the phone; Google → sign out other sessions.
2. Yank them from the **crane** list and recreate (next `allow` closes
   4401). Optional: yank from Worker `ALLOWED_SUBS` if you used it.
3. Rotate Kit’s bearer from the Gantree Pendant fold; recreate.
4. If `.env` leaked, assume the bearer is burned.

A compromised allowlisted human is Telegram’s bar: they can still burn
quota and tools. GPS on every send makes a stolen session worse than a
Telegram pin.

---

## Checklist (after deploy)

- [ ] GCP Web client, redirect = this origin, `openid email profile` only
- [ ] Gantree Settings → Pendant: Google + session (`ALLOWED_SUBS` optional)
- [ ] Spike `MAILBOX_SECRET` gone from prod
- [ ] Gantree Build channel pendant; yard minted bearer; human list
- [ ] Recreated (not restarted)
- [ ] Phone Google sign-in; unknown account never joins the DO
- [ ] Kit’s bearer cannot open Ada’s slug
- [ ] Text + GPS this-send → `[last pin]` is fresh
- [ ] Cron / spark with the app **open**
- [ ] Optional: VAPID secrets + Enable notifications → lock-screen when the app is asleep
- [ ] Android Chrome PWA and iPhone Add to Home Screen
- [ ] Yard cookie never sent to the Worker
