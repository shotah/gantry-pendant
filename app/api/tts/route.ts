import { env } from "cloudflare:workers";
import { badFrame, tooLarge, tooMany, unauthorized } from "@/lib/auth/deny";
import { limitAuthRequest } from "@/lib/auth/limit";
import { readSessionFromRequest } from "@/lib/auth/session";
import { headerSaysTooLarge } from "@/lib/mailbox/caps";
import { parseTtsBody, readTts, synthesize, TTS_JSON_MAX, voiceOffered } from "@/lib/tts/http";

export const dynamic = "force-dynamic";

/** Signed-in human posts `{ text }`, gets MP3 bytes. 404 until voice is offered and the key is set. */
export async function POST(req: Request) {
  if (!voiceOffered(env)) {
    return new Response(null, { status: 404 });
  }
  const cfg = readTts(env);
  if (!cfg) {
    return new Response(null, { status: 404 });
  }
  const secret = env.SESSION_SECRET?.trim();
  if (!secret) {
    return unauthorized();
  }
  const session = await readSessionFromRequest(secret, {
    cookieHeader: req.headers.get("Cookie"),
    authorization: req.headers.get("Authorization"),
  });
  if (!session) {
    return unauthorized();
  }
  if (!limitAuthRequest(req, session.sub)) {
    return tooMany();
  }
  if (headerSaysTooLarge(req.headers.get("content-length"), TTS_JSON_MAX)) {
    return tooLarge();
  }
  let buf: ArrayBuffer;
  try {
    buf = await req.arrayBuffer();
  } catch {
    return badFrame();
  }
  if (buf.byteLength > TTS_JSON_MAX) {
    return tooLarge();
  }
  let raw: unknown;
  try {
    raw = JSON.parse(new TextDecoder().decode(buf)) as unknown;
  } catch {
    return badFrame();
  }
  const parsed = parseTtsBody(raw);
  if (!parsed.ok) {
    return parsed.error === "too large" ? tooLarge() : badFrame();
  }
  return synthesize(cfg, parsed.text, fetch);
}
