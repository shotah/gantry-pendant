/**
 * Web Speech in, one utterance at a time. Chrome Android is the walk; the
 * recognizer sends audio to Google's speech stack and hands back words. The
 * mailbox and the crane only ever see the words (docs/voice.md).
 *
 * `lib.dom` types the result events but not the recognizer object, so the
 * shape we touch is spelled out here and a test can hand in a fake.
 */

export type RecognizerResult = { isFinal: boolean } & ArrayLike<{ transcript: string }>;

export type Recognizer = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((ev: { results: ArrayLike<RecognizerResult> }) => void) | null;
  onerror: ((ev: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
};

export type RecognizerCtor = new () => Recognizer;

type SpeechWindow = {
  SpeechRecognition?: RecognizerCtor;
  webkitSpeechRecognition?: RecognizerCtor;
};

/** Standard name first, Chrome's prefix second, nothing on Firefox / iOS A2HS. */
export function recognitionCtor(win: unknown): RecognizerCtor | null {
  if (!win || typeof win !== "object") {
    return null;
  }
  const w = win as SpeechWindow;
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

/** Final alternatives only, in order; interim guesses are not words yet. */
export function finalTranscript(results: ArrayLike<RecognizerResult>): string {
  const parts: string[] = [];
  for (let i = 0; i < results.length; i += 1) {
    const r = results[i];
    const best = r?.isFinal ? r[0]?.transcript?.trim() : "";
    if (best) {
      parts.push(best);
    }
  }
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

export type ListenHandle = {
  /** Release: let the recognizer finish the utterance, then `onDone` fires with the words. */
  stop(): void;
  /** Slide-off cancel: drop what was heard; `onDone` fires with "". */
  abort(): void;
};

export type ListenOpts = {
  lang?: string;
  /** Once per utterance, after the recognizer ends. Empty when nothing was heard or the hold was cancelled. */
  onDone: (text: string) => void;
  /** Web Speech error code (`not-allowed`, `no-speech`, `network`, `aborted`, …). */
  onError?: (code: string) => void;
};

/** One-shot listen. `continuous` and interim results are the flaky half of the API; skip them. */
export function listen(Ctor: RecognizerCtor, opts: ListenOpts): ListenHandle {
  const rec = new Ctor();
  if (opts.lang) {
    rec.lang = opts.lang;
  }
  rec.continuous = false;
  rec.interimResults = false;
  rec.maxAlternatives = 1;
  let heard = "";
  let ended = false;
  rec.onresult = (ev) => {
    const t = finalTranscript(ev.results);
    if (t) {
      heard = heard ? `${heard} ${t}` : t;
    }
  };
  rec.onerror = (ev) => {
    opts.onError?.(ev.error);
  };
  rec.onend = () => {
    if (ended) {
      return;
    }
    ended = true;
    opts.onDone(heard);
  };
  rec.start();
  return {
    stop: () => rec.stop(),
    abort: () => {
      heard = "";
      rec.abort();
    },
  };
}
