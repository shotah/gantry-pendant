import { describe, expect, it, vi } from "vitest";
import { finalTranscript, listen, recognitionCtor, type Recognizer, type RecognizerResult } from "@/lib/phone/speech";

function result(transcript: string, isFinal = true): RecognizerResult {
  return { isFinal, length: 1, 0: { transcript } };
}

class FakeRecognizer implements Recognizer {
  static instances: FakeRecognizer[] = [];
  lang = "";
  continuous = true;
  interimResults = true;
  maxAlternatives = 3;
  onresult: Recognizer["onresult"] = null;
  onerror: Recognizer["onerror"] = null;
  onend: Recognizer["onend"] = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn(() => {
    this.onerror?.({ error: "aborted" });
    this.onend?.();
  });

  constructor() {
    FakeRecognizer.instances.push(this);
  }

  hear(...parts: RecognizerResult[]) {
    this.onresult?.({ results: parts });
  }
}

describe("recognitionCtor", () => {
  it("prefers the standard name, falls back to webkit, and is null when neither exists", () => {
    const std = class {} as never;
    const webkit = class {} as never;
    expect(recognitionCtor({ SpeechRecognition: std, webkitSpeechRecognition: webkit })).toBe(std);
    expect(recognitionCtor({ webkitSpeechRecognition: webkit })).toBe(webkit);
    expect(recognitionCtor({})).toBeNull();
    expect(recognitionCtor(undefined)).toBeNull();
    expect(recognitionCtor(null)).toBeNull();
  });
});

describe("finalTranscript", () => {
  it("joins final alternatives and skips interim ones", () => {
    expect(finalTranscript([result("turn left", true), result("maybe", false), result(" at the light ", true)]))
      .toBe("turn left at the light");
    expect(finalTranscript([result("guess", false)])).toBe("");
    expect(finalTranscript([])).toBe("");
  });
});

describe("listen", () => {
  it("configures a one-shot recognizer and hands back the words once on end", () => {
    FakeRecognizer.instances = [];
    const onDone = vi.fn();
    const handle = listen(FakeRecognizer, { lang: "en-US", onDone });
    const rec = FakeRecognizer.instances[0]!;
    expect(rec.start).toHaveBeenCalledOnce();
    expect(rec.lang).toBe("en-US");
    expect(rec.continuous).toBe(false);
    expect(rec.interimResults).toBe(false);
    expect(rec.maxAlternatives).toBe(1);
    rec.hear(result("where is"));
    rec.hear(result("the nearest gas"));
    handle.stop();
    expect(rec.stop).toHaveBeenCalledOnce();
    expect(onDone).toHaveBeenCalledExactlyOnceWith("where is the nearest gas");
    rec.onend?.();
    expect(onDone).toHaveBeenCalledOnce();
  });

  it("leaves the browser default lang when none is passed", () => {
    FakeRecognizer.instances = [];
    listen(FakeRecognizer, { onDone: vi.fn() });
    expect(FakeRecognizer.instances[0]!.lang).toBe("");
  });

  it("abort drops what was heard and reports the error code", () => {
    FakeRecognizer.instances = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    const handle = listen(FakeRecognizer, { onDone, onError });
    const rec = FakeRecognizer.instances[0]!;
    rec.hear(result("that was the radio"));
    handle.abort();
    expect(rec.abort).toHaveBeenCalledOnce();
    expect(onError).toHaveBeenCalledWith("aborted");
    expect(onDone).toHaveBeenCalledExactlyOnceWith("");
  });

  it("ends with empty words when nothing was heard", () => {
    FakeRecognizer.instances = [];
    const onDone = vi.fn();
    const onError = vi.fn();
    listen(FakeRecognizer, { onDone, onError });
    const rec = FakeRecognizer.instances[0]!;
    rec.onerror?.({ error: "no-speech" });
    rec.onend?.();
    expect(onError).toHaveBeenCalledWith("no-speech");
    expect(onDone).toHaveBeenCalledExactlyOnceWith("");
  });
});
