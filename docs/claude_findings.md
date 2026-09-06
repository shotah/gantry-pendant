# Design review — findings

External review of the pendant shape, docs, and Worker/DO code as of
2026-09-06. Tracked remediations: [remediations_todo.md](remediations_todo.md).
Shape: [architecture.md](architecture.md). Why: [design.md](design.md).
Authn: [security.md](security.md). Gotchas: [edgecases.md](edgecases.md).

Reviewed: `README.md`, `docs/*.md`, `todo.md`, `worker/index.ts`,
`worker/mailbox.ts`, `lib/auth/*`, `lib/mailbox/*`, `lib/avatar/http.ts`,
`app/api/auth/**`, `app/api/avatar/route.ts`, `app/lib/socket.ts`,
`app/components/chat/PhoneShell.tsx`, `wrangler.jsonc`.

---

## Verdict

The architecture is sound. Keep it.

| Decision | Call |
| --- | --- |
| Outbound-only crane; DO is the rendezvous | Right. Same job as Slack Socket Mode hub. |
| Google `sub` as the human id, bearer per slug for the crane | Right. |
| Vinext on Workers for the client; Gantree stays Node | Right. No Docker, phone on LTE. |
| `context.geo` → `here.Set`, not `[location]` in `Text` | Right. Prompt stays stingy; history does not re-bill coords. |
| Worker-level Cloudflare Access is the wrong button | Right. 403s WebSocket upgrades; crane is not a browser. |
| No chat through Gantree | Right. Contract holds. |
| "Why not these shapes" table | Honest and complete. |

The **docs are ahead of the code**. The mailbox today is a two-tab demo
wearing production auth. Nothing below changes the architecture; it is
the gap between "two laptop tabs" and "a phone in a pocket on LTE".

---

## Multi-user / multi-phone — the room is per-crane, the sessions are per-human

**This is the big one.** Every doc says "1–3 humans". The code is a
single room per slug with no routing on who a frame is for.

| Symptom | Where | Why |
| --- | --- | --- |
| Ada's reply lands on Bob's phone | `worker/mailbox.ts` `webSocketMessage` fans `reply` to **all** `getWebSockets("phone")` | No `user_id` routing on crane→phone |
| Bob reconnects and eats Ada's queued replies | `worker/mailbox.ts` `flush()` → `drainFor(items, "phone")` | Queue is keyed by role only, not by `sub` |
| Two devices, one human, both see replies | same fan-out | Accidentally correct today; leaks to others |
| Cron `Push` with a `ChatID` goes to everyone | same fan-out | `push` has no target |

The crane already knows the target: session id is `pendant:<slug>:<sub>`
and `ChatID` = `sub`. Sockets are already tagged with `userId`
(`acceptWebSocket(ws, [role, rateId, userId])`), so
`this.ctx.getWebSockets(sub)` works with no schema change.

**Cover:** route `reply` by `user_id`; key the queue by `(to, userId)`;
`push` with no `user_id` = broadcast. Ships in the same change as
delivery (below).

---

## Delivery is lossy, and the phone hides it

```text
worker/mailbox.ts  webSocketMessage
  peers = getWebSockets(peer)
  if (peers.length) { send to each; return }   ← "delivered"
  else enqueue                                  ← only when ZERO peers
```

- A backgrounded phone is a **half-open** TCP socket for seconds to
  minutes. `p.send()` on it does not throw. The reply is counted as
  delivered and never queued. This is the standard mobile WebSocket
  failure and the design has no answer to it.
- `app/components/chat/PhoneShell.tsx`: send is skipped unless
  `readyState === OPEN`, but the local echo bubble still paints. User
  sees "sent"; nothing left the phone.
- No reconnect on `onclose`. Status flips to "down" and stays there until
  reload. iOS PWAs drop the socket every time they background.
- `FrameKind` has `"ack"` but frames have no `id`. Nothing to ack.
- No `setWebSocketAutoResponse` ping/pong; a Go keepalive wakes the DO
  every time.

**Cover:** `id` on every frame. DO holds phone-bound frames per `sub`
until acked (or TTL). On reconnect the phone sends `since: <last id>`
and the DO redelivers. Client reconnects with backoff on
`onclose` / `visibilitychange`; bubble is "sent" only on DO ack.
`this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping","pong"))`.

