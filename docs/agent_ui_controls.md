# Agent UI controls — face, backdrop, and mood

Kit decides he is Batman today. He draws the picture, then he **wears
it**: the header face flips, Gotham sits behind the thread, and the
phone goes **Noir**. No human taps anything.

This is the walk for an MCP the crane can call to change what the
Pendant mouth looks like, and the mailbox work that makes it real.
Streaming and reactions are not this doc.

Pitch: [README.md](../README.md). Room: [architecture.md](architecture.md).
Other mouths and the wire contract: [frontends.md](frontends.md#face-and-backdrop-what-every-mouth-must-do-the-same),
[theme](frontends.md#theme-what-every-mouth-must-do-the-same).
Image MCP: `repos/ai-gantry/repos/image-generation-mcp`. Tool names:
`repos/ai-gantry/docs/mcp-naming.md`.

A line is done when the **walk** works without a second brain. Scope is
which checkout you touch.

---

## Not crazy

The face path already exists end to end. Gantree's Photo fold writes
`persona/avatar.jpg` and POSTs it to `/api/avatar?slug=` with the crane
bearer; the Durable Object stores the JPEG and tells every socket
`{ kind: "face", text: "<rev>" }`; the PWA and Cab refetch. The agent
just needs a mouth on that same door.

What is new:

1. A **second blob** on the room — the backdrop — with the same shape.
2. A **room theme id** from a closed catalog (not raw hex).
3. A **stdio MCP** (`pendant-mcp`) that turns a generated picture into
   those POSTs, and lists / sets the mood, using the bearer the crane
   already has in its env.
4. Notices an **old client drops** instead of painting (`backdrop` and
   `theme` have no `text`).

Two real gotchas, both handled below:

- **Base64 does not survive the host.** ai-gantry stringifies tool
  results and truncates to `TOOL_RESULT_MAX_CHARS` (6000). The PNG from
  `image__photo_generate` never reaches the model as bytes. The handoff
  is a **file path** (`IMAGE_OUTPUT_DIR` → `path` in the summary), read
  by the pendant MCP on the same Mini.
- **Durable Object rows cap at 2 MB** (SQLite-backed, key + value).
  `AVATAR_MAX_BYTES` is 5 MiB today — a face over ~2 MB fails on `put`,
  not at the door. The backdrop budget is `BACKDROP_MAX_BYTES` =
  1 500 000 (same as one chat photo) so it never hits that. Tighten the
  face cap to match; the PWA already encodes to 1280 px so nobody notices.

---

## How Kit "sees" a theme (no screenshot)

He cannot see the phone. A screenshot of the combo (face + wallpaper +
palette) would be an MCP image, and those bytes die in the 6000-char
truncate — same trap as `photo_generate`. Do not add `theme_snapshot`.

He gets a **card**, not an id alone. `GET /api/theme` returns:

```text
{
  "theme": "noir",
  "themes": [
    {
      "id": "noir",
      "label": "Noir",
      "mood": "Gotham night — steel sky, ice-blue trim",
      "canvas": "#0a0c10",
      "accent": "#8eb4d4"
    }
  ]
}
```

`canvas` is the shop floor. `accent` is the tool color. Those two hexes
are the pairing; the rest of the palette is derived and contrast-tested
so he cannot make the phone unreadable. `mood` is the English he
actually matches ("be Batman" → noir, not `#8eb4d4`).

Do **not** stuff hex onto the id (`noir-0a0c10-8eb4d4`). The id is the
wire contract; the card is documentation the tool result already
carries. Adding a theme is a new id in `lib/theme/catalog.ts` plus a
contrast test — Cab maps the id to its own ColorScheme when it cares.

Raw colors on the wire are refused. A 22-token dump is how you get
unreadable fg-on-canvas and a Cab/PWA/gantree split. The catalog is the
guardrail.

---

## Fit gates

Same as [design.md](design.md#principles), plus:

1. **The crane's bearer is the identity.** The MCP presents
   `PENDANT_BEARER` on `Authorization`. `bearerForSlug` binds it to one
   slug, so Kit cannot repaint Ada's room.
2. **Bytes over HTTP, "changed" over the socket.** A JPEG is not a chat
   frame. `images[]` on the wire is a photo *turn*; the face and the
   backdrop are blobs on the room (`/api/avatar`, `/api/backdrop`).
   Theme is a tiny JSON id, closer to `cmds` than to a blob.
3. **Textless notice.** Backdrop and theme notices carry **no `text`**.
   Cab today paints any frame with text as a bubble (`Mouth.ingest`).
4. **Local off switch.** Wallpaper and mood are Kit's; showing them is
   the human's. Settings → Backdrop (`pendant.backdrop`) and
   Settings → Follow Kit's mood (`pendant.followTheme`), both default
   on, per device, not on the wire.
5. **No image work on the Worker.** Workers have no decoder. PNG → JPEG
   and the resize happen in the MCP on the Mini, same as the yard does
   for the face. Theme is an id; no pixels.
6. **The MCP is a grant, not a builtin.** `mcp.toml` `[[server]]` is
   the permission. A persona without it cannot change its face. Same
   naming contract as every sibling binary.
7. **Closed catalog.** `parseThemeWrite` accepts only known ids. Contrast
   on the painted pairs is a test, not a runtime WCAG service.

---

## Wire and HTTP

Contract of record: [frontends.md](frontends.md#face-and-backdrop-what-every-mouth-must-do-the-same),
[theme](frontends.md#theme-what-every-mouth-must-do-the-same).
Summary:

| Surface | Face | Backdrop | Theme |
| --- | --- | --- | --- |
| Route | `GET / POST /api/avatar?slug=` | `GET / POST / DELETE /api/backdrop?slug=` | `GET / POST / DELETE /api/theme?slug=` |
| Auth | listed phone cookie, native JWE, or crane `Authorization: Bearer` | same door (`lib/auth/slugRoute.ts`) | same |
| Body | JPEG, ≤ `AVATAR_MAX_BYTES` | JPEG, ≤ `BACKDROP_MAX_BYTES` | `{ "theme": "<id>" }` |
| Store | `avatar` `{ jpeg, rev }` | `backdrop` `{ jpeg, rev }` | `theme` string id |
| GET | `image/jpeg` + `X-Pendant-Rev` + `ETag: "<rev>"`, 404 when none; `If-None-Match` on the current rev → 304 | same | `{ theme, themes: cards }` |
| Notice | `{ kind: "face", text: "<rev>" }` | `{ kind: "backdrop", rev: <n> }` — **no text**; `rev: 0` = cleared | `{ kind: "theme", theme: "<id>" \| null }` — **no text**; flushed on phone connect |
| Cache bust | `?v=<rev>` | `?v=<rev>` | n/a (CSS tokens are already on the page) |

Notices are not `FrameKind`. The mailbox never parses them (they
originate on the DO); `parseFrame` refuses a phone that sends one.
The crane socket receives them and drops them (`missing user_id`).

---

## MCP — `pendant-mcp` (new repo, sibling of `image-generation-mcp`)

Go, `mark3labs/mcp-go`, stdio, `hostmanifest.go`, `make release`,
same as `boards-mcp`. Server id **`pendant`**.

| Tool | Host name | What it does |
| --- | --- | --- |
| `avatar_update` | `pendant__avatar_update` | Set Kit's face from a picture on disk → `POST /api/avatar` |
| `avatar_get` | `pendant__avatar_get` | Current face as MCP image + `{ rev, bytes }`; writes a file when `IMAGE_OUTPUT_DIR` is set so `photo_edit` can start from it |
| `backdrop_update` | `pendant__backdrop_update` | Set the chat wallpaper → `POST /api/backdrop` |
| `backdrop_delete` | `pendant__backdrop_delete` | Clear it → `DELETE /api/backdrop` |
| `theme_list` | `pendant__theme_list` | `GET /api/theme` — current id plus cards (`id`, `label`, `mood`, `canvas`, `accent`) |
| `theme_update` | `pendant__theme_update` | `{ theme }` from the catalog → `POST /api/theme` |
| `theme_delete` | `pendant__theme_delete` | Clear the room mood → `DELETE /api/theme` |

`{service}_{verb}_{object}`, no `pendant_` prefix, stable verbs
(`get` / `list` / `update` / `delete`). Add `avatar_` / `backdrop_` /
`theme_` to the shared nouns table in `mcp-naming.md`.

**Args** for the picture tools (snake_case). Exactly one source:

| Arg | Notes |
| --- | --- |
| `source_path` | File the image MCP wrote. Must resolve **inside** `IMAGE_OUTPUT_DIR` (or `PENDANT_IMAGE_DIR` when set) after symlinks; anything else is refused. This is the v1 handoff. |
| `source_image` | Base64 (raw or data URL). For hosts that keep image bytes. ai-gantry does not — do not lead the description with it. |

`theme_update` takes `theme` (required string, a catalog id). Teach-in
if it is missing or unknown: "call theme_list".

**Env** — all already in the crane process; the child inherits:

| Key | Notes |
| --- | --- |
| `PENDANT_MAILBOX_URL` | `wss://…/ws/<slug>` → `https://…/api/avatar?slug=<slug>`; same rewrite as `mailboxToAvatarUrl` in `lib/avatar/http.ts`. |
| `PENDANT_BEARER` | `Authorization: Bearer`. Header only — the crane door does not read `?bearer=`. Never in a tool result. |
| `IMAGE_OUTPUT_DIR` | Where `image__photo_generate` writes and where `source_path` may point. **Without it there is no picture handoff** — set it on any crane that has both MCPs. Theme tools do not need it. |
| `PENDANT_IMAGE_DIR` | Optional override / second allowed root. |

**Encode** (in the MCP, Go stdlib + `golang.org/x/image`): decode
PNG / JPEG / WebP; fit long edge to `AVATAR_EDGE` 1280 (face) or
`BACKDROP_EDGE` 1600 (backdrop); never upscale; JPEG quality
0.9 → 0.8 → 0.7 → 0.6 until under budget, then edge × 0.75 and repeat —
the same ladder as `jpegFromFile` and Cab `shrinkToFit`. Face budget is
`AVATAR_MAX_BYTES`; backdrop budget is `BACKDROP_MAX_BYTES`. No crop:
both mouths center-cover the face in a circle; ask for `1:1` in the
prompt instead.

**Result** JSON first, tiny. Picture tools:
`{ "rev": 1725…, "bytes": 312000, "edge": 1280, "mime": "image/jpeg" }`.
`theme_list` is the GET body as-is (cards are small). Errors are the
Worker's `{ error }` body verbatim so the model can read them.

**Descriptions lead with intent** (that is how Qwen picks):

- `avatar_update`: "Change your own profile picture / face on the phone
  app. Pass `source_path` from `image__photo_generate` (ask for a 1:1
  portrait). Not a chat photo — do not use this to send a picture."
- `backdrop_update`: "Set the wallpaper behind the chat on the phone
  app. Pass `source_path` from `image__photo_generate` (ask for 9:16).
  Use `backdrop_delete` to go back to plain."
- `theme_list`: "List the color moods you can put on the phone app.
  Each card has a mood line and two hexes (canvas = background, accent
  = highlight). Pick one id, then call theme_update. Not for drawing a
  picture — that is image__photo_generate."
- `theme_update`: "Set the phone app's color mood. Pass a `theme` id
  from theme_list. Match the mood line to how you feel (daylight cards
  are paper, chalk, foam, petal; ink is high-contrast night); do not
  invent hex. Humans can unfollow and keep their own theme."

Recipes live in the tool descriptions, not `PERSONA.md`
(`repos/ai-gantry/docs/persona.md`).

---

## Phone UI

- Header face: unchanged. `face` notice → `avatarRev` → `KitAvatar`
  refetch. Tap-to-replace stays.
- Backdrop: `app/components/chat/Backdrop.tsx`, absolute behind the
  scroller, `object-cover`, 60 % opacity over the theme canvas.
  Bubbles are opaque (`bg-kit` / `bg-you`) so only the gutter shows it.
  Header and Compose keep `bg-panel`; the wallpaper is the thread's.
- 404 or `rev: 0` paints nothing. No fallback picture — plain canvas
  **is** the fallback.
- Settings → **Backdrop** checkbox (phone only). Off never fetches.
- Both images share `useBlobUrl` (`app/lib/blobUrl.ts`): same-origin
  fetch with credentials, object URL, revoke on change.
- Theme: `theme` notice → `paintTheme(id)` if follow is on. Does not
  overwrite `pendant.theme`. Settings → **Follow Kit's mood**
  (phone only). A pick in the theme menu writes `pendant.theme` and
  sets follow **off**. `THEME_BOOT` applies `pendant.roomTheme` when
  follow is on so there is no flash of Boom before the socket.
- Catalog: Boom, Inlay, Lamp (gantree-shared hexes) plus Noir, Ember,
  Tide, Bloom. Contrast on fg/body/muted/mark is a test.

Do not paint the wallpaper on the crane stand-in (`/crane`). Do not put
it behind the login or waiting-room screens. The crane stand-in keeps
the operator's own theme pick.

---

## Knock-out — gantry-pendant

Worker + PWA + contract. Done here unless unchecked.

- [x] `lib/backdrop/store.ts`: `BACKDROP_STORE_KEY`, `BACKDROP_MAX_BYTES`
      1 500 000, `BACKDROP_EDGE` 1600, `packBackdrop`, textless
      `encodeBackdropNotice(rev)`, `backdropRevFromUnknown` (0 = cleared).
- [x] `lib/backdrop/http.ts`: `backdropRequestPath`, `readBackdropUpload`
      on the backdrop cap. `lib/avatar/http.ts` grew `blobRequestPath` /
      `readJpegUpload(cap)`; avatar wrappers unchanged.
- [x] `lib/auth/slugRoute.ts`: `authorizeSlug` / `withSlug` / `fromStub`
      pulled out of the avatar route so blob and theme routes use one door.
      Crane bearer is header-only; `?bearer=` is refused (tested).
- [x] `app/api/backdrop/route.ts`: GET / POST / DELETE.
- [x] `worker/mailbox.ts`: `X-Pendant-Op: backdrop` → `blobHttp` with a
      `BlobSpec`; face uses the same method. PUT stores + announces;
      DELETE clears + announces `rev: 0`; face has no DELETE (405).
- [x] PWA: `backdropRev` state, notice handler, `Backdrop` behind the
      scroller, `pendant.backdrop` pref + Settings checkbox,
      `useBlobUrl` shared with `KitAvatar`.
- [x] Tests: `test/backdrop/*`, `test/auth/slugRoute.test.ts`,
      `test/phone/prefs.test.ts`, `test/app/lib/blobUrl.test.ts`,
      `test/app/components/chat/Backdrop.test.tsx`, `PhoneShell.test.tsx`
      (notice refetches, no bubble, off never fetches).
- [x] `lib/theme/catalog.ts`: closed ids, mood + canvas/accent cards.
      Boom / Inlay / Lamp hexes unchanged. Contrast test on painted pairs.
      Daylight cousins (paper, chalk, foam, petal) plus ink (high-contrast night).
- [x] `lib/theme/store.ts`: textless `encodeThemeNotice`,
      `themeIdFromUnknown` (`null` theme = cleared), `parseThemeWrite`.
- [x] `app/api/theme/route.ts`: GET / POST / DELETE.
- [x] `worker/mailbox.ts`: `X-Pendant-Op: theme` → `themeHttp`;
      flush on phone connect after `cmds`.
- [x] PWA: `paintTheme` vs `applyTheme`, `pendant.followTheme` +
      `pendant.roomTheme`, Settings checkbox, human pick turns follow
      off, `THEME_BOOT` prefers the room id when following.
- [x] Contract in [frontends.md](frontends.md); write surface in
      [security.md](security.md).
- [ ] **Rate the blob writes.** `/api/avatar` and `/api/backdrop` POST
      have no limiter; an agent in a loop can spin the DO. Reuse
      `Mailbox.take` with a per-op rate id (`blob:face`, `blob:backdrop`)
      → 429 `{ error: "rate" }`. Same token the mouths already paint.
      Theme POST is tiny JSON; still count it so a mood loop cannot
      wake the DO forever.
- [ ] Lower `AVATAR_MAX_BYTES` to `BACKDROP_MAX_BYTES` (2 MB DO row).
      Message becomes `max 1.5MB`; Cab `SendError.kt` copies the string.
- [ ] PWA hardening: a frame with an unknown `kind`, no text, and no
      photo paints nothing (today the fallthrough paints an empty
      bubble). Cab already does this; the PWA ships with the Worker so it
      was never bitten.
- [ ] `?sample=backdrop` scene + `npm run shot` for
      [screens.md](screens.md). Shots for Noir / Ember exist only as
      `?theme=`.
- [ ] `mailboxToAvatarUrl` → `mailboxToBlobUrl(raw, "/api/backdrop")`
      for the yard when Gantree wants to set a default wallpaper.

## Knock-out — pendant-mcp (new checkout)

- [ ] Repo from the `boards-mcp` skeleton: `main.go`, `server/`,
      `tools/`, `hostmanifest.go`, `Makefile`, `VERSION`, release
      workflow with `download_url` archives.
- [ ] `tools/config.go`: `PENDANT_MAILBOX_URL` → API base + slug (port
      `MailboxSlug` from `internal/channel/pendant/pendant.go`; tests
      match `test/avatar/http.test.ts` cases), `PENDANT_BEARER`,
      `IMAGE_OUTPUT_DIR` / `PENDANT_IMAGE_DIR`.
- [ ] `tools/source.go`: `source_path` realpath + root check;
      `source_image` decode. Refuse anything outside the roots.
- [ ] `tools/encode.go`: decode → fit edge → JPEG ladder → budget.
      Pure; tested against the same 1600 → 1200 / floor cases as
      `test/app/lib/jpegFromFile.test.ts`.
- [ ] `tools/avatar.go`, `tools/backdrop.go`, `tools/theme.go`: the
      seven tools. Header auth. Picture tools send `Content-Type:
      image/jpeg`. Theme tools send JSON. Surface Worker `{ error }`
      verbatim. Never log the bearer or the bytes.
- [ ] Name tests: `^[a-z]+_[a-z]+`, none start with `pendant`.
- [ ] README: tools table, env table, `mcp.toml` block
      (`name = "pendant"`), the two-step recipe with `image`, and
      "theme_list then theme_update — match the mood line."

## Knock-out — ai-gantry

- [ ] `deploy/mcp.toml` + `examples/docker/mcp.toml`: commented
      `[[server]] name = "pendant"` next to `image`. Note that
      `IMAGE_OUTPUT_DIR` must be set for the picture pair to work.
- [ ] `internal/channel/pendant/pendant.go`: add `face`, `backdrop`,
      and `theme` to the ignore list (line ~283) so they stop logging
      `missing user_id`.
- [ ] `docs/mcp-naming.md`: `avatar_` / `backdrop_` / `theme_` row;
      host forms table gets `pendant`.
- [ ] `docs/mcp.md`: one paragraph — "results are text; image bytes go
      to disk via `IMAGE_OUTPUT_DIR`; downstream tools take `source_path`."

## Knock-out — image-generation-mcp (later)

- [x] `photo_edit` accepts `source_path` (same root rule) so
      `pendant__avatar_get` → `image__photo_edit` → `pendant__avatar_update`
      is a real "put a hat on my current face" chain. `source_image` remains
      for hosts that keep bytes.

## Knock-out — gantry-cab

Beta; tracked by its owner. Contract to meet is in
[frontends.md](frontends.md#face-and-backdrop-what-every-mouth-must-do-the-same)
and [theme](frontends.md#theme-what-every-mouth-must-do-the-same).
Until then an old APK is **safe**: backdrop and theme notices have no
text, so `Mouth.ingest` drops them and the face path is unchanged.

---

## Walk (done when this is boring)

Real crane, `CHANNEL=pendant`, `image` + `pendant` in `mcp.toml`,
`IMAGE_OUTPUT_DIR` set. Pocket, not two tabs.

- [ ] "Be Batman today." Face flips in the header on the phone within a
      second of the tool result, no reload. `persona/avatar.jpg` on the
      Mini is now stale — see edge cases.
- [ ] "Put Gotham behind us." Wallpaper lands behind the thread; bubbles
      stay legible; header and compose unchanged.
- [ ] "Make it feel like Gotham." After `theme_list`, `theme_update`
      `noir`. Phone goes ice-blue on steel. Ada's second phone follows.
- [ ] "Clear your backdrop." Plain canvas (Noir still on) on every phone
      in the room.
- [ ] "Go back to the usual colors." `theme_delete` → Boom (or whatever
      Ada picked).
- [ ] Settings → Follow Kit's mood off → Kit's next `theme_update`
      does not move Ada's palette; on → it does.
- [ ] Picking Ember in Settings turns follow off and sticks.
- [ ] Settings → Backdrop off → plain canvas, **no fetch**; on → back.
- [ ] Second listed phone in the same room sees face, wallpaper, and
      mood.
- [ ] Old Cab APK in the room: face flips; backdrop and theme paint
      **nothing** — no id in the thread, no HUN.
- [ ] `source_path: "/etc/hostname"` → refused; nothing read.
- [ ] `theme_update({ theme: "#ff00ff" })` → `bad theme`.
- [ ] Twenty `backdrop_update` calls in a minute → `rate` after the
      burst, once the limiter lands. Until then, note the gap.
- [ ] `photo_generate` without `IMAGE_OUTPUT_DIR` → the pendant tool
      says so in one sentence, and the model asks the operator.

---

## Edge cases

- **Two faces.** The yard's `persona/avatar.jpg` and the room blob can
  drift once Kit repaints himself. A later Photo fold apply overwrites
  Batman with the old face; a Telegram crane's profile photo never
  changed. v1 accepts this: the room blob is the Pendant face. Later:
  the MCP writes `persona/avatar.jpg` back when the persona dir is
  mounted, or ai-gantry fans `avatar_update` to `setMyProfilePhoto`.
- **Rev is DO time.** `Date.now()` on write. Two writes in the same
  millisecond share a rev and the second may not bust the cache — not
  worth a counter.
- **Bearer is the room.** A leaked `PENDANT_BEARER` already lets someone
  talk as the crane; wallpaper is the least of it. Rotate from the yard
  panel as today.
- **Old PWA.** There is none — the PWA ships with the Worker. The
  textless rule is for native mouths.
- **Android Auto.** No wallpaper on a head unit. When Cab paints the
  backdrop, in-hand only. Theme on Auto is Cab's problem (day/night
  for the car, not Kit's mood).
- **Unknown id on an old Cab.** Ignore, keep the current scheme. Do not
  fall back to boom (that would flash).
- **Follow vs `?theme=`.** Shots pass `?theme=lamp` and pin the human
  pick so a live room notice cannot restyle the PNG.

---

## Not this version

- Agent sends **raw hex** / a 22-token token dump / a CSS string.
- Agent picks the **font**. That stays the human's, per device.
- Per-human backdrops or themes. The room has one wallpaper and one
  mood, like it has one face.
- Animated / video backdrops. JPEG only, same gate as the face.
- Wallpaper on the login, waiting-room, or crane stand-in screens.
- Fetching `source_url` over the network from the MCP. Path or base64.
- A `backdrop` or `theme` chat turn. They are room state, not bubbles.
- `theme_snapshot` / a screenshot of the combo. MCP image bytes do not
  survive the host truncate; the card is the eyes.
