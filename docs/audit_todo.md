# gantry-pendant — audit todo

Bugs found reading the code, nice-to-haves that are not on the product
walks yet, and security work split by **when** it is due. Product walks
stay in [todo.md](todo.md); this is the hardening list beside it.
Threat model and the principals: [security.md](security.md). Misses in
the field: [edgecases.md](edgecases.md).

Bugs 1–13 and the Dev security items below are **done** in this
checkout (2026-09-10). Cron pings that never came back lined up with
tag collision, unscoped phone acks, and a lexical `since` cursor —
not with a listed human changing Kit's face. Decisions live in
[security.md](security.md). Before go-live and after go-live lists
are still open.

---

## Phases

Iteration speed matters more than a locked door while the only humans
on the origin are the yard. The line is drawn like this:

| Phase | Meaning | Bar |
| --- | --- | --- |
| **Dev** | Do now. Cheap, no new step in the loopback walk, mostly correctness. | Two tabs still work on `127.0.0.1` with no extra paste. |
| **Before go-live** | Before the origin is handed to a human outside the yard, or Telegram is retired for a crane. | Nothing here ships to a stranger's phone first. |
| **After go-live** | Ongoing. Drills, counters, rotation. | Calendar, not a blocker. |

If a Dev item starts to slow the loopback walk, it moves to Before
go-live. If a Before go-live item is skipped, say so in
[edgecases.md](edgecases.md#checklist-after-deploy) so the checklist is
honest.

---

## Bugs

Confirmed, ordered by blast radius. File refs are where the fix went.

### 1. `/ws/` upgrade forwards client `X-Pendant-*` headers

`worker/index.ts` copied every request header, then **set**
`X-Pendant-Role` / `Rate` / `Slug` and only set `Sub`, `Email`,
`EmailVerified`, `Exp` when the principal has them. `stripUpgradeOp`
deleted `X-Pendant-Op` only. A crane bearer (or a spike phone) could
pre-set `X-Pendant-Sub: <someone>` and the Durable Object tagged the
socket with a `sub` it never earned.

- [x] `stripUpgradeOp` deletes **every** `X-Pendant-*` before the Worker
      stamps its own. `stampMailboxHeaders` writes only earned fields.
      `test/auth/upgrade.test.ts`.
- [x] Push and avatar still mint fresh `Headers` (Op / Sub / Email
      only). They never copy the client request.

### 2. Socket tags collide with `user_id`

`Mailbox.fetch` tagged a socket `[role, rateId, sub, exp, email,
verified]`. `getWebSockets(tag)` matches **any** slot. `routeTag`
returned the crane's raw `user_id`. So a crane `reply` with
`user_id: "1"` landed on every verified phone (`verified` tag is `"1"`),
`"phone"` broadcast, `"crane"` echoed to cranes, and an email string
hit that person. That is the most likely "cron ping never came back"
when the wake used a short `user_id`.

- [x] Prefix every tag (`role:`, `rate:`, `sub:`, `exp:`, `email:`,
      `verified:`); `routeTag` returns `sub:<id>`; `meta()` reads by
      prefix (leftover positional tags still parse).
      `test/mailbox/tags.test.ts`, `test/mailbox/route.test.ts`.

### 3. Phone `ack id` is not scoped to the acking `sub`

`deleteQueued({ id, to: "phone" })` deleted `q:phone:<id>` with no
owner check. Any listed phone that knew an id could delete another
person's queued reply. The first phone to ack a broadcast cron `push`
(`userId: ""`) deleted it for everyone else.

- [x] Phone ack deletes a targeted row only when `userId` matches the
      acking `sub`. Broadcasts stay until TTL; each phone keeps a seq
      cursor so reconnect does not wait on someone else's ack.
      `test/mailbox/queue.test.ts`.

### 4. `since` cursor is a string compare over three id formats

The phone mints `crypto.randomUUID()`; the DO mints base36
`${Date.now()}-${rand}`; the crane may send any string ≤ 128. `since`
used `<=` / `>` on those. A crane id that sorted high was never dropped;
one that sorted low was dropped before delivery.

- [x] DO assigns a monotonic `seq` at enqueue (storage counter). Flush
      and `since` use `seq`. Client `id` stays a correlation id for
      `ack` and the pending bubble. `test/mailbox/queue.test.ts`.

### 5. KV directory writes are unguarded on the upgrade path

`directoryRemember` was awaited inside `Mailbox.fetch` on every crane
connect. KV is 1 write/s/key. A crane reconnect loop or a KV hiccup
threw, the upgrade failed, the crane reconnected, repeat.

- [x] Best-effort: `directoryRemember` try/catch (failed KV does not
      store the hash, so the next connect retries). Skip re-index
      when `allow.hash` is unchanged. Throwing KV:
      `test/auth/directory.test.ts`.

### 6. Auth rate limiter never prunes and is per-isolate

`lib/auth/limit.ts` `authLimitStore` grew one bucket per IP / `sub`
forever. It also resets on isolate recycle and is per-colo, so it is
a speed bump, not the 429 the docs describe.

- [x] Evict buckets idle > 60 s on each take. `test/auth/limit.test.ts`.
- [ ] Real limit is a Before go-live item below.

### 7. Phone upgrade wakes a Durable Object before the session is checked

`mailboxUpgrade` fetched the room list for `role=phone` **before**
`handshake` read the cookie. An unauthenticated request to
`/ws/<any-slug>?role=phone` woke (created) a DO per slug name.

- [x] `handshakePhone` reads the session first; `loadRoom` (the DO
      wake) runs only when a cookie exists. Spike and missing session
      never call it. `test/auth/handshake.test.ts`.

### 8. Worker and Durable Object have no tests and sit outside coverage

Nothing under `test/` imports `worker/index.ts` or `worker/mailbox.ts`.
`vitest.config.ts` coverage `include` is `lib/**` and `app/lib/**`.

- [x] Decisions live in `lib/mailbox/` and `lib/auth/` (tags, route,
      queue seq/ack, handshake, stamp). Tests drive those. The DO class
      is a thin adapter — `worker/**` stays out of coverage `include`
      so the 85 % bar does not pretend the class is exercised. A
      `@cloudflare/vitest-pool-workers` pool is still later if we want
      `acceptWebSocket` itself.

### 9. `/api/auth/me` fans out to every crane DO on each call

`admittedCranes` probed each `CRANE_BEARERS` slug not already in KV.
`PhoneShell` polled `/me` every 5 s while the human is not listed. The
limit is 20/min/IP, so two phones behind one NAT on the "not on any
crane yet" screen hit 429 and the poll went quiet with no hint.

- [x] `/me` probes only the typed slug (KV is the index). Phone polls
      at 15 s with backoff and paints "give it a minute" on 429.
      `test/auth/directory.test.ts`,
      `test/app/components/chat/PhoneShell.test.tsx`.

### 10. Half-open crane socket loses inbound

Crane-bound frames with a live crane peer were **sent, not queued**.
The phone's `ack` means "the DO has it". A hibernated or TCP-dead
crane socket that had not closed yet dropped the frame silently.

- [x] Pendant half: inbound is queued when no **open** crane socket
      (`readyState === 1`); a hibernated/TCP-dead socket no longer
      counts as live. Crane `ack` deletes the crane-bound row. Always-
      queue while a socket looks open still waits on ai-gantry sending
      that ack (otherwise reconnect would double Handle).

### 11. `docs/todo.md` is stale on typing and draft

`typing` and `draft` frames are wired Worker → phone
(`lib/mailbox/typing.ts`, `draft.ts`, `PhoneShell` `DRAFT_BUBBLE_ID`).

- [x] Ticked the pendant halves in [todo.md](todo.md). Crane emit /
      `ReplyWriter` stay in
      [agent_typing_response_todo.md](agent_typing_response_todo.md).

### 12. Avatar POST is open to every listed phone

`app/api/avatar/route.ts` `authorize` accepts a phone cookie **or** a
crane bearer. Also `readAvatarUpload` read the whole body before the
5 MB check.

- [x] Keep human upload (family mouth). Written in
      [security.md](security.md).
- [x] Check `Content-Length` before buffering; cap the body after
      read too. `test/avatar/http.test.ts`.

### 13. Unbounded client memory

`messages` and `seenIds` in `PhoneShell` grew for the life of the tab.

- [x] Cap the thread (500) and make `seenIds` an LRU.
      `test/app/lib/thread.test.ts`. "Reload keeps the thread" is still
      the product walk in [todo.md](todo.md).

### Minor

- [x] `PUT|DELETE /api/push` caps the actual body (chunked or not), not
      only `Content-Length`.
- [x] `exchangeCode` uses `AbortSignal.timeout` (10 s).
- [x] `Mailbox.webSocketError` closes 1011.
- Spike-mode `?secret=` rides the WebSocket URL and shows up in Worker
  request logs. Loopback only, by design — spike now fails closed off
  loopback.

---

## Nice to have

Not on [todo.md](todo.md) yet. Small, and none of them change the wire.

- [ ] **Return-to after Google** — the callback always lands on `/`.
      Carry `?slug=` / a deep link through the `state` cookie.
- [ ] **Sign out everywhere + devices** — list this `sub`'s push
      subscriptions with a remove button. Turns the stolen-phone
      runbook into a tap. Needs revocation (Before go-live).
- [ ] **Delivery state on the bubble** — `sent` (DO ack) vs `delivered`
      (crane ack). Depends on the remaining ai-gantry half of bug 10.
- [x] **`no-console: error`** for `worker/`, `lib/`, `app/` in
      `eslint.config.js`. There are zero calls today; the rule keeps
      GPS and bodies out of logs by construction.
- [ ] **`wrangler types`** — replace hand-rolled `types/cloudflare.d.ts`
      and `worker-env.d.ts`. Import over write; the hand copy already
      lags the real `DurableObjectStorage` surface.
- [ ] **Pin deps** — `react`, `react-dom`, `typescript`, `@types/*`,
      `tailwindcss`, `@tailwindcss/postcss` are `latest`. Pin majors;
      add Renovate or Dependabot weekly.
- [ ] **Push fail counter** — only 404 / 410 drop a subscription. Count
      consecutive `fail` and drop after N.
- [ ] **Non-blocking push fan-out** — `notifyOffline` awaits every push
      service round trip before the reply handler returns. Fire and
      forget with the result written back to storage.
- [ ] **DO alarm sweep** — one `alarm()` prunes queue TTL, the `rate`
      map, and dead push rows, instead of `loadQueue` doing it on every
      frame. Rate-map prune on each `take` already landed; alarm is
      still nicer.
- [ ] **Version on `/api/auth/config`** — `package.json` version so a
      release can be checked from a phone.

---

## Security

Same phases as above. Anything already covered in
[security.md](security.md) is not repeated here; this is what the code
does **not** do yet.

### Security — Dev

Do now. None of these add a paste or a step to the two-tab walk.

- [x] Bugs 1, 2, 3, 5, 6, 7 above.
- [x] **Spike mode fails closed off loopback.** `resolveAuthMode`
      returns `spike` only on a loopback host (or when `host` is
      omitted in unit tests). A leftover `MAILBOX_SECRET` on
      `workers.dev` is config, not a room. `127.0.0.1` is unchanged.
      `test/auth/mode.test.ts`.
- [x] **`no-console` rule** (Nice to have) — it is a security control.
- [x] **DO test harness** (bug 8) — logic extracted to `lib/`; a
      Workers pool is later.

### Security — Before go-live

Before a human outside the yard gets the origin, or Telegram is turned
off for a crane.

- [ ] **Response headers.** None exist today. Document routes:
      `Content-Security-Policy` (the two inline boot scripts in
      `app/layout.tsx` need a nonce or hash; `img-src 'self' data:
      https:` for markdown and photos; `connect-src 'self' wss:`;
      `frame-ancestors 'none'`), `Strict-Transport-Security`,
      `X-Content-Type-Options: nosniff`, `Referrer-Policy: no-referrer`,
      `Permissions-Policy: geolocation=(self), camera=(self),
      microphone=()`. API routes: `Cache-Control: no-store`.
- [ ] **Session revocation.** Sign-out only clears the cookie; a copied
      JWE is good until `exp` (7 d). Add a per-`sub` "not before"
      (`iat` floor) or a `jti` denylist in KV. "Sign out everywhere"
      and the stolen-phone runbook use it. Pair with the sliding
      refresh line in todo.md.
- [ ] **CSRF defense in depth.** `SameSite=Lax` is the only guard on
      `POST /api/avatar`, `PUT|DELETE /api/push`, `POST
      /api/auth/logout`. Require `Sec-Fetch-Site` ∈ `same-origin`,
      `none` (or a matching `Origin`) on mutating routes. Drop
      `GET /api/auth/logout`. `__Host-` cookie prefix.
- [ ] **Push endpoint allowlist.** `parseHttpsEndpoint` accepts any
      `https://`; the Worker POSTs to it. Restrict to the browser push
      hosts (`fcm.googleapis.com`, `*.push.apple.com`,
      `*.push.services.mozilla.com`, `*.notify.windows.com`). A listed
      human should not be able to point the Worker at a URL.
- [ ] **Real rate limits.** `/ws/` upgrade and `/api/auth/google` have
      none; the in-isolate map is per-colo (bug 6). Cloudflare WAF
      rate-limiting rules (or the Rate Limiting binding) on `/ws/*`,
      `/api/auth/*`, `/api/push`. Keep the DO per-`sub` frame and byte
      buckets.
- [ ] **Native token nonce is client-chosen.** `POST /api/auth/token`
      checks the ID token's `nonce` against the body's `nonce`; the cab
      supplies both. Issue the nonce server-side (`GET
      /api/auth/nonce`, one-time, 5 min) so a stolen ID token cannot be
      replayed for a 7 d session. Cab change too.
- [ ] **CI hardening.** `permissions: contents: write` is workflow-wide
      in `ci.yml`; scope it to the badge job. Pin actions by SHA.
      `npm audit --omit=dev` gate. Consider deploying on `v*` tags
      only, not every push to `main`.
- [ ] **Confirm on the deployed origin** (already in the edgecases
      checklist, restated because it is the go-live gate):
      `MAILBOX_SECRET` and `PENDANT_DEV` unset; `/crane` is 404;
      `?secret=` on an oidc upgrade is 401; `/api/auth/config` shows
      `mode: "oidc"`, `dev: false`.
- [ ] **`/api/auth/config` is public** and names the config gap
      (`session` / `crane`). Fine for the yard; decide whether it stays
      once the origin is public.
- [ ] **Custom hostname** (todo.md) → `Secure` cookie always, fixed
      cookie domain, OAuth redirect updated.
- [x] **Avatar write policy** (bug 12) decided and written down:
      listed phones may POST Kit's face.

### Security — After go-live

Calendar items. None of these block a release.

- [ ] **Rotation drills.** `SESSION_SECRET` (logs everyone out — add
      dual-key read first), `CRANE_BEARERS` per slug, Google client
      secret, VAPID (every phone re-subscribes). Once each, on purpose,
      before they are needed.
- [ ] **Counters, not bodies.** 401 / 403 / 429 / 4401 per route via
      Workers Analytics Engine or `observability` with sampling. Alert
      on spikes. Never lat/lon, never text, never endpoints.
- [ ] **Dependency cadence.** `jose`, `@pushforge/builder`, `vinext`
      (beta), `wrangler`. Weekly bot, monthly human look.
- [ ] **Google consent screen** from Testing to Production before the
      test-user cap; scopes stay `openid email profile`.
- [ ] **DO storage audit** monthly: queue rows, `rate` map size, push
      rows per `sub`. The alarm sweep above makes this a glance.
- [ ] **Policy revisits** with real usage: 7 d session, `QUEUE_TTL_MS`
      1 h vs "reload keeps the thread", 30 frames / 256 KB per minute.
- [ ] **Stolen-phone runbook** end to end once a quarter: lock, Google
      sign-out, yank `sub`, rotate bearer, confirm 4401.

---

## Not this list

- Product walks (P5, allowlist publish, mouth UI) — [todo.md](todo.md)
- ai-gantry and gantree halves — named where they gate an item, tracked
  in those repos
- Anything that turns the mailbox into Gantree's IdP or a SaaS —
  [security.md](security.md#threat-model) out of scope