---

## Queue throws on the first queued photo

`worker/mailbox.ts` stores the whole queue as **one** storage value
(`storage.put(QUEUE_KEY, next)`). SQLite-backed DO storage caps one
value at 2 MiB. `IMAGE_BYTES_MAX` = 1.5 MB, `FRAME_BYTES_MAX` =
2,000,000. One queued photo plus any text already in the array exceeds
the cap and `put` throws inside `webSocketMessage`. Every enqueue also
reads and rewrites up to 50 frames.

`enqueue` drops the **oldest** when full, so a burst of 50 `pin` frames
can evict a real reply.

**Cover:** one row per frame (`storage.put(`q:${id}`)` + `list({prefix})`,
or `ctx.storage.sql`). Do not queue `pin` (a stale pin is worthless).
Cap queued bytes; consider not queuing images at all.

---

## Auth — where the docs and code disagree

**Big callout.** `security.md` describes a stronger system than the one
that ships. None of these are architecture mistakes; all of them are
gaps a stolen phone or a curious allowlisted human will find.

### A. Yanking a `sub` does not end a live session

Auth happens at the handshake and lives in socket tags. A hibernated
phone socket stays authorized until it closes on its own. The
stolen-phone runbook says "yank `sub`"; today that takes effect at the
**next reconnect**, which for a stolen phone that stays online can be
days. `security.md` says "Authn on every frame". It is authn at
handshake only.

The session JWE `exp` is set once at mint (`lib/auth/session.ts`).
"Idle 7d / absolute 30d" is really "hard 7d"; there is no sliding
refresh, so the absolute cap is unreachable.

**Cover:** put session `exp` in a tag; on every `webSocketMessage`
re-check `sub` against the allowlist (env read, no I/O) and `exp`;
close with 4401 on failure. Pick idle-sliding or hard-7d and make docs
match.

### B. Two allowlists — delete one instead of documenting the dance

`edgecases.md` calls dual allowlists "the #1 miss" and then three docs
teach the two-paste ritual. Ask what the crane list defends against:

- Not a compromised Worker — it can stamp any allowlisted `sub` onto a
  forged frame.
- Only Worker **misconfiguration**. Thin protection for the most
  error-prone step in setup.

**Better path (reuses the `cmds` pattern):** the crane publishes its
allowlist to the DO on connect, exactly as it publishes `cmds`. The DO
stores it. `oidcHandshake` for `role=phone` asks the DO "is this `sub`
allowed" instead of reading `ALLOWED_SUBS`.

| Win | How |
| --- | --- |
| One list | Crane `.env`, which Gantree already writes. `wrangler secret put ALLOWED_SUBS` goes away. |
| Slug isolation | Kit's bearer can only set Kit's room's list. |
| Fail closed | No crane has ever connected → nobody joins. |
| First-`sub` problem | Mint a session for any verified Google account (already "Later"), show `sub` + `allowed: false`, admin pastes into **one** place. |
| Yank kills sockets | On publish, DO closes phone sockets whose `sub` is gone (fixes A for the yank case). |

Keep the crane's own check as a free redundant filter on the same list
it published. Do not make the admin maintain two.

### C. Bearer and spike secret on the query string

`app/lib/socket.ts` `mailboxUrl` and `lib/avatar/http.ts`
`avatarRequestPath` put `secret` / `bearer` in the URL. URLs land in
Workers logs, Logpush, and the browser history of the `/crane`
stand-in. `edgecases.md` says "do not put `sub` on the query string";
the bearer is worse.

Browsers cannot set headers on `new WebSocket`, so the stand-in tab
needs a query param. The Go crane can send `Authorization: Bearer`.

**Cover:** header-only for real cranes; accept `?bearer=` / `?secret=`
in **spike mode only**. Docs say so.

### D. `/crane` stand-in is an attack surface in prod

Once the Worker is public, `/crane` is a UI that accepts a crane bearer.
**Cover:** gate behind `PENDANT_DEV` or drop it from the production
build.

### E. Phone-supplied `https://` image URLs → SSRF from the crane

