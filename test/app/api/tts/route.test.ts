import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/tts/route";
import { resetAuthLimits } from "@/lib/auth/limit";
import { mintSession, SESSION_COOKIE } from "@/lib/auth/session";
import { SPEAK_BYTES_MAX } from "@/lib/phone/speakable";
import { TTS_ENDPOINT, TTS_JSON_MAX } from "@/lib/tts/http";

const mockEnv = vi.hoisted<{ SESSION_SECRET?: string; GOOGLE_TTS_API_KEY?: string; TTS_VOICE?: string; VOICE?: string }>(() => ({}));

vi.mock("cloudflare:workers", () => ({ env: mockEnv }));

const googleFetch = vi.fn<typeof fetch>();

function googleOk(): Response {
  return Response.json({ audioContent: btoa("\xff\xfb\x90\x00") });
}

async function cookie(): Promise<string> {
  const jwe = await mintSession("sess", { sub: "1182", email: "ada@x.com", emailVerified: true });
  return `${SESSION_COOKIE}=${jwe}`;
}

function ttsReq(body: string, headers: Record<string, string> = {}): Request {
  return new Request("https://pendant.example/api/tts", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  });
}

beforeEach(() => {
  mockEnv.SESSION_SECRET = "sess";
  mockEnv.GOOGLE_TTS_API_KEY = "gcp-key";
  mockEnv.TTS_VOICE = undefined;
  mockEnv.VOICE = undefined;
  googleFetch.mockReset();
  googleFetch.mockImplementation(async () => googleOk());
  vi.stubGlobal("fetch", googleFetch);
});

afterEach(() => {
  resetAuthLimits();
  vi.unstubAllGlobals();
});

describe("tts route", () => {
  it("is 404 until the key is set and never calls Google", async () => {
    mockEnv.GOOGLE_TTS_API_KEY = undefined;
    const res = await POST(ttsReq(JSON.stringify({ text: "hi" }), { Cookie: await cookie() }));
    expect(res.status).toBe(404);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("is 404 when VOICE=off even with a key, so an origin can decline to publish", async () => {
    mockEnv.VOICE = "off";
    const res = await POST(ttsReq(JSON.stringify({ text: "hi" }), { Cookie: await cookie() }));
    expect(res.status).toBe(404);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("wants a signed-in human", async () => {
    expect((await POST(ttsReq(JSON.stringify({ text: "hi" })))).status).toBe(401);
    expect((await POST(ttsReq(JSON.stringify({ text: "hi" }), { Cookie: `${SESSION_COOKIE}=junk` }))).status).toBe(401);
    mockEnv.SESSION_SECRET = undefined;
    expect((await POST(ttsReq(JSON.stringify({ text: "hi" }), { Cookie: await cookie() }))).status).toBe(401);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("also takes the native Bearer session Cab and Helm carry", async () => {
    const jwe = await mintSession("sess", { sub: "1182" });
    const res = await POST(ttsReq(JSON.stringify({ text: "hi" }), { Authorization: `Bearer ${jwe}` }));
    expect(res.status).toBe(200);
  });

  it("proxies the text to Chirp and returns MP3 bytes, key in the header only", async () => {
    const res = await POST(ttsReq(JSON.stringify({ text: "Rain after eight." }), { Cookie: await cookie() }));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toBe("audio/mpeg");
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect((await res.arrayBuffer()).byteLength).toBe(4);
    expect(googleFetch).toHaveBeenCalledOnce();
    const sent = googleFetch.mock.calls[0]?.[0] as Request;
    expect(sent.url).toBe(TTS_ENDPOINT);
    expect(sent.headers.get("X-Goog-Api-Key")).toBe("gcp-key");
    expect(await sent.json()).toMatchObject({
      input: { text: "Rain after eight." },
      voice: { languageCode: "en-US", name: "en-US-Chirp3-HD-Leda" },
    });
  });

  it("honors the TTS_VOICE var", async () => {
    mockEnv.TTS_VOICE = "en-GB-Chirp3-HD-Puck";
    await POST(ttsReq(JSON.stringify({ text: "hi" }), { Cookie: await cookie() }));
    const sent = googleFetch.mock.calls[0]?.[0] as Request;
    expect(await sent.json()).toMatchObject({ voice: { languageCode: "en-GB", name: "en-GB-Chirp3-HD-Puck" } });
  });

  it("speaks the phone's Settings → Language with the same speaker in that locale", async () => {
    const c = await cookie();
    const res = await POST(ttsReq(JSON.stringify({ text: "今夜は雨です。", lang: "ja" }), { Cookie: c }));
    expect(res.status).toBe(200);
    let sent = googleFetch.mock.calls[0]?.[0] as Request;
    expect(await sent.json()).toMatchObject({
      input: { text: "今夜は雨です。" },
      voice: { languageCode: "ja-JP", name: "ja-JP-Chirp3-HD-Leda" },
    });
    await POST(ttsReq(JSON.stringify({ text: "今晚有雨。", lang: "zh" }), { Cookie: c }));
    sent = googleFetch.mock.calls[1]?.[0] as Request;
    expect(await sent.json()).toMatchObject({ voice: { languageCode: "cmn-CN", name: "cmn-CN-Chirp3-HD-Leda" } });
  });

  it("keeps a TTS_VOICE that already speaks the asked-for language, and ignores junk lang", async () => {
    mockEnv.TTS_VOICE = "en-GB-Chirp3-HD-Puck";
    const c = await cookie();
    await POST(ttsReq(JSON.stringify({ text: "hi", lang: "en" }), { Cookie: c }));
    let sent = googleFetch.mock.calls[0]?.[0] as Request;
    expect(await sent.json()).toMatchObject({ voice: { languageCode: "en-GB", name: "en-GB-Chirp3-HD-Puck" } });
    await POST(ttsReq(JSON.stringify({ text: "hi", lang: "ja-JP" }), { Cookie: c }));
    sent = googleFetch.mock.calls[1]?.[0] as Request;
    expect(await sent.json()).toMatchObject({ voice: { languageCode: "en-GB", name: "en-GB-Chirp3-HD-Puck" } });
  });

  it("refuses junk, blanks, and oversize before spending a Google call", async () => {
    const c = await cookie();
    expect((await POST(ttsReq("not json", { Cookie: c }))).status).toBe(400);
    expect((await POST(ttsReq(JSON.stringify({ text: "  " }), { Cookie: c }))).status).toBe(400);
    expect((await POST(ttsReq(JSON.stringify({ nope: 1 }), { Cookie: c }))).status).toBe(400);
    expect((await POST(ttsReq(JSON.stringify({ text: "a".repeat(SPEAK_BYTES_MAX + 1) }), { Cookie: c }))).status).toBe(413);
    expect((await POST(ttsReq("x", { Cookie: c, "content-length": String(TTS_JSON_MAX + 1) }))).status).toBe(413);
    expect((await POST(ttsReq(JSON.stringify({ text: "a".repeat(TTS_JSON_MAX) }), { Cookie: c }))).status).toBe(413);
    expect(googleFetch).not.toHaveBeenCalled();
  });

  it("passes a vendor failure through as a quiet 502", async () => {
    googleFetch.mockImplementation(async () => new Response("quota", { status: 429 }));
    const res = await POST(ttsReq(JSON.stringify({ text: "hi" }), { Cookie: await cookie() }));
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "tts" });
  });
});
