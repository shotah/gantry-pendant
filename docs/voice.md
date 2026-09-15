# Voice (in and out)

Dictate a turn. Hear Kit in the car. The Completer still sees
**text**. Audio is a mouth skin, not a mailbox kind.

Pitch: [README.md](../README.md). Room:
[architecture.md](architecture.md). Mouths:
[frontends.md](frontends.md). Cab Auto walk:
`repos/gantry-cab/docs/android_auto_setup.md`. Backlog:
[todo.md](todo.md).

This page is the discussion and the pick. A line is done when the
**walk** works. Scope is which checkout you touch.

---

## Fit gates

Same as [design.md](design.md#principles), plus:

1. **The model never hears audio.** `Message.Text` stays words. No
   `images[]` for sound. No `kind: audio`. Completer, tools, and
   session history stay the text loop they already are.
2. **The Durable Object never stores a clip.** Photo data-URLs already
   press the 2 MB row and the 2 MB frame cap. Voice would lose that
   fight, and sibling hydrate would replay blobs. Transcribe on the
   mouth; send the product.
3. **Cab Auto already talks.** `MessagingStyle` + `RemoteInput` is
   the car mouth. Do not rebuild it as Web Speech, and do not wait
   on a Google Assistant Action.
4. **Release is the commit.** Hold-to-talk auto-sends: you held the
   button, you spoke, you let go. Slide off the button before you
   let go to throw it away. The words paint as your own bubble so
   you see what Kit heard. Dictation *into* compose (tap a mic,
   edit, press Send) is a different control and not this version.
5. **Speak finished turns only.** `reply`, live, not `replay`, not
   sibling `inbound`, not `typing` / draft / CoT. On the handheld,
   only the reply to **this device's** spoken turn; a cron `push`
   does not start talking out of your pocket.
6. **The pocket voice is neural, the car voice is the host's.**
   Android Auto reads the card with the phone's engine and that is
   fine at 60 mph. In your hand, next to ChatGPT Voice, the OS
   engine sounds like a computer. Kit's handheld voice is Google
   Chirp 3 HD through the Worker, on the same GCP bill as the
   OAuth client.

Photos are the sibling pattern: the mouth encodes HEIC → JPEG under
budget and the wire carries the JPEG. Here the mouth encodes
speech → text and the wire carries `inbound.text`.

---

## The pick

```text
hold the button, speak, release
  → OS / browser STT          (Chrome Web Speech, Auto host, Siri)
  → inbound {text, context.input: "spoken"}   same frame as typing
  → crane Handle              [input] spoken → prose, no markdown
  → draft / typing paint      (not spoken)
  → reply text lands
  → handheld: speakable() → Worker /api/tts → Chirp 3 HD → play
    car:      Auto / CarPlay host reads the card
```

Three layers people mix up:

| Layer | What it is | Ours? |
| --- | --- | --- |
| **Mouth I/O** | Mic → text, text → speaker | Yes. Per client. Handheld TTS is a Worker proxy with the key. |
| **Mailbox** | Frames, queue, hydrate | Unchanged. Text + photos. One additive key. |
| **Completer** | Persona + LLM + tools | Unchanged. Never an audio model. Reads `[input] spoken`. |

The voice will sound like ChatGPT because it is a neural synth. The
**turn-taking** will not. ChatGPT Voice and Gemini Live are realtime
audio models with barge-in; Kit is a text+tools agent behind
`channel.Handle`. After release: STT final ~0.5–1 s → Completer (same
as typing) → TTS first byte ~0.5–1 s. A good walkie-talkie, not a
phone call. Hold-to-talk is the honest metaphor for exactly that.

Gemini Live / ChatGPT Voice send the waveform because the model
*is* the ear. Kit is a text agent with MCP. Prosody is not a tool
argument. Keep the ear on the phone.

---

## Cost (is audio-to-the-Completer extreme?)

No. For a family crane the dollar delta is coffee, not a second Mini.
The tradeoff is **lock-in, history, and tools** — not the STT line
item. Prices below are list rates as of 2026-09, for orientation.
They move; do not treat this as a quote.

Two different products get mixed under "send audio to the LLM":

| Shape | Clip on a turn | Live / Realtime session |
| --- | --- | --- |
| What | 8–15 s dictation attached like a photo | Bidirectional audio socket, barge-in |
| Bill | Audio tokens for **that clip**, then text Completer as today | Audio in **and** out for the whole call, plus the Completer / tools again |
| Fits Handle? | Maybe, if the Completer accepts audio | No. Second agent loop |

A 10 s clip is ~250 audio tokens at the usual 25 tokens/s. That clip
as **text** after STT is ~30 tokens and stays 30 tokens in session
history. Keep the waveform in history and every later turn re-bills
it (cached cheaper, still not 30 tokens).

### Who pays for Google speech

The APIs we already ride in the car, and the ones a PWA mic would
use, are **not** Cloud Speech-to-Text on our GCP bill.

| API | Who is billed | Rate (list) |
| --- | --- | --- |
| Chrome `SpeechRecognition`, Android `SpeechRecognizer`, Auto host STT / TTS | The device / Google Speech Services. No key in the Worker. Same project as the OAuth client is **not** charged | **$0 to us** |
| Cloud Speech-to-Text V2 (we POST a clip) | Our GCP | **$0.016 / min** (first 500k min/mo). V1 still has 60 min/mo free |
| Cloud TTS **Standard / WaveNet** | Our GCP, same API, cheaper voice name | 4M chars/mo free, then **$4 / 1M chars**. Sounds like the computer we refused. |
| Cloud TTS **Neural2** | Our GCP, same API | 1M chars/mo free, then **$16 / 1M**. Fine, not Chirp. |
| Cloud TTS **Chirp 3 HD** (what we call) | Our GCP. Voice name `en-US-Chirp3-HD-*` on `texttospeech.googleapis.com/v1/text:synthesize` | 1M chars/mo free, then **$30 / 1M** (**$0.00003 / char**) |
| **Gemini-TTS** (Flash) | Different product. Token bill, no free tier. Worker does **not** call this | **$10 / 1M audio tokens** out + $0.50 / 1M text tokens in. ≈ $0.015 / min of audio. Promptable LLM speech, not a named Kit voice |
| Gemini audio **input** on a Completer turn (Flash-class) | Completer bill | ~**$1 / 1M audio tokens** ≈ **$0.0015 / min** (25 tok/s). Live Flash audio-in is published at **$0.005 / min**, audio-out **$0.018 / min** |
| Gemini Live two-way | Completer bill | ~**$0.023 / min** audio traffic before tools / Search / context replay |

Cloud STT is a **new** bill and we do not pay it: the browser already
transcribed. Cloud TTS is the one line we chose to pay, for the
pocket only. The **API** is classic Cloud Text-to-Speech; the
**voice name** is what picks the SKU. Leda is Chirp 3 HD, not
Standard ($4) and not Gemini-TTS ($10 / 1M audio tokens). Reading a
300-character reply is ~$0.01 on Chirp after the free 1M chars/mo;
twenty a day (180k chars/mo) stays inside that free bucket. Auto
and CarPlay keep the host engine at $0.

### Paid transcribe vs native audio vs Live

Same yardstick: **10 min of spoken input per day** (generous for
pocket dictation; a talk-radio Live session would be more). ≈ 3 650
min/year. Completer **text** (PERSONA, tools, reply) is paid on
every path and is not in this table.

| Path | Meter | That year |
| --- | --- | --- |
| OS STT (PWA / Cab / Auto) | $0 | **$0** |
| OpenAI `gpt-transcribe` | $0.0045 / min | ~$16 |
| OpenAI `gpt-4o-mini-transcribe` | $0.003 / min | ~$11 |
| Cloud Speech-to-Text V2 | $0.016 / min | ~$58 |
| Gemini Flash **audio-in clip**, text out | ~$0.0015 / min audio tokens | ~$5 **plus** the usual text Completer |
| Gemini 3.1 Flash Live audio-in | $0.005 / min | ~$18 in; add ~$66 if the model **speaks** 10 min/day too |
| OpenAI `gpt-realtime-2.1` audio-in | $32 / 1M ≈ $0.048 / min | ~$175 in only |
| OpenAI `gpt-live-1` | $0.05 / min **plus** backend model and tools | ~$182 + Handle |
| Realtime-2.1 two-way (in $32 + out $64 / 1M) | ~$0.14 / min | ~$500 |

Claude's API still does not take audio. Local Completers (Qwen /
Ollama) do not either. Native audio **picks the vendor**. The
harness already records `prompt_audio_tokens` when a provider sends
them — that is usage plumbing, not a mouth.

