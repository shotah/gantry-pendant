# Screens

What the mouth looks like. Pitch: [root readme](../README.md). Why:
[design.md](design.md). Reshoot: `PENDANT_DEV=1` in `.dev.vars`,
`npm run dev`, then `npm run shot`.

Loopback only. `PENDANT_DEV` is ignored on `workers.dev`. Samples are
canned Ada/Kit turns — not a live crane.

---

## Phone

The product viewport is a pocket (390×844). Theme defaults to Night.
Kit’s face sits in the header (tap to replace it). Empty and unsigned
screens use the same mark. Fallback is the pendant glyph until a JPEG
is saved on the Durable Object.

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
  <img src="../assets/docs/down.png" alt="Socket down, compose disabled" width="220">
  &nbsp;
  <img src="../assets/docs/thread-day.png" alt="Same thread in Day theme" width="220">
  &nbsp;
  <img src="../assets/docs/crane.png" alt="Crane stand-in tab" width="220">
</p>

| Shot | URL | What it is |
| --- | --- | --- |
| `login` | `/login` | Google door. Allowlisted accounts only. |
| `unsigned` | `/?sample=unsigned` | Same gate inside the shell. |
| `empty` | `/?sample=empty` | Live, nothing said yet. GPS attaches on send. Type `/` for harness commands. |
| `cmds` | `/?sample=cmds` | Command picker. Live list is published by the crane (`cmds` frame); this sample paints a short stand-in. |
| `thread` | `/?sample=thread` | Ada ↔ Kit. Pin is this-send. |
| `ping` | `/?sample=ping` | Cron `Push` — labeled **ping**. |
| `photo` | `/?sample=photo` | Inbound image + text. |
| `down` | `/?sample=down` | Other side gone. Compose locked. |
| `thread-day` | `/?sample=thread&theme=day` | Day theme. Night / ember / fog / contrast live in the picker. |
| `crane` | `/crane?sample=crane` | Laptop stand-in for the harness while the channel is missing. |

---

## Dev mouth

`.dev.vars`:

```bash
cp .dev.vars.example .dev.vars
npm run dev                      # http://127.0.0.1:3000 (Chrome Install works on loopback)
```

`PENDANT_DEV=1` on loopback:

- `/api/auth/me` returns mock Ada (`1182…` / `ada@example.com`). No Google.
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
