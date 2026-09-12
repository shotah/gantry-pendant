# Backends

This Worker is the mailbox. The crane is **another checkout**. Phones:
[frontends.md](frontends.md). Wire: [architecture.md](architecture.md).
Who pastes what: [setup.md](setup.md). Gotchas:
[edgecases.md](edgecases.md).

A frame change here is a change for the crane that already shipped.
`app/crane` (loopback stand-in) is not the crane.

---

## Cranes

| Backend | Checkout | What it is |
| --- | --- | --- |
| ai-gantry `CHANNEL=pendant` | [ai-gantry](https://github.com/shotah/ai-gantry) (`repos/ai-gantry`) `internal/channel/pendant/` | Go, outbound `wss`, gorilla. Same `Handler` as Telegram / Discord / Slack. No listen port |
| Crane stand-in | this repo `/crane` + `lib/dev/` | Loopback only (`PENDANT_DEV`). A browser tab, not Go |
| gantree | [gantree](https://github.com/shotah/gantree) | Not a crane. Mints the bearer, pushes Worker secrets, POSTs `persona/avatar.jpg` to `/api/avatar` |
| pendant-mcp | [pendant-mcp](https://github.com/shotah/pendant-mcp) | Shipped stdio MCP on the crane (`mcp.toml` server id `pendant`). Face / backdrop / theme over HTTP with the crane bearer. Releases: [github.com/shotah/pendant-mcp/releases](https://github.com/shotah/pendant-mcp/releases). Walk: [agent_ui_controls.md](agent_ui_controls.md) |

Crane env: `PENDANT_MAILBOX_URL` (`https://<host>/ws/<slug>`; Go turns
it into `wss` and adds `role=crane`), `PENDANT_BEARER`,
`PENDANT_ALLOWED_USERS`. Worker secret: `CRANE_BEARERS=<slug>:<token>`,
one per crane; the token is bound to that slug.

Open crane work: ai-gantry
[todo.md](https://github.com/shotah/ai-gantry/blob/main/docs/todo.md).

---

## When you change this repo

If the edit is **wire, rate, queue, routing, or caps**, say what the
Go crane does with it before you call it done. A PWA + Cab walk is
not enough; the crane is the third client.

| Kind of change | Crane |
| --- | --- |
| Additive JSON on `inbound` / `pin` (`seq`, `at`, extra `context`) | Go `inboundFrame` is `encoding/json`; unknown keys drop. That is the bar |
| New `kind` **from** the crane, or a new required field | `parseFrame` `KINDS` must know it or the DO answers `error` `bad frame`, and the crane **ignores `error` today** — the frame just vanishes. Ship `outboundFrame` + `KINDS` together |
| New notice **to** the room (`face` / `backdrop` / `theme` shape) | `announce` hits the crane socket too. Add it to `ignoredKind` in `pendant.go` or every notice logs `pendant ignore (not allowlisted)` on the crane |
| Rate bucket (`caps.ts`, `rate.ts`) | Crane bucket is `bearer:<slug>`: 30 frames/min, bytes 256 KB/min, 4 MB burst. Everything counts except `draft`. `typing` every 4 s is 15/min by itself. Refusal is `error` `rate` with the refused `id`; the crane logs it and does not retry |
| Routing (`route.ts`) | `reply` / `typing` / `draft` **need `user_id`**; without it the DO drops them silently. `push` without `user_id` is every phone plus the broadcast transcript |
| Queue (`QUEUE_MAX` 50, `QUEUE_TTL_MS` 1 h) | Crane-bound rows are drained **and deleted** on dial (at most once). The crane never sends `ack`. Longer than 1 h offline loses the turn |
| Caps (`TEXT_MAX` 8 000 **bytes**, `IMAGE_MAX` 1, `IMAGE_BYTES_MAX`, `FRAME_BYTES_MAX`) | Go clips drafts and streamed replies to 8 000 **runes** (`draftTextMax`); the non-stream `reply` path does not clip. Extra photos go one per frame (`replyFrames`). Over the cap is `error` `too large`, dropped |
| `cmds` / `allow` (`COMMANDS_MAX` 32, `ALLOW_USERS_MAX` 64) | Crane publishes both first thing on **every** dial. DO keeps the last copy. Over the cap is truncated, not refused |
| Auth (`CRANE_BEARERS`, header only) | Checked at upgrade only; a rotated bearer kills on the next dial. `?bearer=` is 401 in oidc mode. Missing `Origin` is allowed (Go). Same header on pendant-mcp blob POSTs |
| Face / backdrop / theme HTTP | pendant-mcp already ships those seven tools. A new required field, 400 token, catalog id, or route change needs a [pendant-mcp](https://github.com/shotah/pendant-mcp) release (and a gantree Photo-fold walk for `/api/avatar`). Additive JSON on `GET /api/theme` is fine — it returns the GET body as-is |
| `context` (`parseContext`) | Crane reads `context.geo` (+ `at` / `tz` struct fields) into `here`. Bare geo is a `pin`: silent, no Completer |
| Hibernation ping | DO answers a text `ping` with `pong` without waking. The crane sends none today (gorilla does not ping by itself) |
| Draft cadence | The crane's, not the Worker's — [below](#drafts-what-the-mailbox-promises) |

**Cover:** after a mailbox change, read
`repos/ai-gantry/internal/channel/pendant/pendant.go` (dial, `serve`,
`dispatch`, `ignoredKind`, `startTyping`), `inbound.go` (`inboundFrame`
/ `outboundFrame`, allowlist), `stream.go` (`editStream`, `Finish`),
`photo.go` (`replyFrames`, `fitPendantPhoto`). Blobs / mood:
[pendant-mcp](https://github.com/shotah/pendant-mcp) (stdio child;
inherits `PENDANT_MAILBOX_URL` + `PENDANT_BEARER`). Loopback stand-in:
`app/crane`, `lib/dev/samples.ts`. If the crane would drop a turn,
file it in ai-gantry `docs/todo.md` (or patch both). A blob HTTP break
is a pendant-mcp issue, not a Go channel one.

---

## The socket (what the crane does today)

**Dial.** `GET /ws/<slug>?role=crane` with `Authorization: Bearer`.
The Worker matches `bearerForSlug`, stamps `X-Pendant-Role` /
`X-Pendant-Rate` (`bearer:<slug>`) / `X-Pendant-Slug`, and hands the
upgrade to the Durable Object. The DO stores the slug and indexes the
room in KV (`indexRoom`). Handshake timeout 15 s. On drop the crane
redials with backoff 1 s → 30 s.

**On connect.** The crane writes `cmds` (`slash.Catalog()`) then
`allow` (`PENDANT_ALLOWED_USERS`). The DO then drains the crane queue:
every `inbound` that arrived while the crane was gone (≤ 50 rows, ≤ 1 h)
is sent once and deleted. No transcript, no `cmds`, no theme go to the
crane.

**Frames the crane receives.**

| Kind | Body | Crane |
| --- | --- | --- |
| `inbound` | `text`, `images[]`, `context`, `user_id`, `email` (**only when verified**), `id`, `seq`, `at` | Allowlist on `sub` / email, learn the sub for `push`, `here` from `context.geo`, then `Handler` |
| `pin` | `context.geo`, no text / photo | `here` only. Silent |
| `ack` | `id` / `since` from a phone | Forwarded; the crane ignores it |
| `face` / `backdrop` / `theme` | notice | Ignored (`ignoredKind`) |
| `error` | `text` token, `id` | Logged (`pendant mailbox error`). Does not start a turn. A refused `reply` is still lost — no retry |

**Frames the crane sends.**

| Kind | Needs | DO | Counted |
| --- | --- | --- | --- |
| `reply` | `user_id`, `text` and / or `images[0]` | `id` if missing, `seq` + `at`, queue `q:` for that `sub`, transcript `t:<sub>`, fan to every `sub:<user_id>` socket, Web Push to that human | yes |
| `push` | `text` and / or photo; `user_id` optional | Same. No `user_id` = every phone socket + broadcast transcript `t:_` + Web Push to every stored subscription | yes |
| `typing` | `user_id` | Fan only. Not queued. Phones show it for 6 s (`TYPING_TTL_MS`) | yes |
| `draft` | `user_id`, `text` | Fan only. Not queued, not in the transcript, no `seq` | **no** |
| `cmds` | `commands[]` | Stored; fan to phones; replayed on phone connect | yes |
| `allow` | `users[]` (`sub` and / or `email`) | Stored room list; KV directory; phones no longer listed get `4401` | yes |
| `ack` | `id` | Deletes that crane-bound queue row. Unused by Go today | yes |
| `error` | — | **Do not.** With `user_id` it routes and queues to that phone, which paints it on the human's newest pending bubble as "not sent" | yes |

Refusals back to the crane are `{ "kind": "error", "text": "rate" |
"too large" | "bad frame", "id"? }`. Same tokens as the phones.

`push` ids come from cron: `cron-<job>-<ms>`, suffixed `-<i>` per
target. The `id` is the dedup key on the phones (`placeInThread`) and
the queue key `(id, to)`; reuse one and the phone repaints instead of
adding a bubble.

---

## Drafts (what the mailbox promises)

`draft` is Telegram layer 2 for the room: one replaceable Kit bubble
per human while the turn runs. The Worker's side of that contract:

- **Free.** No storage read beyond the cached room list, no write, no
  `seq`, not queued, not in the transcript, exempt from the rate
  bucket (`cranePublishedDraft` skips `take`). Billing is 20 WS
  messages per DO request; a 10 s answer at 4 Hz is 2 requests.
- **Fan only.** `user_id` picks the sockets. No phone connected =
  dropped. A reconnecting phone gets the transcript and the queue,
  never a draft.
- **Phones paint one bubble.** PWA `DRAFT_BUBBLE_ID`, Cab `DRAFT_ID`:
  replace by text, keep it last in the thread, drop it on empty text,
  on `reply`, and on socket close. Not persisted on the device.

The **cadence is the crane's.** `stream.go` throttles at `streamMinGap`
250 ms with a trailing flush: at most one draft per gap, and one more
after the last delta so a fast model does not leave the bubble on
`bo`. `Finish` / `Discard` stop that timer (and a `finished` flag)
before the `reply` or empty `draft` goes out. Mailbox cost is nil.
Do **not** coalesce, buffer, or timer drafts in the DO — that would
put a second clock in the room.

Invariant both sides keep: **no `draft` after the `reply`**. Phones
drop the draft on `reply`; a late draft re-paints a stale bubble under
the answer on both mouths.

---

## Caps (Worker ↔ Go)

Source of truth is `lib/mailbox/caps.ts`. Go mirrors by hand; change
one, change the other.

| Cap | Worker | Crane |
| --- | --- | --- |
| Text per frame | `TEXT_MAX` 8 000 bytes | `draftTextMax` 8 000 runes, drafts + streamed `Finish` only |
| Images per frame | `IMAGE_MAX` 1 | `replyFrames`: first frame carries one, rest one per frame |
| Image bytes | `IMAGE_BYTES_MAX` 1 500 000 (the data URL) | `fitPendantPhoto` |
| Image URL | crane may send `https://` or `data:image/`; phones `data:` only | `outboundImages` |
| Whole frame | `FRAME_BYTES_MAX` 2 000 000 | — |
| Frames / min | `RATE_FRAMES_PER_MIN` 30, `draft` exempt | `typingEvery` 4 s |
| Bytes / min | `RATE_BYTES_PER_MIN` 256 KB, burst 2 × frame | — |
| Queue | `QUEUE_MAX` 50, `QUEUE_TTL_MS` 1 h | redial backoff ≤ 30 s |
| Catalog | `COMMANDS_MAX` 32, name ≤ 32, hint 3–256 | `slash.Catalog()` |
| Room list | `ALLOW_USERS_MAX` 64, `sub` 10–32 digits | `PENDANT_ALLOWED_USERS` |
| Typing TTL | `TYPING_TTL_MS` 6 s on the phones | refresh every 4 s |

---

## Photos and blobs

Photos in the thread ride `images[]` on `reply` / `push`, budget above.
The room's **face**, **backdrop**, and **theme** are HTTP with the same
bearer (`Authorization: Bearer`, header only, bound to the slug):
`POST /api/avatar?slug=`, `POST` / `DELETE /api/backdrop?slug=`,
`GET` / `POST` / `DELETE /api/theme?slug=`. Gantree still POSTs the
Photo-fold face. The agent wears a generated one (and wallpaper +
mood) through [pendant-mcp](https://github.com/shotah/pendant-mcp) —
`pendant__avatar_*`, `pendant__backdrop_*`, `pendant__theme_*`. Pictures
hand off on disk (`IMAGE_OUTPUT_DIR` → `source_path`); the bearer
never leaves the crane env. Shapes, caps, and the notices every socket
gets:
[frontends.md](frontends.md#face-backdrop-and-theme-what-every-mouth-must-do-the-same),
[agent_ui_controls.md](agent_ui_controls.md).
