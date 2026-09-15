import { clipForSpeech, speakable } from "@/lib/phone/speakable";

export const TTS_PATH = "/api/tts";

/** One speaker per tab. A second reply replaces the first instead of talking over it. */
let speaker: HTMLAudioElement | null = null;
let playingUrl = "";

function speakerAudio(): HTMLAudioElement {
  speaker ??= new Audio();
  return speaker;
}

function dropUrl(): void {
  if (playingUrl) {
    URL.revokeObjectURL(playingUrl);
    playingUrl = "";
  }
}

/** Hold pressed while Kit is mid-sentence: quiet the speaker so the mic does not hear Kit. */
export function hushSpeaker(): void {
  if (!speaker) {
    return;
  }
  speaker.pause();
  speaker.removeAttribute("src");
  dropUrl();
}

export type SpeakDeps = {
  fetch?: typeof fetch;
  audio?: HTMLAudioElement;
};

/**
 * Reply markdown → words → `/api/tts` → play. Resolves false when there was
 * nothing to say, the Worker declined (404 until the key is set, 401, 502), or
 * the browser refused to play. The reply is already on screen either way.
 */
export async function browserSpeak(markdown: string, deps: SpeakDeps = {}): Promise<boolean> {
  const text = clipForSpeech(speakable(markdown));
  if (!text) {
    return false;
  }
  const fetchFn = deps.fetch ?? fetch;
  let res: Response;
  try {
    res = await fetchFn(TTS_PATH, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text }),
    });
  } catch {
    return false;
  }
  if (!res.ok) {
    return false;
  }
  let blob: Blob;
  try {
    blob = await res.blob();
  } catch {
    return false;
  }
  const audio = deps.audio ?? speakerAudio();
  audio.pause();
  dropUrl();
  const url = URL.createObjectURL(blob);
  playingUrl = url;
  audio.src = url;
  const done = () => {
    if (playingUrl === url) {
      dropUrl();
    }
  };
  audio.addEventListener("ended", done, { once: true });
  audio.addEventListener("error", done, { once: true });
  try {
    await audio.play();
  } catch {
    done();
    return false;
  }
  return true;
}
