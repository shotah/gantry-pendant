# Screens

What the mouth looks like. Pitch: [root readme](../README.md). Why:
[design.md](design.md). Reshoot: `PENDANT_DEV=1` in `.dev.vars`,
`npm run dev`, then `npm run shot`.

Loopback only. `PENDANT_DEV` is ignored on `workers.dev`. Samples are
canned Ada/Kit turns — not a live crane.

---

## Phone

The product viewport is a pocket (390×844). Theme defaults to Boom
(twelve ids; Paper is the light workshop). Chat type defaults to Small;
Extra large is a shot. Kit’s face is an 82 px circle that hangs off the
header (tap to replace it). Compose has emoji on the left, attach under
it — photo sits on the draft until Send. Empty and unsigned screens use
the same mark. Fallback is the pendant glyph until a JPEG is saved on
the Durable Object.

<p align="center">
  <img src="../assets/docs/login.png" alt="Sign in with Google" width="220">
  &nbsp;
  <img src="../assets/docs/unsigned.png" alt="In-app Google gate before the thread" width="220">
  &nbsp;
  <img src="../assets/docs/empty.png" alt="Empty thread, compose ready" width="220">
</p>

<p align="center">
  <img src="../assets/docs/thread.png" alt="Ada talking to Kit with a this-send pin" width="220">
  &nbsp;
  <img src="../assets/docs/ping.png" alt="Cron ping in the thread" width="220">
  &nbsp;
  <img src="../assets/docs/photo.png" alt="Hatch photo on an inbound turn" width="220">
</p>

<p align="center">
  <img src="../assets/docs/stream.png" alt="Kit typing with a live draft bubble" width="220">
  &nbsp;
  <img src="../assets/docs/emoji.png" alt="Emoji picker over the thread" width="220">
  &nbsp;
  <img src="../assets/docs/thread-xl.png" alt="Same thread at extra-large type" width="220">
</p>

<p align="center">
  <img src="../assets/docs/down.png" alt="Socket down, compose disabled" width="220">
  &nbsp;
  <img src="../assets/docs/thread-day.png" alt="Same thread in Lamp theme" width="220">
  &nbsp;
  <img src="../assets/docs/thread-paper.png" alt="Same thread in Paper theme" width="220">
</p>

<p align="center">
  <img src="../assets/docs/cmds.png" alt="Harness command picker" width="220">
  &nbsp;
  <img src="../assets/docs/attach.png" alt="Attach tray — photo, commands, GPS" width="220">
  &nbsp;
  <img src="../assets/docs/settings.png" alt="Settings — theme, font, photo size, backdrop" width="220">
</p>

<p align="center">
  <img src="../assets/docs/crane.png" alt="Crane stand-in tab" width="220">
</p>

| Shot | URL | What it is |
| --- | --- | --- |
| `login` | `/login` | Google door. The crane decides who may talk. |
| `unsigned` | `/?sample=unsigned` | Same gate inside the shell. |
| `empty` | `/?sample=empty` | Live, nothing said yet. Emoji + paperclip. |
| `cmds` | `/?sample=cmds` | Command picker. Live list is published by the crane (`cmds` frame); this sample paints a short stand-in. |
| `attach` | `/?sample=empty` then paperclip | Camera, photo, commands, GPS, silent pin. |
| `thread` | `/?sample=thread` | Ada ↔ Kit. Pin is this-send. |
| `stream` | `/?sample=stream` | Crane typing + italic draft bubble (⏳). |
| `emoji` | `/?sample=emoji` | Same thread with the emoji tray open. |
| `ping` | `/?sample=ping` | Cron `Push` — labeled **ping**. |
| `photo` | `/?sample=photo` | Inbound image + text. |
| `down` | `/?sample=down` | Other side gone. Compose locked. |
| `thread-day` | `/?sample=thread&theme=lamp` | Lamp theme. |
| `thread-paper` | `/?sample=thread&theme=paper` | Paper (light). Boom / Inlay / Lamp stay shared with gantree. |
| `thread-xl` | `/?sample=thread&font=xl` | Extra-large chat type. Small is the default. |
| `settings` | `/?sample=empty` | Cog — theme, follow Kit’s mood, font, photo size, backdrop, Install. |
| `crane` | `/crane?sample=crane` | Loopback stand-in for the harness (`PENDANT_DEV`). |

---

## Dev mouth

`.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
npm run dev                      # http://127.0.0.1:3000 (Chrome Install works on loopback)
```

`PENDANT_DEV=1` on loopback:

- `/api/auth/me` returns mock Ada (`1182…` / `ada@example.com`, `cranes: ["ada"]`). No Google.
- `/?sample=<id>` paints a scene (no WebSocket).
- Without a sample, compose is live and Kit answers with canned lines.
- Type the spike **secret** to join the real Durable Object (two-tab
  `/` + `/crane`) the way [README](../README.md) already describes.

```bash
npm run shot                     # all scenes → assets/docs/
npm run shot -- thread ping      # a subset
```

Chrome is headless CDP (same trick as gantree). Override the binary
with `CHROME=`. Never set `PENDANT_DEV` as a Worker secret on
`workers.dev`.
