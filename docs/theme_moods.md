# Theme moods — a palette for every feeling

Kit picks a theme (`pendant__theme_list` → `theme_update`). The
catalog is a **mood dozen** — six feelings × light / dark, tinted
enough that the phone visibly changes — plus three neutrals (`boom`,
`paper`, `ink`). Fifteen ids. The other nine neutrals are retired.

**Open:** Cab `Look.kt` / `CabPalette.kt`, Helm `Look.swift` /
`Palette.swift`, pendant-mcp description refresh (and a local id
list, if `tools/theme.go` has one), `npm run shot` for the new
theme PNGs, gantree raising Boom `dim` / `faint` (this repo exempts
those two pairs until then). Pendant Worker + PWA is done.

Contract of record: [frontends.md → Theme](frontends.md#theme-what-every-mouth-must-do-the-same).
Why the agent gets a card and not a screenshot:
[agent_ui_controls.md](agent_ui_controls.md#how-kit-sees-a-theme-no-screenshot).
Code: `lib/theme/{catalog,store,contrast}.ts`, `app/lib/theme.ts`,
`app/components/shared/ThemeSelect.tsx`.

---

## What exists

| | Pendant today |
| --- | --- |
| Ids | `boom` `paper` `ink`, then `marquee`/`lemonade` `neon`/`fizz` `rain`/`mist` `fuse`/`grit` `siren`/`flare` `static`/`flicker` |
| Card (`GET /api/theme`, `theme_list`) | `{ id, label, feel, scheme, mood, canvas, accent }` — `mood` is `<feel>, <scheme> — <scene>` |
| Tokens per theme | 22 core + `you` + `kit` (`ThemeTokens`). Same keys on every id; `themeCss()` emits `--canvas` … `--kit` per `[data-theme]` |
| Gate | `themeContrastFails` on the painted pairs below. Boom is exempt from `dim` on `kit` and `faint` on `panel` until gantree moves those two hexes |
| Mouths | PWA paints CSS vars and groups Plain / Moods. Cab and Helm still have the retired ids until their boxes below land. Unknown id → keep the current palette, never flash to boom |
| Shared with gantree | Boom hexes — do not drift |

The nine that left (`inlay` `lamp` `noir` `ember` `tide` `bloom`
`chalk` `foam` `petal`) were the same temperature. A stored one
reads as cleared.

---

## Why they read as bland

Three habits, all deliberate for a chat app, all muting expression:

1. **Canvas is near-black or near-white.** Every dark canvas is
   under `#14` on each channel; every light one is under 6 % tint.
   The hue is there but you cannot see it on a phone.
2. **Accent is the only colored thing**, and it is mid-saturation
   (`#f07848`, `#8eb4d4`, `#3cb8b0`). `you` is the track color with
   a hint of accent; `ok` / `info` / `danger` are near-identical
   across themes.
3. **`mark` had to be the accent's readable cousin**, so accent
   never got pushed past what `text-mark` could carry.

The mood dozen keeps the readability (the gate gets *stricter*) and
spends color where the gate does not look: canvas tint, accent
saturation, the `you` bubble, and `info` / `ok` as a second hue.

---

## What happens to the existing twelve

Three options were on the table. **Remove nine, keep three.**

| Option | Verdict | Why |
| --- | --- | --- |
| Keep all twelve, add twelve | No | 24 ids is a long picker and a long card list for the model; nine of the neutrals are the same temperature as each other and say nothing a mood does not say better |
| Retune the twelve to pop | No | Boom / Inlay / Lamp are gantree-shared and cannot move; retuning `noir` into something vivid just makes a second `rain`. The moods already cover the hue wheel |
| Remove all twelve, default to a mood | No | The room needs a **neutral** to fall back to when Kit clears his mood or the human unfollows. "Cleared" has to look different from "happy" |
| **Remove nine, keep `boom` / `paper` / `ink`** | **Yes** | One neutral dark (the default, gantree-shared, the brand), one neutral light, one high-contrast. Everything else is a feeling |

Retired: `inlay` `lamp` `noir` `ember` `tide` `bloom` `chalk` `foam`
`petal`. Fifteen ids after the change.

**Why removal is cheap.** `worker/mailbox.ts` already runs the stored
id through `knownTheme` on `GET` and on the connect flush, so a room
that was `noir` reads as `theme: null` the moment the catalog
changes — no storage migration, no notice. On the phone,
`parseTheme` and `THEME_BOOT` treat an unknown `pendant.theme` /
`pendant.roomTheme` as "no pick" and fall to `boom`. Cab and Helm
that have not shipped yet keep painting a human-picked `noir` from
their own palette table until they update; a room notice can never
carry a retired id because the Worker refuses it.

**Gantree.** It shares Boom / Inlay / Lamp *hexes* with this catalog.
Keeping only `boom` here does not ask gantree to drop anything; the
rule was never "all three must exist on the phone", only "do not
drift the ones you have". `boom` stays byte-identical.

**Shots.** `thread-day` is currently `?theme=lamp`. It becomes a
mood shot; `thread-paper` stays as the neutral light.

---

## Design rules for the dozen

| Rule | Why |
| --- | --- |
| **Six feelings, two schemes, twelve ids.** happy · excited · sad · frustrated · angry · anxious, each `dark` + `light` | Enough range to express; small enough to list on a card and in a picker |
| **Pair names, not suffixes.** `marquee` / `lemonade`, not `happy-dark` / `happy-light` | Ids are the wire contract and stay short nouns like the first twelve. The feeling goes on the card, not in the id |
| **Canvas is tinted**, not neutral: dark canvases sit at ~`#10–#1a` with a clear hue; light canvases carry 10–20 % tint | A tinted floor is what the eye reads as "the phone changed" |
| **Accent is vivid** (saturation ≥ 80 %). `mark` stays the AA text version of it | Buttons, borders, the compose ring pop; links and labels stay readable |
| **`you` is a real color**, not `track` + a hint | The human's bubbles are half the thread; a colored `you` is most of the mood |
| **`info` and `ok` are a second hue** chosen per feeling (sunflower + sky for happy, violet + acid for anxious) | Two-hue palettes read as a scene; one-hue palettes read as a tint |
| **`danger` is never the accent hue.** Angry uses scarlet accent and a magenta `danger`; frustrated uses orange accent and a red `danger` | "Failed to send" must still be its own color on every theme |
| **Every pair in the gate passes on every id**, including the stricter pairs below | Pop is not an excuse for unreadable `dim` text on a bubble |
| **Default stays `boom`.** Clearing the room theme falls back to the human's pick, as today; a retired pick falls to `boom` | No surprise paint on an old phone; neutral means neutral |

---

## The card grows two keys (additive)

`GET /api/theme` and `theme_list` return cards. Add:

```text
{
  "id": "marquee",
  "label": "Marquee",
  "feel": "happy",            // new — one of the six, or "neutral" for boom / paper / ink
  "scheme": "dark",           // new — "dark" | "light"; already on ThemeTokens
  "mood": "happy, dark — opening-night marquee: royal indigo, gold bulbs",
  "canvas": "#141a3c",
  "accent": "#ffcc33"
}
```

- `feel` is how the model matches without parsing prose. "I'm anxious
  about this deploy" → filter `feel: anxious`, pick by `scheme`.
- `scheme` lets it honor "it's daytime here" / the human's own
  light/dark habit without a hex lookup.
- `mood` line format becomes **`<feel>, <scheme> — <scene>`** on every
  card (`boom` / `ink` get `neutral, dark — …`, `paper` gets
  `neutral, light — …`). A model on an old
  pendant-mcp that never learns `feel` still reads the word.
- Old clients drop unknown keys (Cab / Helm `ThemeApi` decode `theme`
  and the id list; the PWA reads cards only in tests). pendant-mcp
  returns the GET body as-is, so **no MCP release is required** for
  the keys to reach the model. A release is still worth it for the
  description (below).

Ids stay additive. A Cab or Helm that does not know `siren` ignores
the notice and keeps its palette ([frontends.md](frontends.md#theme-what-every-mouth-must-do-the-same)).
Do not send hex on the wire. Do not put the feeling in the id.

---

## The dozen

Catalog order: `boom` `paper` `ink`, then these, dark before light
within each feeling. `you` is listed because it is the third hex a
mouth needs before the token block.

| Feel | Scheme | Id | Label | Mood line (scene) | `canvas` | `accent` | `you` |
| --- | --- | --- | --- | --- | --- | --- | --- |
| happy | dark | `marquee` | Marquee | opening-night marquee: royal indigo, gold bulbs | `#141a3c` | `#ffcc33` | `#2a2470` |
| happy | light | `lemonade` | Lemonade | lemonade stand at noon: butter yellow, cobalt lettering | `#fff6cc` | `#1f52e0` | `#ffd84d` |
| excited | dark | `neon` | Neon | blacklight arcade: violet black, hot-pink tube | `#120a1e` | `#ff2d95` | `#3a1458` |
| excited | light | `fizz` | Fizz | cream soda: ice cyan, hot-pink straw | `#e6fbff` | `#e0107a` | `#b0eefc` |
| sad | dark | `rain` | Rain | rain on the window: slate indigo, periwinkle streetlight | `#0f131f` | `#8c9fe6` | `#1e2644` |
| sad | light | `mist` | Mist | overcast morning: lavender grey, slate-indigo ink | `#eceef6` | `#4a56a8` | `#c8ccec` |
| frustrated | dark | `fuse` | Fuse | lit fuse: charcoal khaki, safety orange | `#17150f` | `#ff7a00` | `#332a16` |
| frustrated | light | `grit` | Grit | sandpaper: khaki white, burnt orange | `#f3efe4` | `#d2500a` | `#ead29a` |
| angry | dark | `siren` | Siren | siren at night: black red, scarlet | `#160608` | `#ff2e3f` | `#3a0e18` |
| angry | light | `flare` | Flare | road flare at noon: blush white, crimson | `#fff0ee` | `#d4102c` | `#ffc2bc` |
| anxious | dark | `static` | Static | CRT static: green black, electric violet | `#0d1410` | `#b388ff` | `#26203c` |
| anxious | light | `flicker` | Flicker | fluorescent flicker: pale mint, deep violet | `#eef7f0` | `#6a2fd0` | `#d8d0f8` |

Hue map, so nobody adds a thirteenth that collides: gold / cobalt
(happy), hot pink (excited), periwinkle / slate indigo (sad), safety
orange / burnt orange (frustrated), scarlet / crimson (angry), violet
on green (anxious). Of the three kept neutrals, `boom` (rust) and
`ink` (amber) sit nearest a mood hue, and both have neutral
canvases, so the card pair still differs.

### Token blocks

Every key `ThemeTokens` has, in the order `catalog.ts` uses, so Cab
`CabPalette.kt` and Helm `Palette.swift` can copy a block each.
`kit` equals `track` on every id (as today).

```text
marquee  (happy, dark)                 lemonade  (happy, light)
canvas      #141a3c                    canvas      #fff6cc
panel       #1c2450                    panel       #fff0b0
track       #283064                    track       #f7e690
line        #46508c                    line        #a89440
edge        #7a84b8                    edge        #6e6020
fg          #fff8e6                    fg          #1a1606
body        #e6e0d0                    body        #2e2810
muted       #b0b4d8                    muted       #5a5020
dim         #9aa0c8                    dim         #665c28
faint       #6c74a4                    faint       #78703a
accent      #ffcc33                    accent      #1f52e0
accentHover #ffd966                    accentHover #1842b8
mark        #ffe599                    mark        #10308c
accentLine  #c99a10                    accentLine  #1842b8
accentSoft  #332a12                    accentSoft  #dde6ff
danger      #ff6b9d                    danger      #c0184c
dangerLine  #b83a66                    dangerLine  #8e1038
dangerSoft  #3a1828                    dangerSoft  #ffdce6
ok          #3ad0a0                    ok          #167a4a
info        #58c4ff                    info        #1f52e0
you         #2a2470                    you         #ffd84d
kit         #283064                    kit         #f7e690
```

```text
neon  (excited, dark)                  fizz  (excited, light)
canvas      #120a1e                    canvas      #e6fbff
panel       #1b1030                    panel       #d2f4fb
track       #281848                    track       #bceaf4
line        #4a2e7a                    line        #4e8a98
edge        #7e58b8                    edge        #2e5c68
fg          #fdf2ff                    fg          #081a20
body        #e6d8f2                    body        #142a32
muted       #b89ad8                    muted       #2e5260
dim         #a088c4                    dim         #3a5e6c
faint       #7e62a8                    faint       #4e7482
accent      #ff2d95                    accent      #e0107a
accentHover #ff5cad                    accentHover #c00c66
mark        #ffa6d2                    mark        #8e0848
accentLine  #c0106a                    accentLine  #c00c66
accentSoft  #3a1030                    accentSoft  #ffd6ea
danger      #ff5a5a                    danger      #c4123a
dangerLine  #b02a2a                    dangerLine  #8e0c2a
dangerSoft  #3a1414                    dangerSoft  #ffdada
ok          #2ef2b0                    ok          #0e7a5a
info        #38e0ff                    info        #0e5c9c
you         #3a1458                    you         #b0eefc
kit         #281848                    kit         #bceaf4
```

```text
rain  (sad, dark)                      mist  (sad, light)
canvas      #0f131f                    canvas      #eceef6
panel       #161c2c                    panel       #e0e3ee
track       #20283c                    track       #d0d4e4
line        #364260                    line        #7e86a4
edge        #5c6a90                    edge        #505870
fg          #e8ecf8                    fg          #14161e
body        #c8d0e4                    body        #22262e
muted       #8e9ac0                    muted       #464c62
dim         #8894ba                    dim         #4c526a
faint       #5e6c8c                    faint       #646c84
accent      #8c9fe6                    accent      #4a56a8
accentHover #a4b4f0                    accentHover #3c4690
mark        #c8d4ff                    mark        #2a3270
accentLine  #4e60a8                    accentLine  #3c4690
accentSoft  #1a2040                    accentSoft  #d8dcf6
danger      #d06a90                    danger      #b02858
dangerLine  #90365a                    dangerLine  #86183e
dangerSoft  #281420                    dangerSoft  #f4dae4
ok          #5cb09a                    ok          #1e7462
info        #78a0d8                    info        #3c5c98
you         #1e2644                    you         #c8ccec
kit         #20283c                    kit         #d0d4e4
```

```text
fuse  (frustrated, dark)               grit  (frustrated, light)
canvas      #17150f                    canvas      #f3efe4
panel       #201d14                    panel       #e9e3d2
track       #2c281c                    track       #dcd4bc
line        #4e4830                    line        #8a8060
edge        #7c7450                    edge        #5a5238
fg          #fbf4e6                    fg          #1a1810
body        #e2d8c4                    body        #2c2818
muted       #aea48a                    muted       #504a30
dim         #a0967e                    dim         #5a543a
faint       #746c50                    faint       #6c664a
accent      #ff7a00                    accent      #d2500a
accentHover #ff9633                    accentHover #b44208
mark        #ffbf80                    mark        #8a3004
accentLine  #c45a00                    accentLine  #b44208
accentSoft  #33200a                    accentSoft  #ffdcc4
danger      #ff5a6e                    danger      #b4203a
dangerLine  #b02a3c                    dangerLine  #881428
dangerSoft  #341418                    dangerSoft  #f8d8da
ok          #86c46a                    ok          #4a7a1e
info        #e0b830                    info        #806400
you         #332a16                    you         #ead29a
kit         #2c281c                    kit         #dcd4bc
```

```text
siren  (angry, dark)                   flare  (angry, light)
canvas      #160608                    canvas      #fff0ee
panel       #200a0e                    panel       #fde0dc
track       #2e1016                    track       #f6ccc6
line        #58202a                    line        #a06860
edge        #8e3a48                    edge        #6a4038
fg          #fff2f2                    fg          #1e0a0a
body        #ecd4d6                    body        #301616
muted       #c09aa0                    muted       #5a3030
dim         #ae8a90                    dim         #663a3a
faint       #7e5660                    faint       #7a4c4c
accent      #ff2e3f                    accent      #d4102c
accentHover #ff5c6a                    accentHover #b00c22
mark        #ffa0a8                    mark        #880818
accentLine  #c0101e                    accentLine  #b00c22
accentSoft  #3e0c12                    accentSoft  #ffd4d4
danger      #ff6ab8                    danger      #b0147a
dangerLine  #b8307a                    dangerLine  #860c5a
dangerSoft  #3a1028                    dangerSoft  #fcd8ee
ok          #46d08a                    ok          #1a7a4e
info        #ffb020                    info        #9a5a00
you         #3a0e18                    you         #ffc2bc
kit         #2e1016                    kit         #f6ccc6
```

```text
static  (anxious, dark)                flicker  (anxious, light)
canvas      #0d1410                    canvas      #eef7f0
panel       #141c17                    panel       #dff0e4
track       #1e2a22                    track       #cce4d4
line        #37493d                    line        #6a8e78
edge        #5e7866                    edge        #40604c
fg          #f0f8f2                    fg          #0e1a12
body        #d2dcd6                    body        #1a2a20
muted       #9ab0a2                    muted       #365244
dim         #8aa092                    dim         #425e50
faint       #5e7466                    faint       #547062
accent      #b388ff                    accent      #6a2fd0
accentHover #c6a4ff                    accentHover #5824b0
mark        #dcc8ff                    mark        #3e1484
accentLine  #7a4ee0                    accentLine  #5824b0
accentSoft  #221a38                    accentSoft  #e8dcff
danger      #ff6a8a                    danger      #b4204e
dangerLine  #b0304e                    dangerLine  #880e38
dangerSoft  #341420                    dangerSoft  #f8d8e2
ok          #52d490                    ok          #1a7a4a
info        #d8f03c                    info        #4a5ab8
you         #26203c                    you         #d8d0f8
kit         #1e2a22                    kit         #cce4d4
```

---

## Contrast gate

The eight pairs in `THEME_CONTRAST_PAIRS` stay. `app/` also paints
these, and they are not tested today; add them to the gate for every
id, not just light + `ink`:

| Pair | Min | Where it is painted |
| --- | --- | --- |
| `dim` on `kit`, `dim` on `you` | 4.5 | timestamps and meta inside bubbles (`text-dim`) |
| `faint` on `panel` | 3 | placeholder / hint (`text-faint`) |
| `mark` on `panel`, `mark` on `canvas` | 4.5 | links, section labels (`text-mark` outside `bg-accent-soft`) |
| `danger` on `dangerSoft` | 4.5 | send-failed strip (`bg-danger-soft text-danger`) |
| `ok` on `panel`, `danger` on `panel` | 3 | Live / failed status words (`text-ok`, `text-danger`) |
| `canvas` on `ok` | 3 | unread badge (`bg-ok text-canvas`) |
| `accent` on `canvas` | 3 | compose ring, buttons (`border-accent`, `bg-accent`) — non-text UI, so 3 |

All twelve blocks above pass every pair with margin (checked with
`contrastRatio` from `lib/theme/contrast.ts` while drafting; the
lowest is `siren` at 1.02× the minimum, on `faint` on `panel`).

Running the stricter pairs against the **kept** neutrals: `paper`
and `ink` pass. `boom` misses two — `dim` on `kit` 4.40 (min 4.5)
and `faint` on `panel` 2.86 (min 3) — and its hexes are
gantree-shared, so it cannot be retuned here. (The retired nine
fail the same pairs by more; removing them closes that gap for
free.) Boxed under Worker below.

---

## Picker (human side)

Fifteen flat rows is still long for a 390 px drawer, and the three
neutrals should not look like a seventh feeling. Every mouth groups
the same way so Settings looks alike:

```text
Plain      boom  paper  ink
Moods      marquee/lemonade  neon/fizz  rain/mist
           fuse/grit  siren/flare  static/flicker               (dark / light pairs)
```

Group header is `label`-less text in `text-dim`; rows keep the
two-tone dot (canvas | accent). A tap is still a human pick: write
the id, set follow **off**. Kit's current room id gets a small
"Kit" tag so the human sees which one is his.

Not a wire change. Cab (`CabScreen` theme chips) and Helm (`HelmScreen`
chips) do their own grouping with the same two headers.

---

## Knock-out — gantry-pendant (Worker + PWA)

- [x] **Catalog.** `lib/theme/catalog.ts`: delete the nine retired
      `const` blocks and their `THEMES` entries; keep `boom` `paper`
      `ink` in that order; add `feel: ThemeFeel`
      (`"neutral" | "happy" | "excited" | "sad" | "frustrated" | "angry" | "anxious"`)
      to `ThemeDef`; stamp `neutral` on the three; append the twelve
      blocks above in the table order. Rewrite every `mood` to
      `<feel>, <scheme> — <scene>`. `boom` hexes untouched. Update the
      file header comment (it names Inlay / Lamp as shared).
- [x] **Card.** `ThemeCard` + `themeCards()` gain `feel` and `scheme`.
      `encodeThemeState` picks them up for free. Test in
      `test/theme/catalog.test.ts`: 15 ids in order, card shape, every
      feel has exactly one dark and one light id (neutral excepted),
      `knownTheme("noir")` is `null`.
- [x] **Retired ids in tests.** Swap, do not delete the cases:
      `test/worker/mailbox.test.ts` uses `noir` for PUT / GET / flush;
      `test/app/components/chat/PhoneShell.test.tsx` uses `noir`,
      `ember`, `inlay` for follow / unfollow / human-pick;
      `test/app/lib/theme.test.ts` lists the twelve and caches `tide`.
      Use `siren` / `rain` / `paper` or similar. Add one Worker case:
      a stored retired id reads as `theme: null` on GET and is **not**
      flushed on connect (`knownTheme` already does this — pin it).
- [x] **Gate.** `lib/theme/contrast.ts`: add the pairs in the table
      above to `THEME_CONTRAST_PAIRS`. Test: every mood id passes all
      pairs; the stricter pairs run on all twelve new ids.
- [x] **`boom` vs the stricter gate.** Exempted in
      `test/theme/catalog.test.ts` (`BOOM_EXEMPT`): `dim` on `kit`
      is 4.40 (min 4.5) and `faint` on `panel` is 2.86 (min 3).
      Raising the two hexes is gantree's; when it moves, drop the
      exemption and copy.
- [x] **CSS.** Nothing in `app/lib/theme.ts` changes shape;
      `themeCss()` / `THEME_BOOT` / `themeFromQuery` read the list.
      Test in `test/app/lib/theme.test.ts`: 15 ids, `color-scheme` per
      id, `--you` emitted for every mood id, `themeFromQuery("lamp")`
      is `null`.
- [x] **Picker.** `ThemeSelect.tsx`: two groups (Plain / Moods),
      `role="group"` + `aria-label` per header, mood rows in
      dark/light pairs. The room's current id wears a "Kit" tag
      when `followTheme` is on (prop from `PhoneShell`). Test in
      `test/app/components/shared/ThemeSelect.test.tsx`: 15 options,
      2 groups, pick still calls `onHumanPick` and writes
      `pendant.theme`.
- [x] **Shots.** `scripts/shot.mjs` + `docs/screens.md`: `thread-day`
      moves from `lamp` to a mood (`marquee`); add one
      `?sample=thread&theme=` row per remaining mood pair (`neon`,
      `rain`, `fuse`, `siren`, `static` or their light halves) so the
      README shows the range. `thread-paper` stays. Pin `pendant.theme`
      as today so a live notice cannot restyle the PNG. `screens.md`
      "Boom / Inlay / Lamp stay shared with gantree" → "Boom stays
      shared". The PNGs themselves are the Walk item (`npm run shot`).
- [x] **Docs.** `frontends.md` Theme section: catalog line lists the
      15 ids and names the nine retired ones once ("a mouth that still
      has `noir` paints it locally; the Worker never sends it"), card
      shape gains `feel` / `scheme`, picker grouping noted for Cab /
      Helm. `agent_ui_controls.md`: the `GET /api/theme` example and
      `theme_update` description quote the new `mood` format; the two
      "Catalog: Boom, Inlay, Lamp … " lines point here. The header
      comments in `lib/theme/catalog.ts` and `app/lib/theme.ts` name
      Inlay / Lamp as shared — fix both.

## Knock-out — gantry-cab (Android + Auto)

Owner: `repos/gantry-cab`. Wire is unchanged — this is a palette and
a chip list. Until it ships, an **old APK is safe**: unknown ids are
ignored and the current scheme stays; a human pick of a retired id
keeps painting from the APK's own table.

- [ ] `Look.kt` `THEME_IDS`: drop the nine retired ids, append the
      twelve mood ids in catalog order. On first run after update, a
      stored `theme` that is no longer known falls to `boom` (do not
      crash on the lookup). Decode `feel` / `scheme` from the card if
      `ThemeApi` parses cards; otherwise keep dropping unknown keys.
- [ ] `CabPalette.kt`: one `ColorScheme` per block above. `you` is
      the human bubble container; `kit` = `track`; `line` is the
      header-face stroke (see [frontends.md → Header face](frontends.md#header-face)).
      `scheme` picks `darkColorScheme` / `lightColorScheme`.
- [ ] Theme chips in Settings: two groups (Plain / Moods). Tap writes
      `theme`, sets `followTheme` off, as today.
- [ ] **Android Auto:** head-unit palette is still the car's day /
      night, not Kit's mood. A `theme` notice while driving changes
      the in-hand UI only.
- [ ] Contrast: port the pair table (or assert the same hexes as
      `catalog.ts` in a unit test so the two never drift).

## Knock-out — gantry-helm (iOS + CarPlay)

Owner: `repos/gantry-helm`. Same shape as Cab.

- [ ] `Look.swift` `themeIds`: drop the nine retired ids, append the
      twelve in order. A stored retired `theme` falls to `boom`.
- [ ] `Palette.swift`: one palette per block. `scheme` drives
      `.preferredColorScheme(.dark / .light)` so system chrome
      (keyboard, sheets) matches the canvas.
- [ ] Theme chips: two groups, same labels. Tap writes `theme`,
      `followTheme` off.
- [ ] **CarPlay:** HUNs and the communication template take the
      car's palette; mood paints the handset only.
- [ ] Hex parity test against `catalog.ts` (copy the blocks into a
      fixture, assert equality) so a later tweak here is caught there.

## Knock-out — pendant-mcp

Optional for the keys to reach the model (the GET body is returned
as-is). Worth a release for the words the model reads first:

- [ ] **Check for a local id list first.** If `tools/theme.go`
      validates `theme` against its own allowlist (rather than
      surfacing the Worker's `bad theme`), the new ids are refused
      before they reach the mailbox and this release is **required**,
      not optional. Prefer dropping the list: the Worker is the
      catalog of record, and `theme_list` already tells the model what
      is valid.
- [ ] `theme_list` description: "Each card has `feel` (happy,
      excited, sad, frustrated, angry, anxious, or neutral) and
      `scheme` (dark / light), a mood line, and two hexes. Filter by
      how you feel, then by light or dark."
- [ ] `theme_update` description: drop the hard-coded "daylight cards
      are paper, chalk, foam, petal; ink is high-contrast night" list
      (three of those ids no longer exist) in favor of "pick a card
      whose `feel` matches, `scheme: light` by day; `neutral` to go
      plain". Keep "do not invent hex" and "humans can unfollow".
- [ ] README recipe: "`theme_list` → filter `feel` → `theme_update`".

## Knock-out — ai-gantry

Nothing on the wire. `theme` is already in `ignoredKind`. No change
unless a persona doc wants a line on *when* to change mood
(`repos/ai-gantry/docs/persona.md` — e.g. "set a mood at the start of
a long task and clear it when done, not per message").

---

## Walk (done when this is boring)

Real crane, `pendant` in `mcp.toml`, one PWA, one Cab, one Helm in
the room, all following.

- [ ] "I'm so excited about this!" → `theme_list`, `theme_update`
      `neon`. All three phones go hot pink on violet within a
      second. `fizz` by day when the human has said it is morning.
- [ ] "Honestly I'm frustrated with this bug." → `fuse` or `grit`.
      The send-failed strip is still red, not orange, on both.
- [ ] "That was scary." → `static`. Timestamps inside bubbles are
      readable (the `dim` on `you` pair).
- [ ] "Okay, back to normal." → `theme_delete`; every phone falls
      back to its human's pick, no flash of boom on a phone that had
      picked `paper`.
- [ ] Settings on each mouth shows two groups, 15 rows, a "Kit"
      tag on the room id. Picking `siren` turns follow off and sticks.
- [ ] Old Cab APK in the room during the `neon` notice: nothing
      painted, no bubble, palette unchanged.
- [ ] A room that was `noir` before the deploy: `GET /api/theme` says
      `theme: null`; no notice on connect; every phone shows its own
      pick. A PWA whose pick was `lamp` boots on `boom` with no
      console error.
- [ ] `theme_update({ theme: "noir" })` → `bad theme`.
- [ ] `theme_update({ theme: "happy" })` → `bad theme` (feelings are
      card keys, not ids).
- [ ] `npm run shot` regenerates `thread-neon` / `thread-fizz` /
      `thread-siren` and they look like the table says.

---

## Edge cases

- **A mood that does not match the human's day.** Kit is `siren`
  at 2 am on a phone in a dark bedroom — that is the point, and the
  human can unfollow. Do not auto-pick `scheme` from the phone clock
  on the Worker; the card tells the model which scheme is which and
  the persona decides.
- **Two moods in one room.** One room, one id, as today. Kit changing
  mood mid-conversation repaints every follower; the persona doc
  should discourage per-message flips (ai-gantry box above).
- **The mood dozen on gantree.** Not shared. Gantree keeps Boom /
  Inlay / Lamp for its own console; nothing here asks it to learn
  `siren` or to drop Inlay / Lamp because the phone did.
- **A retired id on a phone that has not updated.** Cab / Helm with
  a human pick of `tide` keep painting their local `tide` until they
  ship; that is a stale palette, not a bug. The PWA ships with the
  Worker, so it never sees one. Do not add a "theme retired" notice.
- **`danger` vs angry.** `siren` and `flare` pick a magenta `danger`
  so a failed send is still distinct from the scarlet accent. Keep
  that if anyone retunes the reds.
- **Hue collisions later.** The hue map above is the reservation
  list. A thirteenth mood (calm? proud?) picks a hue not on it
  (teal-mint / sage are free) or it is not a thirteenth.

---

## Not this version

- Feelings in the **id** (`happy-dark`) or hex on the wire.
- The Worker **inferring** mood from message text. The crane says
  how it feels; the mailbox stores an id.
- Per-message or per-bubble mood tint. Room state, not a turn.
- Animated transitions between palettes. A paint is a paint.
- Changing `boom` hexes here. That is gantree's.
- Keeping retired ids as hidden aliases (`noir` → `rain`). An unknown
  id is `null`; mapping old moods onto new feelings would paint a
  feeling nobody chose.
- A font or backdrop change bundled with a mood. Those stay separate
  tools; the persona can call them together.