`lib/mailbox/frame.ts` `parseImages` accepts `data:image/` **or**
`https://`. If the harness fetches `Images[].url`, an allowlisted phone
(or a stolen session) can point Kit at `https://gantree.tailnet:3000/…`
or any LAN host. Telegram never had this: the URL was always
`api.telegram.org`.

**Cover:** phone→crane is `data:image/` only. `https://` stays legal
crane→phone.

### F. Phone can forge frame kinds

Phone frames may carry `kind: "reply" | "push" | "error"` and the DO
forwards them to the crane unchanged. **Cover:** force phone frames to
`inbound | pin | ack` server-side.

### G. `X-Pendant-Op` not stripped on upgrade

`worker/index.ts` `mailboxUpgrade` overwrites `X-Pendant-Role/Rate/Sub`
but does not delete `X-Pendant-Op`. An authenticated `/ws/` request
with `X-Pendant-Op: avatar` reaches `avatarHttp` and bypasses the
route's `acceptJpeg`. **Cover:** `headers.delete("X-Pendant-Op")`.

### H. No `Origin` check on the upgrade

`SameSite=Lax` plus `workers.dev` being on the Public Suffix List saves
you today. A custom hostname with a sibling subdomain later would not.
**Cover:** one `if` on `Origin` in `mailboxUpgrade`.

### I. OAuth: `state` only

No PKCE, no `nonce`. Acceptable for a confidential client; both are two
lines in `jose` / `URLSearchParams` and remove a class of replay.
**Cover:** add both.

### J. Things that are fine

- `secretEqual` hashes before `timingSafeEqual`. Good.
- Same 401 for unknown `sub` vs bad token. Good.
- Spike secret rejected once `GOOGLE_CLIENT_ID` is set. Good.
- `state` cookie `SameSite=Lax`; Google redirect is top-level GET. Good.
- `PENDANT_DEV` gated on loopback host. Good.
- Worker overwrites `X-Pendant-Role/Rate/Sub`; DO only reachable via
  binding. Good.
- Allowlist checked at handshake **and** at `/api/auth/me`. Good.

---

## Edge cases the docs miss

| Gap | Note |
| --- | --- |
| "Sent" with the socket down | First bug report. See delivery. |
| Two devices, one human | Correct only after per-`sub` routing. |
| iOS PWA backgrounding | Socket drops every time. Reconnect + redeliver is not optional for the P5 walk. |
| Clock | `context.at` / `tz` are phone-supplied and untrusted. Order by DO `Date.now()`; treat `at` as a hint. |
| Long turn, no streaming | 30–90 s of nothing. One `ack` frame when the Handler starts ("Kit is thinking") is cheap. |
| `cmds` never expires | A removed command is a ghost until the next publish. Fine; note it. |
| Rate-limit `RATE_KEY` map never prunes | Bounded by principal count. Fine for personal scale; note it. |

---

## Where the docs are wrong or over-cautious

- **"Cloudflare will not send APNs for us."** True for native APNs.
  **Web Push** is different: an installed PWA on iOS 16.4+ and Android
  Chrome subscribes via the service worker; a Worker POSTs to the push
  endpoint with a VAPID key. Apple's endpoint speaks Web Push. You
  already ship `public/sw.js`. Lock-screen cron pings with no Expo, no
  APNs account, no Firebase. Belongs in **later**, not "not this
  version".
- **"D1 as the only mailbox — weak for streaming."** Agree, but you do
  not stream yet, and D1 would have solved delivery + multi-user +
  queue-size for free. Not a reason to switch. A reason to describe the
  DO's benefit as "the sockets meet here", which is what you use.
- **"Authn on every frame."** Aspirational. See Auth A.

---

## Priority

1. Frame `id` + per-`sub` routing + ack/redeliver + client reconnect.
   One change. Fixes multi-user and delivery. The P5 walk fails on this.
2. Queue one row per frame; do not queue `pin`; cap bytes.
3. Crane publishes allowlist; Worker asks the DO. Delete `ALLOWED_SUBS`
   and half of `setup.md`.
4. Re-check `sub` / `exp` per message; close on failure.
5. `data:` only from phone; bearer header-only for real cranes; strip
   `X-Pendant-Op`; `Origin` check; gate `/crane`; PKCE + nonce.
6. Move Web Push from "not this version" to "later".