### Pros of sending the clip to the Completer

- Tone, urgency, "that was sarcastic," hesitation. STT strips this.
- Sometimes kinder to names, numbers, and a noisy cabin than a
  generic OS recognizer.
- One model round: no "STT misheard → Completer faithfully answers
  the wrong sentence."
- Live/Realtime: barge-in, overlapping talk, a voice that is the
  product.

### Cons (why we still transcribe)

- **You need the text anyway** on handheld. Compose review, slash
  commands, sibling phones, transcript hydrate, `/new` history are
  all words. An audio Completer still has to become text for the
  next turn or the session becomes a pile of waveforms.
- **Tools are text.** Maps, mail, MCP args, PERSONA, `here.Set` —
  none of them take prosody. Photos go to the model because pixels
  *are* the question. Tone is not a maps argument.
- **Lock-in.** Claude and local models drop out. A later Completer
  swap stays easy if inbound is text.
- **Second loop.** Live/Realtime is not `channel.Handle`. Cab Auto
  already committed STT → `inbound`. You would fork the car.
- **Mailbox.** Clip bytes vs 2 MB frames / DO rows / sibling
  hydrate of blobs. Same fight as raw HEIC.
- **Privacy.** OS STT already goes to Google. A clip on the
  Completer *also* hits OpenAI/Gemini and any crane log that dumps
  the turn. Transcribe-then-text keeps the waveform off the Mini.
