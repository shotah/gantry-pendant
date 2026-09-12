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
4. **Handheld dictation fills compose.** It does not auto-send.
   Driving Auto is the exception (hands-free; the host already
   commits the utterance).
5. **Speak finished turns only.** `reply` / `push`, live, not
   `replay`, not sibling `inbound`, not `typing` / draft / CoT.

Photos are the sibling pattern: the mouth encodes HEIC → JPEG under
budget and the wire carries the JPEG. Here the mouth encodes
speech → text and the wire carries `inbound.text`.

---

## The pick

```text
you speak
  → OS / browser STT          (Google speech, Siri, Auto host)
  → compose text (handheld)   or inbound immediately (Auto)
  → same inbound frame as typing
  → crane Handle              (text Completer, as today)
  → reply / push text
  → OS / Auto TTS             (mouth plays it; mailbox never had audio)
```

Three layers people mix up:

| Layer | What it is | Ours? |
| --- | --- | --- |
| **Mouth I/O** | Mic → text, text → speaker | Yes. Per client. |
| **Mailbox** | Frames, queue, hydrate | Unchanged. Text + photos. |
| **Completer** | Persona + LLM + tools | Unchanged. Never an audio model. |

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
| Cloud TTS WaveNet / Standard | Our GCP | 4M chars/mo free, then **$4 / 1M chars**. Neural2 $16, Chirp 3 HD $30 / 1M |
| Gemini audio **input** on a Completer turn (Flash-class) | Completer bill | ~**$1 / 1M audio tokens** ≈ **$0.0015 / min** (25 tok/s). Live Flash audio-in is published at **$0.005 / min**, audio-out **$0.018 / min** |
| Gemini Live two-way | Completer bill | ~**$0.023 / min** audio traffic before tools / Search / context replay |

Cloud STT / Cloud TTS are a **new** bill. OS speech is not. Do not
add Cloud Speech-to-Text to transcribe a PWA mic when the browser
already did it.

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
  `surface: android_auto`. No `SpeechRecognizer` on the dash.
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
| **Cab Auto** | Host STT → inbound, auto-send | Auto reads the card | **Done** | Keep. Do not wrap the PWA. |
| **Cab handheld** | `SpeechRecognizer` → compose | Optional `TextToSpeech`, off by default | Medium | Same Google stack as Auto. Reliable APIs. |
| **PWA Chrome Android** | `SpeechRecognition` → compose | `speechSynthesis` later / skip | Medium | First PWA target. Interim / `continuous` are flaky — tap-to-talk, not always-on. Hide the mic when the API is missing. |
| **PWA iOS A2HS** | Web Speech often dies in the standalone WebView | TTS needs a user gesture; background kills it | High | Do not prove voice here. Helm is the iPhone mouth. |
| **Helm CarPlay** | Host STT → inbound, auto-send | CarPlay reads the communication notification | **In Helm** | Same mailbox. `surface: carplay`. No second recognizer. |
| **PWA Firefox / desktop Safari** | STT missing or off | TTS ok-ish | — | Mic hidden. Typing stays. |
| **Google Assistant Action** | Dead product (Conversational Actions ended 2023) | — | Don't | See [Assistant](#google-assistant-is-the-wrong-button). |
| **Worker Whisper / cloud TTS** | POST clip, get text / audio | New media route | High | Fallback if Web Speech is unusable. Not v1. Still not the Completer. |

**Handheld vs car.** On a phone you can read. In a car you cannot.
Spend voice-out budget on Auto (already spent). Spend voice-in
budget on dictation into compose for the pocket, and on keeping
Auto's reply working.

---

## Voice in

### Handheld (PWA + Cab)

A mic on compose. Tap (or hold) → listen → drop words into the
textarea → human edits → Send. Same as the existing todo:
**do not auto-send.** Slash commands, photos sitting on the draft,
and "wait that was the radio" all need a look.

PWA: `window.SpeechRecognition` /
`webkitSpeechRecognition`. Chrome Android is the walk. Require a
user gesture. One-shot (`continuous: false`) is less cursed than
always-on. If `SpeechRecognition` is missing, no mic — not a
banner, not a Worker fallback in this version.

Cab handheld: `android.speech.SpeechRecognizer` (or the
recognizer intent). `RECORD_AUDIO` in the manifest. Fill the same
compose `TextField` Cab already has. Do **not** run this on the
Auto template; the host already did STT.

