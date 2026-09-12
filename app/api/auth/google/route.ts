import { env } from "cloudflare:workers";
import { authorizeUrl, encodeOAuthBind, newNonce, newPkce, newState } from "@/lib/auth/google";
import { blockedGoogleStartLocation } from "@/lib/auth/mode";
import { parseGoogleNext } from "@/lib/auth/returnTo";
import { hostFromRequest } from "@/lib/dev/mode";
import { stateCookie } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

export function GET(req: Request) {
  const blocked = blockedGoogleStartLocation(env, hostFromRequest(req));
  if (blocked) {
    return new Response(null, { status: 302, headers: { Location: blocked } });
  }
  const clientId = env.GOOGLE_CLIENT_ID?.trim() ?? "";
  const url = new URL(req.url);
  const origin = url.origin;
  const state = newState();
  const pkce = newPkce();
  const nonce = newNonce();
  const next = parseGoogleNext(url.searchParams.get("next"));
  const location = authorizeUrl({
    clientId,
    origin,
    state,
    codeChallenge: pkce.challenge,
    nonce,
  });
  const secure = origin.startsWith("https:");
  const bind = next === "/"
    ? { state, verifier: pkce.verifier, nonce }
    : { state, verifier: pkce.verifier, nonce, next };
  return new Response(null, {
    status: 302,
    headers: {
      Location: location,
      "Set-Cookie": stateCookie(encodeOAuthBind(bind), secure),
    },
  });
}