- **Latency.** Upload + multimodal Completer is not faster than
  OS STT + text Completer for a 10 s dictate-and-send. Live is
  faster *conversation* and worse *tool* shape.

**Verdict:** skip native audio because Kit is a text+tools agent
and the pocket mic has to fill a textarea, not because the Gemini
clip would bankrupt the house. If a future Completer is audio-only
and we have dropped Claude/local, revisit **clip-on-turn** then —
still transcribe for history. Do not start a Live socket to replace
Handle.

---

## What Cab already ships

Android Auto is not a future idea. It is the spoken product today.

- Kit `reply` / `push` posts a `MessagingStyle` card. Auto reads
  "New message from kit: …" with the phone's TTS engine (Google
  Speech Services).
- **Reply** on that card is Auto's host STT (`RemoteInput`). Cab
  `ReplyService` turns the string into `inbound` tagged
  `surface: android_auto` and `input: spoken`
  (`MailboxService.sendSpoken`; the in-dash thread's Reply takes the
  same path). No `SpeechRecognizer` on the dash.
- `shouldSpeak(kind, replay)` is true only for live `reply` /
  `push`. Hydrate (`replay: true`), `ack`, `inbound`, `typing`,
  `face` / `backdrop` / `theme` stay silent. Ship Cab with the
  Worker that hydrates or an old APK toasts every catch-up frame.
- Settings → **Test car voice** is the driveway proof.

