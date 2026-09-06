import { env } from "cloudflare:workers";
import { unauthorized, tooMany } from "@/lib/auth/deny";
import { decodeOAuthBind, exchangeCode, verifyIdToken } from "@/lib/auth/google";
import { limitAuthIp, limitAuthSub } from "@/lib/auth/limit";
import { clearCookie, mintSession, parseCookie, sessionCookie, STATE_COOKIE } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!limitAuthIp(req)) {
    return tooMany();
  }
  const url = new URL(req.url);
  const code = url.searchParams.get("code") ?? "";
  const state = url.searchParams.get("state") ?? "";
  const bind = decodeOAuthBind(parseCookie(req.headers.get("Cookie"), STATE_COOKIE));
  if (!code || !state || !bind || state !== bind.state) {
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
    codeVerifier: bind.verifier,
  });
  if ("error" in exchanged) {
    return unauthorized();
  }
  const identity = await verifyIdToken(exchanged.idToken, clientId, bind.nonce);
  if (!identity) {
    return unauthorized();
  }
  if (!limitAuthSub(identity.sub)) {
    return tooMany();
  }
  const token = await mintSession(sessionSecret, {
    sub: identity.sub,
    email: identity.email,
    emailVerified: identity.emailVerified,
  });
  const secure = url.origin.startsWith("https:");
  const headers = new Headers({ Location: "/" });
  headers.append("Set-Cookie", sessionCookie(token, secure));
  headers.append("Set-Cookie", clearCookie(STATE_COOKIE, secure));
  return new Response(null, { status: 302, headers });
}
