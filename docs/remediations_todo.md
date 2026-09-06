# Remediations — todo

Tracker for [claude_findings.md](claude_findings.md). Same rules as
[todo.md](../todo.md): a group is done when its **walk** is real, not
when the boxes are ticked. Tests live under `test/`, mirroring source.

Status: **now** · **next** · **later**

Code for R1–R3.4 and R4 (except `setup.md`) is in. Groups stay **now**
until the cellular walks. R2 queues images (8 MiB per destination).
R3.1 session is hard 7d.

Two groups get a callout because they are the ones a real phone finds
first: **multi-user / multi-phone** and **auth**.

---

## R1 — Delivery + multi-user · **now** · gantry-pendant

> **Callout: multi-user / multi-phone.** Room is per-crane; sessions
> are per-human. Replies fan to every phone; the first phone to
> reconnect drains everyone's queue. Half-open sockets swallow replies.
> The phone paints "sent" when nothing left.

**Walk:** two allowlisted Google accounts, two phones, one crane. Ada
texts Kit; only Ada's phone(s) get the reply. Bob's phone in the
background for 5 minutes; Kit replies; Bob foregrounds and the reply
appears without reload. Cron `Push` with no target lands on both.

- [x] `id` on every frame (`lib/mailbox/frame.ts`); `ack` carries `id`
- [x] Phone frames forced to `inbound | pin | ack` server-side
- [x] Route `reply` by `user_id` → `getWebSockets(sub)`; `push` with no
      `user_id` = broadcast
- [x] Queue keyed by `(to, userId)`; `flush()` drains only that `sub`
- [x] DO holds phone-bound frames per `sub` until `ack` or TTL
- [x] Phone sends `since: <last id>` on connect; DO redelivers
- [x] Client reconnect with backoff on `onclose` and `visibilitychange`
- [x] Bubble shows "sent" only on DO ack; pending state before that
- [x] `setWebSocketAutoResponse(ping → pong)` so Go keepalive does not
      wake the DO
- [x] ai-gantry: `reply` / `push` frames stamp `user_id` from `ChatID`
- [x] Tests: `test/mailbox/frame.test.ts` (id, ack), routing and queue
      per `sub`, PhoneShell reconnect + pending bubble

---

## R2 — Queue storage · **now** · gantry-pendant

**Walk:** crane offline. Phone sends a 1.4 MB photo and three texts.
Crane comes back; all four arrive in order. No DO exception.

- [x] One storage row per queued frame (`q:<id>` + `list({prefix})`, or
      `ctx.storage.sql`) — 2 MiB per-value cap
- [x] Do not queue `pin`
- [x] Cap total queued bytes per `sub`; decide: queue images or drop
      with an `error` frame back to sender
- [x] Drop policy: evict oldest **non-reply** first
- [x] Tests: `test/mailbox/queue.test.ts` for byte cap, pin skip, order

---

## R3 — Auth · **now** · gantry-pendant (+ ai-gantry for R3.2)

> **Callout: auth.** `security.md` promises "authn on every frame" and
> a yank that works. The code authenticates at handshake only, stores
> it in socket tags, and a yanked `sub` stays live until the socket
> drops on its own. Bearer rides the query string. Two allowlists.

### R3.1 — Per-message re-check · **now**

**Walk:** Ada is chatting. Admin removes Ada's `sub`. Ada's next send
gets a 4401 close, not a reply. Session expiry behaves the way the doc
says it does.

- [x] Session `exp` in a socket tag
- [x] `webSocketMessage`: re-check `sub` ∈ allowlist and `exp`; close
      4401 on failure
- [x] Decide sliding idle (re-mint cookie on activity) **or** hard 7d;
      make `security.md` / `edgecases.md` match the code
- [x] Tests: `test/auth/session.test.ts`, mailbox close-on-yank

### R3.2 — One allowlist, published by the crane · **next**

**Walk:** `ALLOWED_SUBS` is gone from Worker secrets. Crane boots with
`PENDANT_ALLOWED_USERS`, dials in, publishes. Ada signs in and joins.
Stranger signs in, sees own `sub` + "send this to the yard admin",
never joins the room. Admin adds the `sub` to crane `.env`, recreates;
Ada's friend is in. No `wrangler secret put`.

- [ ] Frame `kind: "allow"` crane→DO with `subs[]` (same shape as
      `cmds`); phone must not publish
- [ ] DO stores allowlist per slug; `oidcHandshake(role=phone)` asks the
      DO instead of reading `ALLOWED_SUBS`
- [ ] On publish: close phone sockets whose `sub` is no longer allowed
- [ ] Mint session for any **verified** Google account; `/api/auth/me`
      returns `{ sub, email, allowed }`; DO still denies unless allowed
- [ ] Phone shows `sub` + "send this to the yard admin" when
      `allowed: false`; never on the query string
- [ ] ai-gantry `internal/channel/pendant`: publish allowlist on
      connect; keep local check as a free redundant filter
- [ ] Remove `ALLOWED_SUBS` from `resolveAuthMode`, `wrangler` docs,
      `setup.md`, `edgecases.md`, `todo.md`
- [ ] Tests: `test/mailbox/allow.test.ts`, handshake against DO list

### R3.3 — Secrets off the URL · **now**

**Walk:** real crane connects with `Authorization: Bearer` only.
`?bearer=` on an oidc-mode upgrade is 401. Logpush shows no tokens.

- [x] `handshake`: accept `queryBearer` / `querySecret` in **spike**
      mode only
- [x] `avatarRequestPath`: same
- [x] Docs: crane must use the header; `/crane` stand-in is spike-only
- [x] Tests: `test/auth/handshake.test.ts` rejects query bearer in oidc

### R3.4 — Surface hardening · **now**

- [x] `/crane` page gated behind `PENDANT_DEV` (or excluded from prod
      build)
- [x] `parseImages`: phone→crane `data:image/` only; `https://` legal
      crane→phone
- [x] `mailboxUpgrade`: `headers.delete("X-Pendant-Op")`
- [x] `mailboxUpgrade`: `Origin` must match request origin when present
- [x] OAuth: PKCE (`code_challenge` S256) + `nonce` verified on the ID
      token
- [x] Tests: frame images by role, upgrade origin/op stripping, PKCE
      round trip in `test/auth/google.test.ts`

---

## R4 — Docs · **next** · gantry-pendant

- [x] `security.md`: "Authn on every frame" → describe what R3.1 does
- [x] `security.md` / `edgecases.md`: session idle vs hard, per R3.1
- [x] `architecture.md` / `design.md`: DO benefit is "sockets meet
      here", not streaming
- [x] `todo.md`: Web Push (VAPID from the Worker, iOS 16.4+ installed
      PWA) moves from "not this version" to **later**
- [x] `edgecases.md`: add "sent" with socket down, two devices one
      human, iOS background drop, `context.at` untrusted, long turn
      with no streaming, `cmds` ghost until republish
- [ ] `setup.md`: collapse the two-paste dance after R3.2

---

## R5 — Later

- [ ] Web Push via service worker + VAPID (lock-screen cron ping while
      the app is dead)
- [ ] "Kit is thinking" `ack` from the channel when the Handler starts
- [ ] Prune stale entries in the DO rate-limit map
- [ ] Sliding session refresh if R3.1 picked hard-7d for now

---

## Gates (do not close a group without these)

- `npm test`, `npm run typecheck`, `npm run lint` green on touched files
- Walk done on a **phone on cellular**, not two laptop tabs, for R1 and
  R3.1
- No token, `sub`, or body in Worker logs after the change