That path is what people hear as "Assistant" in the car. It is
Android Auto's messaging host, not a Google Assistant Action. Cab
docs already say so (`screens.md`: "Voice is Auto's host STT, not
Assistant").

Handheld Cab has **no** mic on compose yet. Same later as this
PWA's todo.

---

## Mouths

Effort is inverted from most Pendant work. Cab paid for the car.
The PWA pays the Web Speech tax.

| Surface | Voice in | Voice out | Effort | Notes |
| --- | --- | --- | --- | --- |
| **Cab Auto** | Host STT → inbound + `input: spoken`, auto-send | Auto reads the card | **Done** | Keep. Do not wrap the PWA. |
| **PWA Chrome Android** | Hold-to-talk, `SpeechRecognition` until release → inbound `input: spoken`, auto-send | Worker `/api/tts` → Chirp 3 HD, reply to your own hold only | **Done** | First pocket target. `stop()` + 2s `onend` watchdog. Hidden without the API or when the Worker has not published voice. |
| **Cab handheld** | `SpeechRecognizer` hold → same frame | Same `/api/tts` with the Bearer session, or Android `TextToSpeech` if we accept the robot | Medium | Parity. Do not run the recognizer on the Auto template. |
| **PWA iOS A2HS** | Web Speech often dies in the standalone WebView | `<audio>.play()` needs a gesture; background kills it | High | Do not prove voice here. Helm is the iPhone mouth. |
| **Helm CarPlay** | Host STT → inbound, auto-send | CarPlay reads the communication notification | **In Helm** | Same mailbox. `surface: carplay`. No second recognizer. |
| **PWA Firefox / desktop Safari** | STT missing or off | — | — | Hold button hidden. Typing stays. |
| **Google Assistant Action** | Dead product (Conversational Actions ended 2023) | — | Don't | See [Assistant](#google-assistant-is-the-wrong-button). |
| **Worker `/api/stt` (Whisper class)** | POST clip, get text | — | High | iOS-PWA polyfill if Helm does not cover those friends. Not v1. Still not the Completer. |

**Handheld vs car.** In a car the host already speaks and you cannot
read, so Auto keeps its engine. In your hand you *can* read, so the
voice has to earn its place by sounding like a person — that is why
the pocket gets Chirp and the car does not need it.

---

## Voice in

### Handheld (PWA + Cab)

**Typing is the default.** A mic in the header, left of the settings
cog (`app/components/chat/VoiceToggle.tsx`), flips the mode. Off:
the compose row you already know — emoji, attach, textarea, Send.
On: the whole row becomes one wide **Hold to talk** bar
(`app/components/chat/HoldToTalk.tsx`, swapped in by `Compose`).
Nothing else moves; the crowded left rail does not get a fourth
button. The choice is remembered (`pendant.voice`, off unless it
says `on`), so a voice person opens into voice and a typist never
sees the bar.

Press → recognizer starts → release → `stop()` → words go out as
`inbound` with `context.input: "spoken"`. Nothing lands in a
textarea. Slide off the bar before release to abort ("that was the
radio"). Pressing while Kit is talking hushes the speaker first so
the mic does not hear Kit. Space bar works the same way on a
desktop Chrome. If Chrome Android never fires `onend` after
`stop()`, a 2s watchdog still commits (the `…` must not hang).
Growing hypotheses (`well`, then `well I can…`) collapse to one
sentence; they are not joined into a stutter.

Tap the mic again to type. Slash commands are typed. Web Speech has
no idea what `/new` is. A photo staged before the flip keeps its chip
above the bar and rides along with the words ("what is this?").

PWA: `window.SpeechRecognition` / `webkitSpeechRecognition`, Chrome
Android is the walk. Hold-to-talk uses `continuous` + interim so
release is the commit; a 2s watchdog covers `stop()` with no
`onend`. Detection runs after mount so the server paint and the
hydrated paint agree. If the constructor is missing (Firefox, iOS
A2HS) **or** the Worker has not published voice
(`/api/auth/config` `voice: false` — no TTS key, or `VOICE=off`),
neither the header mic nor the bar is rendered, and a remembered `on`
still types — not a banner, not a Worker fallback in this version.
`not-allowed` paints "Mic blocked" (title: enable it in Settings).
The cog's **Access** block is the UI: **Enable microphone** (hidden
when the Worker has not published voice) asks `getUserMedia` then
stops the tracks so hold-to-talk is not the first prompt;
**Enable location** is the OS geo prompt, then the same send-on-turns
pref as the attach GPS chip (On/Off); notifications stay on that
row, compact, label left and a small **Enable** / **Test** chip
right. Enable still *asks* (getUserMedia / `requestPermission`) even
when the Permissions API already says denied — Chromium and Gecko
(Zen) lie about that before the origin has been prompted. The blocked
hint is only after a real refusal. `Permissions-Policy` must list
`microphone=(self)` and `notifications=(self)`; an empty `=()` is a
hard deny that never prompts.

Cab handheld: `android.speech.SpeechRecognizer` (or the recognizer
intent), `RECORD_AUDIO` in the manifest, the same hold button, the
same frame with `input: spoken`. Do **not** run this on the Auto
template; the host already did STT.

### Auto

Spoken reply is inbound. `surface: android_auto` is how the crane
knows this mouth is the dash; Cab also tags it `input: spoken` so
the wire says the words came from a mic, same as the pocket. Typed
compose on the handheld (`sendTurn`) stays untagged.

### Do not put audio on the wire

A `data:audio/…` next to `images[]` would:

- blow `FRAME_BYTES_MAX` / DO rows the way a raw HEIC would
- need a Completer that does not exist (channel `Message` has
  `Text` + `Images`)
- bill and store a clip on every sibling hydrate
- duplicate what the OS already did for free

Worker STT (`POST /api/stt` → Cloudflare Workers AI Whisper, or
Deepgram) is a **browser polyfill**, not a crane feature. Audio
would hit *our* Worker and a vendor, then return text to compose.
Use it only if Chrome Android dictation is not good enough and we
refuse to tell iOS PWA users to type. Not the first walk.

---

## Voice out

The mailbox already delivered the words. The mouth decides whether
to vibrate, badge, or speak.

| Mouth | Speak | Skip |
| --- | --- | --- |
| Cab Auto | live `reply` / `push` via the HUN | `replay`, sibling `inbound`, controls |
| PWA | the live `reply` to **your own hold**, via `/api/tts` | everything else: `push`, `replay`, drafts, sibling `inbound`, replies to typed turns |
| Cab handheld | parity with the PWA row, same route with the Bearer session | same |

### The pocket voice

`POST /api/tts {text}` → Google Cloud Text-to-Speech
`text:synthesize`, Chirp 3 HD, MP3 back, `Cache-Control: no-store`.
The Worker holds `GOOGLE_TTS_API_KEY` (restrict it to that API in
the GCP console) and the voice is the `TTS_VOICE` var
(`en-US-Chirp3-HD-Leda` by default; Crystal picked Chirp over the
OpenAI voices). Signed-in session, same rate bucket as `/api/push`,
404 until the key exists so an unconfigured Worker just stays quiet.
Nothing is stored, nothing touches the Durable Object, and the
Worker never logs the text. Where the key actually lives:
[Turn on the pocket voice](#turn-on-the-pocket-voice).

Why Chirp over `speechSynthesis`: the browser engine is what your
friends are calling "the Android Auto voice." Neural TTS is a
commodity at this point; the cost is coffee. Why Google over
OpenAI: one bill, and it won the listening test.

`speechSynthesis` stays out even as a fallback. A silent reply is
better than a reply that suddenly sounds like a 2012 GPS.

Silent is not invisible. While the Worker synthesizes, the header
reads `live · voice…` and the hold bar says **Fetching voice…**;
while the clip plays it is `· speaking`, the bar says **Speaking ·
hold to cut in**, and the header mic pulses. A reply that stays
quiet leaves one line under the header naming why: no key /
`VOICE=off` (404), sign in again (401), too many (429), Google
refused (502 — check the Cloud TTS API and the key restriction),
Worker unreachable, or the browser would not play. Nothing to say
(a markdown-only reply) says nothing. `lib/phone/speaker.ts`,
`app/lib/tts.ts` `onPhase`.

"Would not play" with a good key is almost always policy, not the
user: the clip plays from an object URL, so the CSP needs
`media-src 'self' blob:` (`'self'` never matches `blob:`), and the
page needs one prior gesture for autoplay (the hold is that gesture).
No browser has a speaker permission to grant.

### No asterisk asterisk asterisk

Two layers, because models emit markdown even when told not to:

1. **The prompt.** `context.input: "spoken"` → the crane stamps
   `[input] spoken` next to `[surface]`, and the stamp asks for
   conversational prose, a few sentences, no markdown, lists, code,
   links, or emoji. This is the real fix and it also fixes the
   *content* — nobody wants a bulleted answer read aloud.
2. **The strip.** `speakable()` (`lib/phone/speakable.ts`) runs the
   reply through the same remark the bubble paints with, plus
   `strip-markdown`: bold / italic / headings / links keep their
   words, a fenced block becomes "code", an image becomes "photo",
   tables and raw HTML are dropped, emoji are dropped so the engine
   does not say "red heart". `clipForSpeech()` keeps a long reply
   under Chirp's 5 000-byte input at a sentence boundary.

Do not speak:

- hydrate / `replay` (Cab already gates this; the PWA gate is the
  same `replay !== true`)
- your own `inbound` from the other mouth
- `typing`, italic drafts, CoT
- `error` tokens — a refusal also **disarms** the PWA speaker
- `push` on the handheld — a cron ping is a buzz and a badge, not a
  voice from your pocket
- any reply on the handheld that is not the answer to your own hold

A backgrounded PWA will not keep reading — that is why Web Push
exists. Mute pings ([todo.md](todo.md)) stays the pref for buzzes.

---

## Google Assistant is the wrong button

The tempting split is "PWA does Web Speech (hard), Android just
hooks Assistant (easy)." Auto is the easy spoken mouth. Assistant
**the product** is the trap.

| Idea | Reality |
| --- | --- |
| Conversational Actions / "talk to Kit" on a speaker | Google shut this down in 2023. No replacement for a sideload. |
| App Actions / shortcuts.xml | Can open Cab or fire a static shortcut. Not a chat session. |
| "Hey Google, reply …" | Sometimes already works for any correct `MessagingStyle` + reply action (SMS, WhatsApp, Cab). A freebie of the Auto card, not an SDK. |
| Gemini Live / "talk to my apps" | Not a contract we can design a mailbox around. Sideload will not be first-class. |
| Assistant in the car | That *is* Auto reading the HUN. Cab already did the work. |

Do not grow a second voice product on the Assistant SDK. Keep the
car on `MessagingStyle`. Keep the pocket on an in-app mic.

---

## Privacy (two different bars)

**Bar 1 — Kit does not hear the clip.** That is the architectural
bar. Pass it: STT on the mouth, text on the wire. Same as today
for Auto.

**Bar 2 — nobody off-device hears the clip.** Web Speech on Chrome
and `SpeechRecognizer` *usually* send audio to Google's speech
stack. Auto does too. That is the same company we already use as
the Google `sub` on the door. It is **not** on-device-only.

On-device-only (Android 13+ downloaded models, Whisper WASM, Apple
on-device `SFSpeechRecognizer`) is a later bar. Do not promise
"the waveform never leaves the phone" for v1.

Do not log utterances on the Worker. The Worker never sees them if
we do not add `/api/stt`. It does see **Kit's reply text** pass
through `/api/tts` on the way to Google — the same words that are
already in the Durable Object transcript, never stored again, never
logged, gone when the response is sent.

---

## Wire

No new `kind`. No audio field. No lockstep APK. One additive key.

```json
{ "kind": "inbound", "text": "what's the weather tonight",
  "context": { "input": "spoken" } }
```

`context.input` is a closed set of one: `spoken`. The mailbox
`parseContext` keeps it and drops any other value
(`lib/mailbox/frame.ts`). It rides beside `surface`, which still
says *which device*; `input` says *how the human produced the
turn*. Cab Auto sets it on spoken Reply (`inputOnWire` is the same
closed set on the Kotlin side); the crane keeps that `[input]` line
bare because `[surface] android_auto` already carries the hint.

**Cab and Helm:** they drop unknown keys, so an old APK is fine —
it just sends `surface` without `input`, and the dash still gets
the hint from `[surface]`. Helm sends nothing new yet. If either
adds a handheld hold button later it sends the same key and can
reuse `/api/tts` with the Bearer session it already carries — the
route takes `Authorization: Bearer` as well as the cookie.

**Crane** (`ai-gantry`): `frameContext.Input` beside `Surface`, an
`[input] spoken` stamp next to `[surface]` in `harness.go`. The car
and the pocket share one hint (`spokenHint`) so the two mouths cannot
drift:

```text
[surface] android_auto — driving; read aloud like a person:
conversational prose, a few short sentences, no markdown, lists,
code, links, or emoji
[input] spoken — read aloud like a person: conversational prose,
a few short sentences, no markdown, lists, code, links, or emoji
```

A driving surface that also sends `input: spoken` gets a bare
`[input] spoken` — the dash already said it. `speakable()` still
keeps any stray asterisks out of the speaker.

---

## Sibling phones

Ada's PWA and Ada's Cab are one human. Live inbound fan-out is
[sibling_phones.md](sibling_phones.md). Voice rules on top:

- The mouth that **held the button** sends `inbound`. The other
  mouth paints it as "you" and does **not** speak it (`shouldSpeak`
  already skips `inbound`).
- Kit's `reply` fans to every socket tagged `sub:<ada>`. The PWA
  speaks only if **it** armed the gate with a hold
  (`awaitingVoice` in `PhoneShell`), then disarms. Ada's other
  phone painted the same reply and stayed quiet.
- Auto attached while the pocket held the button: both will speak
  that one reply — the dash because it is a live `reply`, the
  pocket because it asked. Acceptable; you are not in the car and
  the pocket at once.

---

## Turn on the pocket voice

Hold-to-talk **code** is this repo. The **key** is not. Gantree
Settings does not push it (same leftover as VAPID).

`/api/auth/config` carries additive `voice: true|false`. The header
mic only paints when that is true **and** the browser has Web Speech.
Default: `voice` follows `GOOGLE_TTS_API_KEY` — no key, no mic, so a
rebuild that skips Chirp never publishes the control.

| `VOICE` var | Key set | Mic | `/api/tts` |
| --- | --- | --- | --- |
| unset | no | hidden | 404 |
| unset | yes | shown | Chirp |
| `off` | either | hidden | 404 |
| `on` | no | shown | 404 (dictate only) |
| `on` | yes | shown | Chirp |

`VOICE=off` is how an origin with a key still declines to publish
(PWA and the route). Cab and Helm drop the unknown `voice` key until
they grow a hold button.

### 1. GCP (same project as the OAuth client)

1. Enable **Cloud Text-to-Speech API**
   (APIs & Services → Library). That is
   `texttospeech.googleapis.com`. Not Vertex AI, not Gemini-TTS,
   not Cloud Speech-to-Text.
2. APIs & Services → Credentials → **Create credentials → API key**.
   Name it for what it does (`Pendant TTS`), not "Speech to Text".
3. Edit the key → **API restrictions → Restrict key** → in the
   picker tick **Cloud Text-to-Speech API**. It sits one row *below*
   **Cloud Speech-to-Text API** and the names are one swap apart;
   the wrong row is the mistake that already happened once. If you
   want both ticked, fine — the phone never needs Speech-to-Text
   (hold-to-talk is the browser's Web Speech, no key), but it does
   no harm. **Application restrictions** stay **None**: the Worker
   calls Google with no Referer, so a *Websites* restriction blocks
   it.
4. Save, wait a minute or two for the key to propagate.

Wrong API on the key → Google 403 `API_KEY_SERVICE_BLOCKED` → the
Worker 502 → the phone says "Kit's voice failed at Google. Check the
Cloud Text-to-Speech API and the key restriction." That line is
this step.

Do not reuse the OAuth client secret. This is a Cloud TTS API key.
The $10 / 1M line in the pricing page is **Gemini-TTS audio tokens**
— a different product. The $4 / 1M line is Standard/WaveNet on *this*
API (robotic). Chirp 3 HD is the same API, billed by **voice name**,
**$30 / 1M chars** after 1M free/mo. We want that one.

### 2. Loopback (`npm run dev`)

```bash
cp .dev.vars.example .dev.vars
```

Uncomment and paste in `.dev.vars` (gitignored):

```text
GOOGLE_TTS_API_KEY=…
# TTS_VOICE=en-US-Chirp3-HD-Leda
# VOICE=off
```

`TTS_VOICE` is optional; unset is already `en-US-Chirp3-HD-Leda`
(`lib/tts/http.ts`). `VOICE` is optional; unset follows the key.
`VOICE=on` without a key shows the hold bar for dictation (replies
stay on screen). Restart `npm run dev`.

### 3. workers.dev

Not Gantree Settings. From this checkout, after `npx wrangler login`:

```bash
npx wrangler secret put GOOGLE_TTS_API_KEY
```

Paste the same key. Optional voice is a Wrangler **var**, not a
secret (leave unset for Leda):

```bash
npx wrangler vars put TTS_VOICE
# value: en-US-Chirp3-HD-Leda
npx wrangler vars put VOICE
# value: off    # hide the mic even with a key
```

Leftover bulk path: `.env` `GOOGLE_TTS_API_KEY=` then
`npm run secrets:push`. Do not mix that with Gantree after the yard
owns `CRANE_BEARERS`.

### 4. Walk

Chrome Android (or desktop Chrome): sign in, header mic on, hold,
release. You should hear Kit. Typed turns stay quiet.

The crane prompt stamp `[input] spoken` is **ai-gantry**, not this
checkout. Until that crane is rebuilt with it, `speakable()` still
strips asterisks here.

---

## Walk

### gantry-cab (car) — already

- [x] Auto HUN reads live `reply` / `push`
- [x] Spoken Reply → `inbound` + `surface: android_auto`
- [x] Spoken Reply (HUN and in-dash thread) also tagged
      `input: spoken` (`MailboxService.sendSpoken`, `inputOnWire`
      closed set; typed `sendTurn` untagged)
- [x] `shouldSpeak` skips `replay` / `inbound` / controls
- [ ] Ship the APK that honors `replay` with the hydrating Worker
      ([todo.md](todo.md#gantry-cab))

### gantry-helm (car)

- [x] Surfaces `ios` / `carplay` kept on this Worker
- [ ] Communication notification reads live `reply` / `push`
- [ ] Spoken Reply → `inbound` + `surface: carplay`
- [ ] `shouldSpeak` skips `replay` / `inbound` / controls
      (Helm `docs/pendant_handoff.md`)

### gantry-pendant (this repo) — hold to talk

- [x] `context.input: "spoken"` parsed and kept by the mailbox
      (`lib/mailbox/frame.ts`, `lib/phone/context.ts`)
- [x] PWA stamps `surface: browser` on every turn, so the crane's
      `[surface]` line can tell the pocket from the dash
      (`PhoneShell.phoneContext`)
- [x] Header mic left of the cog toggles typing (default) ↔ voice,
      remembered in `pendant.voice`; hidden without `SpeechRecognition`
      (`app/components/chat/VoiceToggle.tsx`, `lib/phone/prefs.ts`)
- [x] Settings → Access: enable microphone (when voice is published),
      enable location, compact notification Enable/Test; query denied
      still asks (`MicEnable`, `GeoEnable`, `NotifyEnable`)
- [x] Voice on swaps the whole compose row for one wide hold-to-talk
      bar; off is the untouched typed row
      (`app/components/chat/HoldToTalk.tsx`, `Compose`)
- [x] Hold-to-talk listen, release commits, slide-off aborts, space
      bar works, `onend` watchdog so `…` cannot hang, growing
      hypotheses collapse to one sentence, disabled with compose
      while the socket is down
      (`lib/phone/speech.ts`)
- [x] Release auto-sends the words as `inbound` + `input: spoken`;
      nothing in the textarea (`PhoneShell.sendText`)
- [x] `speakable()` + `clipForSpeech()`: markdown → words, code →
      "code", image → "photo", emoji dropped
      (`lib/phone/speakable.ts`)
- [x] `POST /api/tts` → Chirp 3 HD → MP3, session-gated, 404 without
      the key, never logs (`lib/tts/http.ts`, `app/api/tts/route.ts`)
- [x] Speaker gate: the next live `reply` after a hold is read
      aloud, then disarm; `error` disarms; `push` / `replay` /
      drafts / typed turns never speak; a new hold hushes the
      speaker (`app/lib/tts.ts`, `PhoneShell`)
- [x] Voice is visible: header `· voice…` / `· speaking`, hold bar
      says the same, mic pulses; a silent reply names why (404 no
      key, 401, 429, 502 Google, offline, autoplay)
      (`lib/phone/speaker.ts`, `browserSpeak` `onPhase`)
- [x] Tests under `test/phone/`, `test/tts/`, `test/app/`
- [ ] Pocket voice: GCP Cloud TTS API key → `.dev.vars` /
      `npx wrangler secret put GOOGLE_TTS_API_KEY`. Optional
      `TTS_VOICE` (default Leda). Optional `VOICE=off` to hide the
      mic even with a key. [Turn on](#turn-on-the-pocket-voice)

### ai-gantry (crane) — one stamp

- [x] `frameContext.Input` beside `Surface` in
      `internal/channel/pendant/inbound.go`; closed set `spoken`
- [x] `channel.Message.Input`, prompt-only, not persisted (same as
      `Surface`)
- [x] `inputStamp` next to `surfaceStamp` in
      `internal/agent/harness.go`; `android_auto` / `carplay` and
      `input: spoken` share one `spokenHint`: like a person, a few
      short sentences, no markdown / lists / code / links / emoji
- [x] Tests mirroring `surfaceStamp` / `frameSurface`, plus the
      `inbound_pwa_spoken.json` → `completer_spoken.txt` payload golden

### gantry-cab (handheld) — parity

- [ ] Hold button on compose via `SpeechRecognizer` → same frame,
      same `input: spoken`, auto-send on release
- [ ] Do not run that recognizer on the Auto template
- [ ] Reply to your own hold via `/api/tts` with the Bearer session
      (or Android `TextToSpeech` if the robot is acceptable there)
- [ ] Auto stays the speaker in the car

### Later, maybe

- Worker `/api/stt` as an iOS-PWA polyfill (audio hits the Worker,
  text comes back, Completer still sees words)
- Sentence-chunked TTS so the first sentence starts while the rest
  synthesizes (streaming `synthesize` is gRPC-only today)
- PWA "Read replies" toggle to widen the speaker gate past your own
  hold
- Helm handheld hold-to-talk (CarPlay already speaks)

### Not this version

Hosted SaaS voice, audio frames, model-native audio, Assistant
Actions, Gemini Live as a mouth, dictation *into* compose, speaking
drafts / CoT, `speechSynthesis` as a fallback, cloud "Kit voice"
blobs on the DO, on-device-only as a promise, Firefox polyfill,
proving the walk on iPhone Add to Home Screen.
