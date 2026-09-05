import { env } from "cloudflare:workers";
import { allowlistMap } from "@/lib/auth/allowlist";
import { unauthorized } from "@/lib/auth/deny";
import { acceptHuman, exchangeCode, verifyIdToken } from "@/lib/auth/google";
import { clearCookie, mintSession, parseCookie, sessionCookie, STATE_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const want = parseCookie(req.headers.get("Cookie"), STATE_COOKIE) ?? "";
  if (!code || !state || !want || state !== want) {
    return unauthorized();
  }
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const clientSecret = env.GOOGLE_CLIENT_SECRET?.trim() ?? "";
  const sessionSecret = env.SESSION_SECRET?.trim() ?? "";
  if (!clientId || !clientSecret || !sessionSecret) {
    return unauthorized();
  }
  const exchanged = await exchangeCode({
    code,
    clientId,
    clientSecret,
    origin: url.origin,
  });
  if ("error" in exchanged) {
    return unauthorized();
  }
  const identity = await verifyIdToken(exchanged.idToken, clientId);
  const human = acceptHuman(identity, allowlistMap(env.ALLOWED_SUBS));
  if (!human) {
    return unauthorized();
  }
  const token = await mintSession(sessionSecret, human);
  const secure = url.origin.startsWith("https:");
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", sessionCookie(token, secure));
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE, secure));
  return new Response(null, { status: 302, headers });
}