### Auto

Unchanged. Spoken reply is inbound. `surface: android_auto` is
already how the crane knows this mouth is the dash.

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
| Cab handheld | optional pref, off | same skip list; Auto is the default speaker |
| PWA | skip this version | you are looking at the thread |

PWA `speechSynthesis` is the high-effort, low-value side. Voices
differ by OS, iOS needs a tap before anything will talk, and a
backgrounded PWA will not keep reading a cron ping — that is why
Web Push exists. If we ever add it: a "Read replies" toggle next
to mute, same skip list as `shouldSpeak`.

Do not speak:

- hydrate / `replay` (Cab already gates this)
- your own `inbound` from the other mouth
- `typing`, italic drafts, CoT
- `error` tokens
- markdown as markdown — strip or say "code" / "photo" if a
  handheld TTS walk ever lands

Mute pings ([todo.md](todo.md)) is the local pref that also covers
spoken `push`. Socket still paints.

Cloud TTS (ElevenLabs, Google Cloud, a Kit voice blob on the DO)
is a new media path in the shape of the face JPEG. Cute. Not
needed when the car already has a TTS engine.

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
we do not add `/api/stt`.

---

## Wire

No new `kind`. No audio field. No lockstep APK.

`context.surface` is already `browser` | `android` |
`android_auto`. PERSONA can already say "keep Auto answers short."
Do not add `context.input: spoken` until a prompt actually uses
it — stingy, same as GPS.

If we ever add it, it is additive JSON. Old Cab drops unknown
keys. The crane still only reads `Text`.

---

## Sibling phones

Ada's PWA and Ada's Cab are one human. Live inbound fan-out is
[sibling_phones.md](sibling_phones.md). Voice rules on top:

- The mouth that **dictated** sends `inbound`. The other mouth
  paints it as "you" and does **not** speak it (`shouldSpeak`
  already skips `inbound`).
- Kit's `reply` fans to every socket tagged `sub:<ada>`. If Auto
  is attached, **that** mouth speaks. A handheld TTS pref off
  (default) avoids the phone talking over the dash.
- Two speakers at once is a per-device pref failure, not a
  mailbox bug.

---

## Walk

### gantry-cab (car) — already

- [x] Auto HUN reads live `reply` / `push`
- [x] Spoken Reply → `inbound` + `surface: android_auto`
- [x] `shouldSpeak` skips `replay` / `inbound` / controls
- [ ] Ship the APK that honors `replay` with the hydrating Worker
      ([todo.md](todo.md#gantry-cab))

### gantry-helm (car)

- [x] Surfaces `ios` / `carplay` kept on this Worker
- [ ] Communication notification reads live `reply` / `push`
- [ ] Spoken Reply → `inbound` + `surface: carplay`
- [ ] `shouldSpeak` skips `replay` / `inbound` / controls
      (Helm `docs/pendant_handoff.md`)

### gantry-pendant (this repo) — pocket dictation

- [ ] Mic on compose when `SpeechRecognition` exists
- [ ] One-shot listen, fill the textarea, do not auto-send
- [ ] Hide the mic when the API is missing (iOS A2HS, Firefox)
- [ ] Tests: helper that maps recognition events → compose text;
      no auto-send; disabled while the socket is down

PWA-only paint. Cab does not need a mailbox change.

### gantry-cab (handheld) — parity

- [ ] Mic on compose via `SpeechRecognizer` → same fill, no
      auto-send
- [ ] Do not run that recognizer on the Auto template
- [ ] Handheld "read replies" TTS stays off until someone wants
      it; Auto remains the speaker

### Later, maybe

- Worker `/api/stt` as an iOS-PWA polyfill (audio hits the Worker,
  text comes back, Completer still sees words)
- PWA "Read replies" toggle
- `context.input: spoken` if PERSONA wants it
- Helm handheld dictation into compose (CarPlay already speaks)

### Not this version

Hosted SaaS voice, audio frames, model-native audio, Assistant
Actions, Gemini Live as a mouth, PWA auto-send, speaking drafts /
CoT, cloud "Kit voice" blobs, on-device-only as a promise,
Firefox polyfill, proving the walk on iPhone Add to Home Screen.
