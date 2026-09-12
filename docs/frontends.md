# Frontends

This Worker is the mailbox. The mouths are **other checkouts**.
Wire: [architecture.md](architecture.md). The crane end of the same
wire: [backends.md](backends.md). Who pastes what:
[setup.md](setup.md). Gotchas: [edgecases.md](edgecases.md).

A frame change here is a change for every client that already shipped.
Do not treat `app/components/chat` as the only phone.

---

## Mouths

| Mouth | Checkout | What it is |
| --- | --- | --- |
| Pendant PWA | this repo `app/` | Handheld browser / Add to Home Screen |
| Cab | [gantry-cab](https://github.com/shotah/gantry-cab) (`repos/gantry-cab`) | Full Android app + Android Auto (`MessagingStyle`). Same mailbox, not a TWA wrapping this PWA |
| Helm | [gantry-helm](https://github.com/shotah/gantry-helm) (`repos/gantry-helm`) | Full iOS app + CarPlay communication notifications. Same mailbox, not a WKWebView wrapping this PWA |
| Crane stand-in | this repo `/crane` | Loopback only (`PENDANT_DEV`) |

Gantree is not a mouth. ai-gantry is the crane, not a phone.

Cab and Helm talk like the PWA: `GET /api/auth/config`,
`GET /api/auth/nonce`, `POST /api/auth/token` (native JWE),
`GET /api/auth/me`, then `wss /ws/<slug>?role=phone`. Google is the
pendant **Web** client id (`aud`) plus a **new** native OAuth
client (Android package / iOS bundle) — walk is on that checkout.
Cookie CSRF is PWA-only. Neither OkHttp nor URLSession stores
`pendant_session`.

---

## When you change this repo

If the edit is **wire, auth, queue, or thread order**, walk Cab
and Helm before you call it done. A PWA-only paint is not enough.

| Kind of change | Other mouths |
| --- | --- |
| Additive JSON (`seq`, `at`, extra `context`) | Old clients must keep working. Cab `parseFrame` and Helm `parseFrame` drop unknown keys — that is the bar |
| New required field, new `kind`, or a required header | Cab and Helm must ship in lockstep, or the mailbox must tolerate the old client |
| Auth (`/api/auth/*`, session JWE, 4401) | Cab and Helm POST the ID token and store the JWE. Spike query creds are PWA loopback only. Cookie CSRF is PWA-only — do not send `pendant_session` from OkHttp or URLSession. Additive `version` on `GET /api/auth/config` is dropped today (`AuthConfig` keeps `mode` / `google`). `GET /api/auth/nonce` is issued: both fetch it and mint locally on a failed GET (404 / junk / empty). Close `4401` / handshake 401 drops the stored JWE; 403 does not. Do not **require** stored nonces until those native builds are the sideload |
| Queue / `ack` / `since` / `seq` | Cab and Helm parse `seq` / `at`, insert like `placeInThread`, ack the highest seq. Transcript hydrate is the same frames plus `replay` — see below |
| Scroll / draft bounce | Cab already pins with reverseLayout (`ChatScroll.kt`). Helm pins the last bubble. Do not assume either needs the PWA CSS |
| Draft→reply remount | PWA `live` React key, Cab / Helm `composeKey` (`kit-live`) so Markdown does not remount when `__draft__` becomes `r1`. Not on the wire. |
| Photo caps, encode ladder, `error` tokens | Every mouth encodes to the same budget and paints refusals the same way — [Photos](#photos-what-every-mouth-must-do-the-same) |
| Face / backdrop blobs and their notices | Cab and Helm refetch `/api/avatar` on `face` and `/api/backdrop` on `backdrop`. Notices are not turns — [Face, backdrop, and theme](#face-backdrop-and-theme-what-every-mouth-must-do-the-same) |
| Header face (size, hang, stroke) | Cab TopAppBar and Helm header overlay, not PWA-only — [Header face](#header-face) |
| Room theme | Cab and Helm follow Kit when `followTheme` is on; GET `/api/theme` on connect — [Theme](#theme-what-every-mouth-must-do-the-same) |
| PWA-only UI (font, Install) | Cab has Compose. Helm has SwiftUI. |
| Voice (STT / TTS) | Mouth-local. No audio on the wire. Cab Auto / Helm CarPlay already read `reply` / `push` and stuff spoken Reply into `inbound`. Handheld dictation is compose-only — [voice.md](voice.md) |
| `context.surface` | Closed set: `browser` \| `android` \| `android_auto` \| `ios` \| `carplay`. Unknown names (including Cab’s old `pendant`) are dropped. Additive; old APKs still send `android` / `android_auto` |

**Cover:** after a mailbox frame change, read
`repos/gantry-cab/app/src/main/java/com/gantree/cab/mailbox/Wire.kt` and
`Mouth.kt`, and `repos/gantry-helm/Sources/Mailbox/Wire.swift` and
`Mouth.swift`; for caps, ladder, or photo size, Cab `mailbox/Photo.kt`
/ `SendError.kt` and Helm `Photo.swift` / `SendError.swift`; for face
/ backdrop / room theme, `Avatar` / `Look` / `ThemeApi` on both; for
the header circle itself, Cab `ui/KitAvatar.kt` + `ui/CabScreen.kt`
and Helm `HelmScreen` (82 / 80×40 / −2/−4 / 2 pt `line`). If either
native mouth would paint wrong or drop a turn, file it there (or
patch both). Sign in with Apple is still a mailbox auth change
([security.md](security.md)); APNs is lock-screen, same later as Cab
FCM. Do not grow a second Durable Object.

---

## `seq` / `at` (what Cab and Helm see today)

The Durable Object stamps `seq` (monotonic) and `at` (mailbox
epoch ms) on queued frames. The PWA inserts by `seq`, then `at`, and
reconnect-acks the **highest seq**. Drafts stay last.

Cab (`mailbox/Thread.kt`, `Mouth.ingest`, `MailboxClient`) and Helm
(`Sources/Mailbox/Thread.swift`, `Mouth.ingest`, `MailboxSocket`):

- Parses `seq` / `at`. Junk (`0`, negatives, strings) is dropped, same
  as `orderSeq` / `orderAt` here.
- Inserts with `placeInThread` (seq, then `at`, then id). Drafts stay
  last. Catch-up can arrive out of order.
- Reconnect-acks the **highest seq** (`since` is a numeric string).
  Falls back to last id when no seq has been seen yet.
- Does not *send* `seq` / `at` — `encodeFrame` omits them. The mailbox
  strips client order.
- **Transcript hydrate** replays existing `inbound` / `reply` / `push`
  with additive `replay: true`. Paint is the same `ingest` / `placeInThread`
  path. Cab and Helm `THREAD_MAX` is 80 (mailbox hydrates 80). **Ship
  those builds with this mailbox** so Auto / CarPlay HUNs skip
  `replay` (`shouldSpeak(kind, replay)`). An old APK still paints and
  still toasts every hydrate frame.
- **Sibling phones, live.** The Worker fans the same inbound body to
  `sub:<userId>` except the sender (`siblingPhoneTag`). Hydrate still
  covers a *new* socket. Cab `MailboxClient.sweep` and Helm
  `MailboxSocket.sweep` stay catch-up / Doze / frozen-socket insurance.
  Additive; mouths already paint `inbound` as "you" and skip HUN /
  notify. Walk: [sibling_phones.md](sibling_phones.md).
- **Thread on the device.** The PWA keeps the last thread per room per
  `sub` in IndexedDB (`app/lib/threadStore.ts`, `thread:<slug>:<sub>`,
  `THREAD_MAX` 500, drafts and `sending` bubbles excluded) and paints it
  before the socket is up. Hydrate frames then fold in by `id`
  (`mergeThread`, live wins) — same dedup as a reconnect. The first
  `ack` of a fresh load carries `since` = the highest cached `seq`, so
  the mailbox drops what the phone already holds instead of waiting for
  a reconnect. **Mailbox contract is unchanged**: it still flushes the
  transcript first and treats `ack since` the same as before. Cab already
  does this with `ThreadCache` (JSON on disk, not Room); Helm does
  the same in `Sources/Mailbox/ThreadCache.swift`. First `ack`
  `since` is the highest cached seq.

---

## Photos (what every mouth must do the same)

Source of truth: `lib/mailbox/caps.ts`, `lib/phone/photo.ts`,
`app/lib/jpegFromFile.ts`, `lib/phone/sendError.ts`. Cab mirrors in
`mailbox/Photo.kt`, `mailbox/Jpeg.kt`, `mailbox/JpegIo.kt`,
`mailbox/SendError.kt`. Helm mirrors in `Sources/Mailbox/Photo.swift`,
`Jpeg.swift`, `SendError.swift`.

**Wire.** One `images: [{ url }]` per frame, `url` a
`data:image/jpeg;base64,…`. Caption and photo travel **together**: the
PWA encodes on attach, holds the data URL on the draft, and Send emits
one `inbound` with `text` and `images[0]`. Attaching never sends by
itself (no empty-text turn ahead of the caption). Cab has its own
compose; if it stages the same way the mailbox needs nothing new. The mailbox measures the **data URL**
(`utf8Bytes(url) ≤ IMAGE_BYTES_MAX` = 1 500 000) and the whole frame
(`≤ FRAME_BYTES_MAX` = 2 000 000). Base64 is 4/3 of the bytes, so the
**raw JPEG budget is `PHOTO_JPEG_BYTES_MAX`** = `floor((1 500 000 − 32) / 4) × 3`
= 1 124 976. Encoding to 1.5 MB raw passes a client check and fails on
the wire as `too large`.

**Rate.** Byte bucket is `RATE_BYTES_BURST` = 2 × `FRAME_BYTES_MAX`
deep (two full photos back to back), refilling `RATE_BYTES_PER_MIN`
= 256 KB/min; frames 30/min. Before this the burst was 256 KB and every
camera shot bounced as `rate` forever — that was the "photo never
lands" bug on both mouths.

**Encode ladder** (`jpegFromFile`): draw at the chosen long edge, try
quality 0.9 → 0.8 → 0.7 → 0.6; if still over budget, edge × 0.75 and
repeat; floor 320 px, then give up with `too large`. Pass-through only
for a JPEG already ≤ edge and ≤ budget. Cab runs the same ladder:
`shrinkSteps` / `shrinkToFit` in `mailbox/Photo.kt` (pure, tested
against the same 1600 → 1200 / floor-380 cases as
`test/app/lib/jpegFromFile.test.ts`), driven by `jpegFromUri` in
`mailbox/JpegIo.kt` with `PHOTO_JPEG_BYTES_MAX` as the budget. Helm
runs the same `shrinkSteps` / `shrinkToFit` in `Photo.swift`. Start at
`min(edge, image)` — never upscale.

**Photo size** (Settings, per device, not on the wire). Long edge:

| Id | Edge | Why |
| --- | --- | --- |
| `full` | 1600 | old cap; models clamp near 1 MP so this mostly buys bytes |
| `medium` | 1024 | **default**; reads receipts and signs |
| `small` | 640 | "is this a plant" |

Vision tokens track pixel area (~w·h/750), not JPEG bytes — that is why
this is an edge knob and not a quality knob. PWA stores it at
`localStorage["pendant.photo"]`; Cab stores the same id at
`SharedPreferences("cab")["photo"]` (`CabPrefs.photoSize`) and reads
the table from `PHOTO_SIZES` in `mailbox/Photo.kt`; Helm stores it at
UserDefaults `helm` / `photo` (`photoSizes` in `Photo.swift`) — same
ids, same edges, same `Medium · 1024 px` chip text, so the mouths
agree on what "Medium" means. Change the table here, change it there.

**Errors.** The mailbox answers a refused frame with
`{ kind: "error", text, id }` where `text` is a token — `rate`,
`too large`, `bad frame` — and `id` (additive) is the refused frame's
id when the frame parsed. Paint it on **your own bubble** as "not
sent", never as a turn from the crane, and do not move the `since`
cursor from it. PWA strings: `lib/phone/sendError.ts`. Pre-wire
failures (`bad photo` = decoder, `too large` = ladder bottomed out)
are local; say so in the mouth.

Cab does the same: `Mouth.fail(id, why)` is `failInThread` (match your
bubble by `id`, else your newest still `pending`; crane bubbles are
never marked), `ChatLine.failed` paints red under the bubble, strings
are copied in `mailbox/SendError.kt` (`describeSendError`,
`describePhotoError`). `movesCursor(kind)` in `mailbox/Thread.kt`
(and Helm `Thread.swift`) keeps `ack` and `error` off the `since`
cursor — before that an `error` with `id` would have made a native
mouth resume from the refused id on a fresh session. A refusal with
no matching bubble (a bare pin) falls back to the old hint line.
Keep the token strings stable; every mouth switches on them.

The Worker echoes `id` on every refusal that has one: parse errors after
JSON.parse (`too large` image, extra image, bad kind), then `rate` and
the post-parse `bad frame` checks. Junk that never parses (oversize
whole frame, not JSON) still has no id — mouths fall back to newest
pending.

---

## Face, backdrop, and theme (what every mouth must do the same)

Source of truth: `lib/avatar/{jpeg,http,store}.ts`,
`lib/backdrop/{http,store}.ts`, `lib/theme/{catalog,store}.ts`,
`lib/auth/slugRoute.ts`, `worker/mailbox.ts` (`blobHttp`, `themeHttp`).
Who calls the blobs and why: [agent_ui_controls.md](agent_ui_controls.md).

Two JPEG **blobs on the room**, one per crane slug. They are not chat
turns: `images[]` on a frame is a photo *in the thread*; these are what
the thread looks like. Every human in the room sees the same face and
the same wallpaper.

**HTTP.**

| | Face | Backdrop |
| --- | --- | --- |
| Route | `GET` / `POST /api/avatar?slug=<slug>` | `GET` / `POST` / `DELETE /api/backdrop?slug=<slug>` |
| Body (POST) | raw `image/jpeg`, or multipart `file` | same |
| Cap | `AVATAR_MAX_BYTES` 5 MiB (dropping to 1.5 MB — DO rows are 2 MB) | `BACKDROP_MAX_BYTES` = 1 500 000 |
| Gate | JPEG magic (`FF D8 FF`), ≥ 32 bytes | same |
| GET | `image/jpeg`, `X-Pendant-Rev: <rev>`, `ETag: "<rev>"`, `Cache-Control: private, max-age=0, must-revalidate`; **404** when none | same; 404 after `DELETE` |
| Conditional GET | `If-None-Match: "<rev>"` → empty **304** with the same `X-Pendant-Rev` / `ETag` when the rev is current (additive; a client that never sends it always gets 200 + bytes) | same |
| Cache bust | `?v=<rev>` | `?v=<rev>` |
| 400 body | `{ "error": "image too large (max 5MB)" \| "need a JPEG …" \| "file required" }` | `{ "error": "image too large (max 1.5MB)" \| … }` |

Auth is one door for both (`withSlug`): a **listed** phone (PWA cookie
or Cab `Authorization` JWE), or the **crane bearer** on
`Authorization: Bearer …` — header only, `?bearer=` is refused for the
crane. Spike `?secret=` is loopback. Denies are the shared
`{ "error": "unauthorized" }` 401 / 403, `{ "error": "config" }` 503,
`{ "error": "bad slug" }` 400. The bearer is bound to one slug, so the
crane can only repaint its own room.

**Notices.** When a blob changes the Durable Object sends one frame to
**every** socket in the room (crane included — it ignores frames with
no `user_id`):

```text
{ "kind": "face",     "text": "<rev>" }     // legacy shape, keep it
{ "kind": "backdrop", "rev": <int> }        // rev 0 = cleared; NO text
{ "kind": "theme",    "theme": "<id>" | null }  // null = cleared; NO text
```

| Rule | Why |
| --- | --- |
| None of these are a `FrameKind`. A phone that sends one gets `error` `bad frame` | They originate on the DO, not the wire |
| Not queued, no `id` / `seq` / `at`, not in the transcript | A reconnect must not replay "face changed" |
| Do not move the `since` cursor; do not toast / HUN / haptic / badge | Not a turn |
| `backdrop` and `theme` have **no `text`** | A mouth that predates them must drop them. Cab `Mouth.ingest` paints any frame with text as a bubble — a rev or theme id in the thread on every old APK. The face notice predates this rule; do not "fix" it |
| `rev` is a safe integer ≥ 0; junk → ignore the frame | Same bar as `orderSeq` |
| `theme` is a known catalog id, or JSON `null` to clear; junk → ignore | Catalog: boom, inlay, lamp, noir, ember, tide, bloom, paper, chalk, foam, petal, ink |

**Paint.** On `face` → refetch `GET /api/avatar?slug&v=<rev>` and swap
the header circle (PWA `KitAvatar`, Cab `ui/KitAvatar.kt`). On
`backdrop` → refetch `GET /api/backdrop?slug&v=<rev>`; 404 or `rev: 0`
paints **nothing** — the theme canvas is the fallback. Fetch on connect
too (no `v`) so a fresh session gets the current one without a notice.

**Keep the last one.** A fresh load should not open on the fallback
icon and a bare canvas while the JPEGs download. The PWA keeps the last
bytes plus their rev per slug in IndexedDB (`app/lib/blobUrl.ts`,
`look:avatar:<slug>` / `look:backdrop:<slug>`), paints that first, and
fetches with `If-None-Match: "<rev>"` — 304 keeps the paint, 200 swaps
and re-stores, 404 drops the row, a failed fetch leaves the cached
  paint. No rev, secret, or bearer in the key. Cab `BlobCache` keeps
  `{ rev, bytes }` per slug on disk and `AvatarApi` sends
  `If-None-Match: "<rev>"` — 304 keeps the paint, 200 swaps, 404 drops
  the row.
Wallpaper goes **behind the thread only**, cover-fit, dimmed so bubbles
stay legible (PWA: 60 % opacity over `--canvas`; Cab: `Modifier.alpha(0.6f)`
behind `ChatScroll`; header and compose stay panel). It is a per-device
choice to show it: PWA `localStorage["pendant.backdrop"]`, Cab
`SharedPreferences("cab")["backdrop"]` (`on` default / `off`). Off means
**no fetch**, not a hidden image. **Not** on Android Auto.

On `theme` → if the human is following Kit, paint that catalog id
(PWA `paintTheme`, Cab `paintedTheme`). `theme: null` falls back to the
human's pick. Follow is a per-device pref: PWA
`localStorage["pendant.followTheme"]`, Cab
`SharedPreferences("cab")["followTheme"]` (on default / only `"off"`
keeps yours). A human tapping a theme chip turns follow off and claims
that id. Fetch `GET /api/theme?slug=` on connect so a fresh session
sees Kit's mood without waiting for a notice. HTTP 5xx leaves the last
known room id; `{ "theme": null }` is a real clear.

**Cab.** `faceRev` / `backdropRev` / `roomTheme` on `Mouth` — ingest
returns `false`, `shouldSpeak` stays false, `movesCursor` excludes
`face` / `backdrop` / `theme`. `Look.kt` `THEME_IDS` matches
`lib/theme/catalog.ts` (hexes in `CabPalette.kt`). `ThemeApi` GETs the
room; `AvatarApi.fetch(..., path="/api/backdrop")` GETs the wallpaper.

### Header face

Kit picks the picture; the header circle is the room's face, not a tiny
chrome icon. A 40 px chip is easy to miss when the JPEG changes — the
swap is the event. Same layout on every handheld mouth. Auto HUNs do
not care.

| | Value |
| --- | --- |
| Size | 82 px / 82.dp (PWA `KitAvatar` `xl`) |
| Header row | Do **not** grow the bar. Layout slot is 40 px tall × 80 px wide so the name shifts right of the circle |
| Hang | Align the circle to the **top** of that slot, then nudge **-2 px x / -4 px y** so it sits in the header padding. Overlaps the thread (~24 px). z-order above bubbles |
| Stroke | 2 px in theme `line` (PWA `border-line`; Cab `CabPalette.line` / `outlineVariant`). Not `panel`, not a shadow ring |
| Empty / Google door | Stay the centered hero (PWA 64 px, Cab 72.dp). Those do not hang |

PWA: `PhoneShell` header. Cab already hangs the same way: 82.dp
`KitAvatar`, 40×80 `navigationIcon` slot (empty — the circle is not
inside the bar), nudge **-2.dp x / -4.dp y**, 2.dp `line` stroke. The
avatar is a Scaffold overlay (`zIndex` above the bar) so `TopAppBar`
clip never eats it. `DocsShot.kt` `paintHeader` uses the same 82 /
80×40 / −2/−4 numbers. Helm hangs the same numbers in `Look.swift`
(`headerFaceSize` / slot / nudge / stroke) as a header overlay, not
inside the bar.

---

## Theme (what every mouth must do the same)

Source of truth: `lib/theme/{catalog,store,contrast}.ts`,
`app/lib/theme.ts`, `app/api/theme/route.ts`, `worker/mailbox.ts`
(`themeHttp`). Why, and how the agent picks without seeing the screen:
[agent_ui_controls.md](agent_ui_controls.md).

One **id per room**, from a closed catalog. Not raw hex. Every human
who follows Kit sees the same mood. The human can unfollow and keep
their own pick (`pendant.followTheme`, default on) — same shape as
Backdrop.

**HTTP.**

| | Theme |
| --- | --- |
| Route | `GET` / `POST` / `DELETE /api/theme?slug=<slug>` |
| Auth | same door as the face (`withSlug`) |
| GET | `{ "theme": "<id>" \| null, "themes": [ { id, label, mood, canvas, accent } ] }` |
| POST | `{ "theme": "<id>" }` → `{ "ok": true, "theme": "<id>" }` |
| DELETE | clears the room pick; GET `theme` is `null` |
| 400 body | `{ "error": "bad theme" }` |

`canvas` and `accent` are the two signature hexes (shop floor + tool
color). `mood` is one English line. That is how a model that cannot
see the screen chooses. Do not put hex in the id. Do not accept
arbitrary colors.

**Notice.** When the room theme changes the Durable Object sends one
frame to every socket, and **flushes it on phone connect** (after
`cmds`, like the command catalog):

```text
{ "kind": "theme", "theme": "noir" }     // set
{ "kind": "theme", "theme": null }       // cleared; NO text
```

| Rule | Why |
| --- | --- |
| Not a `FrameKind`. A phone that sends one gets `error` `bad frame` | Originates on the DO |
| Not queued, no `id` / `seq` / `at`, not in the transcript | Reconnect must not replay "mood changed" as a turn |
| Do not move `since`; do not toast / HUN / haptic / badge | Not a turn |
| No `text` | Old Cab `Mouth.ingest` would paint the id as a bubble |
| Unknown `theme` string → ignore | Same bar as `parseTheme` junk |

**Paint.** On a known id, if follow is on, apply that palette (PWA
`paintTheme` — does **not** overwrite the human's `pendant.theme`).
Cache the id at `localStorage["pendant.roomTheme"]` so `THEME_BOOT`
can apply it before the socket is up. On `theme: null`, drop the
cache and fall back to `pendant.theme`. A human pick in Settings
writes `pendant.theme` and sets follow **off**. `?theme=` for shots
does the same.

Catalog today: `boom` `inlay` `lamp` `noir` `ember` `tide` `bloom`
`paper` `chalk` `foam` `petal` `ink`. Boom / Inlay / Lamp hexes stay
shared with gantree. New ids are additive; a mouth that does not know
`paper` ignores the notice and keeps its current palette.

**Cab.** `Look.kt` `THEME_IDS` matches the catalog (hexes in
`CabPalette.kt`). `Mouth.roomTheme` plus `paintedTheme(follow, room, mine)`
paints when follow is on. `ThemeApi` GETs `/api/theme?slug=` on connect
(5xx leaves the last id; JSON `null` clears). Human chip pick writes
`theme` and sets `followTheme` off.
`SharedPreferences("cab")["followTheme"]` mirrors `pendant.followTheme`.
`shouldSpeak` stays false. Auto HUNs do not care.

**Helm.** `Look.swift` `themeIds` and `Palette.swift` hexes match
the same catalog. `Mouth.roomTheme` plus `paintedTheme` paint when
follow is on. `ThemeApi` GETs `/api/theme?slug=` on connect. Human
chip pick writes `theme` and sets `followTheme` off. UserDefaults
`helm` / `followTheme` mirrors `pendant.followTheme`. `shouldSpeak`
stays false. CarPlay HUNs do not care.

---

## Helm

Same room, Swift client (`repos/gantry-helm`). Surfaces on the
wire: `ios` (pocket) and `carplay` (spoken Reply / Test car voice).
Those names are additive on this Worker — old Cab APKs still send
`android` / `android_auto`. Sign in with Apple is a mailbox auth
change ([security.md](security.md)); APNs is lock-screen, same
later as Cab FCM. Do not grow a second Durable Object. Handoff lives
in Helm `docs/pendant_handoff.md`.
